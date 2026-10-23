import { gradeFor, statusScore } from "./score";
import type {
  AuditCheck,
  AuditFix,
  AuditGrade,
  AuditPage,
  AuditPillar,
  AuditResult,
  ClassificationSignal,
  DiscoveryFile,
  PillarId,
  SiteClassification,
  SiteType,
  VisionPayload,
} from "./types";

export const REPORT_PILLAR_ORDER: readonly PillarId[] = [
  "discovery",
  "access",
  "parseability",
  "structured",
];

export interface ThresholdOptions {
  minScore?: number;
  minGrade?: AuditGrade;
}

export interface ThresholdResult {
  minScore: number;
  minGrade: AuditGrade;
  scorePassed: boolean;
  gradePassed: boolean;
  passed: boolean;
}

export interface AuditReportCheck {
  id: string;
  label: string;
  pillar: PillarId;
  pillarName: string;
  status: AuditCheck["status"];
  score: number | null;
  weight: number;
  summary: string;
  detail: string;
  recommendation?: string;
  protocol?: string;
  evidence?: AuditCheck["evidence"];
  fix?: AuditCheck["fix"];
  /** Whether the check describes the origin or sampled pages. */
  scope?: AuditCheck["scope"];
  /** Coverage across sampled pages, for aggregated page checks. */
  sample?: AuditCheck["sample"];
}

export interface AuditReportPillar {
  id: PillarId;
  name: string;
  shortName: string;
  score: number;
  status: "pass" | "warn" | "fail";
  description: string;
}

export interface AuditReport {
  url: string;
  finalUrl: string;
  domain: string;
  timestamp: string;
  siteType: SiteType;
  detectedType: SiteType;
  classification: SiteClassification;
  score: number;
  grade: AuditGrade;
  gradeLabel: string;
  passed?: boolean;
  thresholds?: ThresholdResult;
  pillars: Record<PillarId, AuditReportPillar>;
  checks: AuditReportCheck[];
  fixes: AuditFix[];
  files: DiscoveryFile[];
  pages: AuditPage[];
  vision: Pick<
    VisionPayload,
    | "htmlBytes"
    | "markdownBytes"
    | "textBytes"
    | "reductionPct"
    | "tokenEstimate"
    | "removed"
    | "rawTruncated"
    | "markdownTruncated"
  >;
  meta: AuditResult["meta"];
}

export interface MarkdownReportOptions {
  /** HTML comment used to find and update a sticky GitHub comment. */
  marker?: string;
  title?: string;
  /** Include the per-check detail table. Defaults to true. */
  includeDetails?: boolean;
  /** Include the prioritized fix list. Defaults to true. */
  includeFixes?: boolean;
  /** Link shown in the footer, e.g. the workflow run. */
  runUrl?: string;
}

const GRADE_RANK: Record<AuditGrade, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 };

export function gradeRank(grade: AuditGrade): number {
  return GRADE_RANK[grade] ?? 0;
}

export function evaluateThresholds(
  score: number,
  grade: AuditGrade,
  options: ThresholdOptions = {},
): ThresholdResult {
  const minScore = options.minScore ?? 0;
  const minGrade = options.minGrade ?? "F";

  return {
    minScore,
    minGrade,
    scorePassed: score >= minScore,
    gradePassed: gradeRank(grade) >= gradeRank(minGrade),
    passed: score >= minScore && gradeRank(grade) >= gradeRank(minGrade),
  };
}

export function statusForScore(score: number): "pass" | "warn" | "fail" {
  if (score >= 75) return "pass";
  if (score >= 50) return "warn";
  return "fail";
}

function reportPillar(pillar: AuditPillar): AuditReportPillar {
  return {
    id: pillar.id,
    name: pillar.name,
    shortName: pillar.shortName,
    score: pillar.score,
    status: statusForScore(pillar.score),
    description: pillar.description,
  };
}

function reportCheck(pillar: AuditPillar, check: AuditCheck): AuditReportCheck {
  return {
    id: check.id,
    label: check.label,
    pillar: pillar.id,
    pillarName: pillar.name,
    status: check.status,
    score: statusScore(check.status),
    weight: check.weight,
    summary: check.summary,
    detail: check.detail,
    recommendation: check.recommendation,
    protocol: check.protocol,
    evidence: check.evidence,
    fix: check.fix,
    scope: check.scope,
    ...(check.sample ? { sample: check.sample } : {}),
  };
}

export function buildReport(result: AuditResult, thresholds?: ThresholdOptions): AuditReport {
  const pillars = Object.fromEntries(
    result.pillars.map((pillar) => [pillar.id, reportPillar(pillar)]),
  ) as Record<PillarId, AuditReportPillar>;

  const checks = result.pillars.flatMap((pillar) =>
    pillar.checks.map((entry) => reportCheck(pillar, entry)),
  );

  const gate =
    thresholds === undefined
      ? undefined
      : evaluateThresholds(result.score, result.grade, thresholds);

  return {
    url: result.url,
    finalUrl: result.finalUrl,
    domain: result.domain,
    timestamp: result.meta.crawledAt,
    siteType: result.classification.type,
    detectedType: result.classification.detected.type,
    classification: result.classification,
    score: result.score,
    grade: result.grade,
    gradeLabel: gradeFor(result.score).label,
    ...(gate ? { passed: gate.passed, thresholds: gate } : {}),
    pillars,
    checks,
    fixes: result.fixes,
    files: result.files,
    pages: result.pages,
    vision: {
      htmlBytes: result.vision.htmlBytes,
      markdownBytes: result.vision.markdownBytes,
      textBytes: result.vision.textBytes,
      reductionPct: result.vision.reductionPct,
      tokenEstimate: result.vision.tokenEstimate,
      removed: result.vision.removed,
      rawTruncated: result.vision.rawTruncated,
      markdownTruncated: result.vision.markdownTruncated,
    },
    meta: result.meta,
  };
}

