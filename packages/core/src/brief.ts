import {
  PLAIN_GRADE_LABELS,
  PLAIN_OWNER_LABELS,
  PLAIN_PILLAR_NAMES,
  plainCopyFor,
  plainGradeSummary,
} from "./plain-language";
import type { PlainCopyContext, PlainOwner } from "./plain-language";
import type { AuditReport, AuditReportCheck } from "./report";
import { compareFixPriority } from "./score";
import { siteTypeById } from "./site-types";
import type { AuditGrade, CheckEvidence, CheckFix, PillarId } from "./types";

/**
 * A plain-language view of an audit report: what is wrong, why it matters
 * and what to ask a developer for. Built from `AuditReport` so the web app,
 * CLI and GitHub Action share one path.
 */

export interface PlainIssue {
  id: string;
  pillarId: PillarId;
  /** Plain pillar name, e.g. "Being read". */
  area: string;
  status: "warn" | "fail";
  title: string;
  problem: string;
  why: string;
  good: string;
  owner: PlainOwner;
  asks: string[];
  /** "Whole site", "This page" or "3 of 8 sampled pages". */
  affects: string;
  /** Up to five page URLs that need the change. */
  pages: string[];
  weight: number;
  technical: {
    label: string;
    summary: string;
    recommendation?: string;
    evidence?: CheckEvidence;
    fix?: CheckFix;
  };
}

export interface PlainBrief {
  domain: string;
  url: string;
  timestamp: string;
  score: number;
  grade: AuditGrade;
  gradeLabel: string;
  summary: string;
  mustFix: PlainIssue[];
  improve: PlainIssue[];
  working: { id: string; title: string }[];
}

export interface ChangeRequestOptions {
  /** Add check ids, evidence and fix snippets for the developer. */
  includeTechnical?: boolean;
  /** Only include these check ids. Defaults to every issue. */
  selectedIds?: readonly string[];
  /** Link to the full technical report. */
  reportUrl?: string;
  /** HTML comment used to find and update a sticky GitHub comment. */
  marker?: string;
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url.replace(/\/+$/, "");
  }
}

/** "SaaS / product" stays as is; "Documentation" reads as "documentation" mid-sentence. */
function profileLabel(label: string): string {
  if (label.length > 1 && label[1] === label[1].toLowerCase()) {
    return label[0].toLowerCase() + label.slice(1);
  }
  return label;
}

function affectsFor(check: AuditReportCheck): string {
  if (check.scope !== "page") return "Whole site";
  if (!check.sample) return "This page";
  const { total, passed } = check.sample;
  return `${total - passed} of ${total} sampled ${total === 1 ? "page" : "pages"}`;
}