const STATUS_EMOJI: Record<AuditCheck["status"], string> = {
  pass: "✅",
  warn: "⚠️",
  fail: "❌",
  info: "ℹ️",
};

const STATUS_LABEL: Record<AuditCheck["status"], string> = {
  pass: "Pass",
  warn: "Warn",
  fail: "Fail",
  info: "Info",
};

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

function inlineCode(value: string): string {
  const ticks = value.includes("`") ? "``" : "`";
  return `${ticks}${value}${ticks}`;
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return `${parsed.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function metricRow(label: string, result: string, target: string, passed: boolean): string {
  return `| **${label}** | ${result} | ${target} | ${passed ? "✅ Pass" : "❌ Fail"} |`;
}

function signalLine(signal: ClassificationSignal): string {
  return `- ${signal.label}: ${signal.detail}`;
}

/**
 * Renders a report that works as a terminal markdown dump and as a sticky
 * GitHub pull request comment. It never invents findings: every row comes
 * from the audit payload.
 */
export function renderMarkdownReport(
  report: AuditReport,
  options: MarkdownReportOptions = {},
): string {
  const {
    marker,
    title = "LLM SEO Toolbox audit",
    includeDetails = true,
    includeFixes = true,
    runUrl,
  } = options;

  const gate = report.thresholds;
  const passed = report.passed ?? gate?.passed ?? true;
  const headingIcon = passed ? "✅" : "❌";
  const lines: string[] = [];

  if (marker) lines.push(`<!-- ${marker} -->`, "");

  lines.push(`## ${headingIcon} ${title}`, "");
  lines.push(`[${report.finalUrl}](${report.finalUrl}) · ${formatTimestamp(report.timestamp)}`, "");

  if (gate) {
    lines.push("| Metric | Result | Threshold | Status |", "| :--- | :--- | :--- | :--- |");
    lines.push(
      metricRow(
        "Composite score",
        `**${report.score} / 100**`,
        `≥ ${gate.minScore}`,
        gate.scorePassed,
      ),
    );
    lines.push(
      metricRow(
        "Grade",
        `**${report.grade}** · ${report.gradeLabel}`,
        `≥ ${gate.minGrade}`,
        gate.gradePassed,
      ),
    );
    const override = report.classification.method === "override";
    lines.push(
      `| **Detected type** | ${inlineCode(report.detectedType)} | ${
        override ? `pinned as ${inlineCode(report.siteType)}` : "auto"
      } | ℹ️ Info |`,
    );
    lines.push("");
  } else {
    lines.push(`**${report.score} / 100** · Grade **${report.grade}** · ${report.gradeLabel}`, "");
  }

  lines.push("### Pillars", "");
  lines.push("| Pillar | Score | Status |", "| :--- | ---: | :--- |");
  for (const id of REPORT_PILLAR_ORDER) {
    const pillar = report.pillars[id];
    if (!pillar) continue;
    lines.push(
      `| **${escapeCell(pillar.name)}** | ${pillar.score}/100 | ${STATUS_EMOJI[pillar.status]} ${STATUS_LABEL[pillar.status]} |`,
    );
  }
  lines.push("");

  const counts = {
    pass: report.checks.filter((check) => check.status === "pass").length,
    warn: report.checks.filter((check) => check.status === "warn").length,
    fail: report.checks.filter((check) => check.status === "fail").length,
    info: report.checks.filter((check) => check.status === "info").length,
  };
  lines.push(
    `${counts.pass} passed · ${counts.warn} warnings · ${counts.fail} failed${
      counts.info > 0 ? ` · ${counts.info} informational` : ""
    }`,
    "",
  );

  if (includeFixes && report.fixes.length > 0) {
    lines.push("### Fix first", "");
    report.fixes.slice(0, 5).forEach((entry, index) => {
      lines.push(
        `${index + 1}. **${entry.label}** (${entry.pillarName}) — ${entry.recommendation}`,
      );
    });
    lines.push("");
  }

  if (includeDetails) {
    lines.push(
      "<details>",
      `<summary>🔍 View all ${report.checks.length} check findings</summary>`,
      "",
      "| Check | Pillar | Status | Observed |",
      "| :--- | :--- | :--- | :--- |",
    );
    for (const check of report.checks) {
      lines.push(
        `| ${escapeCell(check.label)} | ${escapeCell(check.pillarName)} | ${
          STATUS_EMOJI[check.status]
        } ${STATUS_LABEL[check.status]} | ${escapeCell(check.summary)} |`,
      );
    }
    lines.push("", "</details>", "");
  }

  if (report.classification.signals.length > 0) {
    lines.push("<details>", "<summary>🧭 Classification signals</summary>", "");
    lines.push(
      `Detected **${report.classification.detected.label}** with ${report.classification.detected.confidence}% confidence.`,
      "",
    );
    for (const signal of report.classification.signals) {
      lines.push(signalLine(signal));
    }
    lines.push("", "</details>", "");
  }

  const footer: string[] = [];
  footer.push("*Generated by [LLM SEO Toolbox](https://github.com/ABradwell/llm-seo-toolbox).*");
  if (runUrl) footer.push(`[Workflow run](${runUrl})`);
  lines.push(footer.join(" · "));

  return `${lines.join("\n").trim()}\n`;
}

export function shortStatus(report: AuditReport): string {
  return `${report.score}/100 · ${report.grade} · ${report.gradeLabel}`;
}