export function buildPlainBrief(report: AuditReport): PlainBrief {
  const profile = siteTypeById(report.siteType);
  const context: PlainCopyContext = {
    origin: originOf(report.finalUrl || report.url),
    profile: profileLabel(profile.label),
    schema: profile.recommendedSchema,
  };

  const issues: PlainIssue[] = [];
  const working: PlainBrief["working"] = [];

  for (const check of report.checks) {
    const copy = plainCopyFor(check, context);
    if (check.status === "pass") {
      working.push({ id: check.id, title: copy.title });
      continue;
    }
    if (check.status !== "warn" && check.status !== "fail") continue;

    issues.push({
      id: check.id,
      pillarId: check.pillar,
      area: PLAIN_PILLAR_NAMES[check.pillar] ?? check.pillarName,
      status: check.status,
      title: copy.title,
      problem: copy.problem,
      why: copy.why,
      good: copy.good,
      owner: copy.owner,
      asks: copy.asks,
      affects: affectsFor(check),
      pages: check.sample?.affected ?? [],
      weight: check.weight,
      technical: {
        label: check.label,
        summary: check.summary,
        recommendation: check.recommendation,
        evidence: check.evidence,
        fix: check.fix,
      },
    });
  }

  issues.sort(compareFixPriority);
  const mustFix = issues.filter((issue) => issue.status === "fail");
  const improve = issues.filter((issue) => issue.status === "warn");

  return {
    domain: report.domain,
    url: report.finalUrl || report.url,
    timestamp: report.timestamp,
    score: report.score,
    grade: report.grade,
    gradeLabel: PLAIN_GRADE_LABELS[report.grade],
    summary: plainGradeSummary(report.grade, {
      mustFix: mustFix.length,
      improve: improve.length,
    }),
    mustFix,
    improve,
    working,
  };
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fence(code: string): string {
  return code.includes("```") ? "~~~~" : "```";
}

function evidenceLine(evidence: CheckEvidence): string {
  return evidence.line ? `${evidence.file} line ${evidence.line}` : evidence.file;
}

function renderIssue(issue: PlainIssue, index: number, includeTechnical: boolean): string[] {
  const lines = [`### ${index}. ${issue.title}`, "", issue.problem, ""];

  if (issue.asks.length > 0) {
    lines.push("What we need:", ...issue.asks.map((ask) => `- ${ask}`), "");
  }

  lines.push(`Affects: ${issue.affects}. Usually handled by: ${PLAIN_OWNER_LABELS[issue.owner]}.`);
  if (issue.pages.length > 0) {
    lines.push(`Example pages: ${issue.pages.join(", ")}`);
  }
  lines.push("");

  if (includeTechnical) {
    const reference = [`\`${issue.id}\``, issue.technical.label];
    if (issue.technical.evidence) reference.push(evidenceLine(issue.technical.evidence));
    lines.push(`Technical reference: ${reference.join(", ")}. Found: ${issue.technical.summary}.`);
    if (issue.technical.recommendation) {
      lines.push(`Recommendation: ${issue.technical.recommendation}`);
    }
    if (issue.technical.fix) {
      const marks = fence(issue.technical.fix.code);
      lines.push(
        "",
        `${marks}${issue.technical.fix.language}`,
        issue.technical.fix.code.trimEnd(),
        marks,
      );
    }
    lines.push("");
  }

  return lines;
}

/**
 * Renders the change requests as markdown that also reads cleanly as plain
 * text, so it pastes into a ticket, an email or a chat message.
 */
export function renderChangeRequests(
  brief: PlainBrief,
  options: ChangeRequestOptions = {},
): string {
  const { includeTechnical = false, selectedIds, reportUrl, marker } = options;
  const selected = selectedIds ? new Set(selectedIds) : null;
  const keep = (issue: PlainIssue) => !selected || selected.has(issue.id);
  const mustFix = brief.mustFix.filter(keep);
  const improve = brief.improve.filter(keep);

  const lines: string[] = [];
  if (marker) lines.push(`<!-- ${marker} -->`, "");

  lines.push(`# Change requests for ${brief.domain}`, "");
  lines.push(
    `Audit of ${brief.url} on ${formatDate(brief.timestamp)}. Score ${brief.score}/100, grade ${brief.grade} (${brief.gradeLabel.toLowerCase()}).`,
    "",
    brief.summary,
    "",
  );

  if (mustFix.length === 0 && improve.length === 0) {
    lines.push("No changes requested.", "");
  }

  let index = 1;
  if (mustFix.length > 0) {
    lines.push(`## Must fix (${mustFix.length})`, "");
    for (const issue of mustFix) lines.push(...renderIssue(issue, index++, includeTechnical));
  }
  if (improve.length > 0) {
    lines.push(`## Worth improving (${improve.length})`, "");
    for (const issue of improve) lines.push(...renderIssue(issue, index++, includeTechnical));
  }

  const footer = ["Generated by LLM SEO Toolbox (https://github.com/ABradwell/llm-seo-toolbox)."];
  if (reportUrl) footer.push(`Full technical report: ${reportUrl}`);
  lines.push(footer.join(" "));

  return `${lines.join("\n").trim()}\n`;
}
