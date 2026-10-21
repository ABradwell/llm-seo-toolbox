import type { AuditPillar, AuditResult, ClassificationSignalSource, PillarId } from "@/types/audit";

import { formatBytes, formatNumber } from "./utils";

/**
 * The compatibility pipeline as the visitor sees it while an audit runs.
 * Every step names work `analyzeSite` actually performs, and every result
 * is read from the finished `AuditResult`, never invented.
 */

export type PipelinePhaseId = "collect" | "classify" | "analyze";

export interface PipelineStepDefinition {
  id: string;
  label: string;
  /** Nominal on-screen duration before the response arrives. */
  ms: number;
  result: (audit: AuditResult) => string;
}

export interface PipelinePhase {
  id: PipelinePhaseId;
  title: string;
  steps: readonly PipelineStepDefinition[];
  /** One line shown once the phase folds closed. */
  summary: (audit: AuditResult) => string;
}

export interface PipelineStep extends PipelineStepDefinition {
  phaseIndex: number;
  /** Offset from the start of the sequence, in nominal milliseconds. */
  start: number;
}

function protocolOf(url: string): string {
  try {
    return new URL(url).protocol.replace(":", "");
  } catch {
    return "http";
  }
}

function discoveryResult(audit: AuditResult): string {
  const ids = ["robots-txt", "llms-txt", "llms-full-txt"];
  const files = audit.files.filter((file) => ids.includes(file.id));
  const found = files.filter((file) => file.found).length;
  return `${found} of ${files.length} found`;
}

function signalsFrom(audit: AuditResult, sources: ClassificationSignalSource[]): string {
  const matches = audit.classification.signals.filter((signal) => sources.includes(signal.source));
  if (matches.length === 0) return "no signals";
  return matches.length === 1 ? "1 signal" : `${matches.length} signals`;
}

function structuredTypes(audit: AuditResult): string {
  const types = audit.classification.signals
    .filter((signal) => signal.source === "structured-data")
    .map((signal) => signal.label.split(" · ").pop() ?? signal.label);
  return types.length > 0 ? [...new Set(types)].slice(0, 2).join(", ") : "no types";
}

function profileLabel(audit: AuditResult): string {
  const { classification } = audit;
  return classification.method === "override"
    ? `${classification.label} · pinned`
    : `${classification.label} · ${classification.confidence}%`;
}

function pillarResult(id: PillarId) {
  return (audit: AuditResult): string => {
    const pillar = audit.pillars.find((candidate: AuditPillar) => candidate.id === id);
    if (!pillar) return "skipped";
    const scored = pillar.checks.filter((check) => check.status !== "info");
    const passed = scored.filter((check) => check.status === "pass").length;
    return `${passed} of ${scored.length} pass`;
  };
}

export const PIPELINE_PHASES: readonly PipelinePhase[] = [
  {
    id: "collect",
    title: "Collecting site",
    summary: (audit) => {
      const found = audit.files.filter((file) => file.found).length;
      return `${found} of ${audit.files.length} files found`;
    },
    steps: [
      {
        id: "validate-url",
        label: "Validating URL",
        ms: 350,
        result: (audit) => `${protocolOf(audit.finalUrl)} · ${audit.domain}`,
      },
      {
        id: "fetch-home",
        label: "Fetching homepage HTML",
        ms: 500,
        result: (audit) => `${formatBytes(audit.vision.htmlBytes)} HTML`,
      },
      {
        id: "fetch-discovery",
        label: "Requesting robots.txt, llms.txt, llms-full.txt",
        ms: 450,
        result: discoveryResult,
      },
      {
        id: "read-sitemap",
        label: "Reading sitemap.xml",
        ms: 400,
        result: (audit) => {
          const sitemap = audit.files.find((file) => file.id === "sitemap");
          if (!sitemap?.found) return "not found";
          const sampled = audit.pages.filter((page) => page.source === "sitemap").length;
          return `${formatNumber(sampled)} URLs sampled`;
        },
      },
    ],
  },
  {
    id: "classify",
    title: "Classifying site",
    summary: profileLabel,
    steps: [
      {
        id: "inspect-json-ld",
        label: "Inspecting JSON-LD types",
        ms: 300,
        result: structuredTypes,
      },
      {
        id: "scan-routes",
        label: "Scanning routes and DOM",
        ms: 350,
        result: (audit) => signalsFrom(audit, ["url", "hostname", "markup", "manifest"]),
      },
      {
        id: "check-meta",
        label: "Checking meta and OpenGraph",
        ms: 250,
        result: (audit) => signalsFrom(audit, ["metadata"]),
      },
      {
        id: "assign-profile",
        label: "Assigning site profile",
        ms: 400,
        result: profileLabel,
      },
    ],
  },
  {
    id: "analyze",
    title: "Analyzing LLM compatibility",
    summary: (audit) => `score ${audit.score} · ${audit.grade}`,
    steps: [
      {
        id: "pillar-discovery",
        label: "Discovery and manifests",
        ms: 400,
        result: pillarResult("discovery"),
      },
      {
        id: "pillar-access",
        label: "Crawler access (RFC 9309)",
        ms: 400,
        result: pillarResult("access"),
      },
      {
        id: "pillar-parseability",
        label: "Static parseability and SNR",
        ms: 450,
        result: pillarResult("parseability"),
      },
      {
        id: "pillar-structured",
        label: "Structured machine interfaces",
        ms: 400,
        result: pillarResult("structured"),
      },
      {
        id: "score",
        label: "Scoring",
        ms: 400,
        result: (audit) => `${audit.score} · grade ${audit.grade}`,
      },
    ],
  },
];

export const PIPELINE_STEPS: readonly PipelineStep[] = (() => {
  const steps: PipelineStep[] = [];
  let start = 0;
  PIPELINE_PHASES.forEach((phase, phaseIndex) => {
    for (const step of phase.steps) {
      steps.push({ ...step, phaseIndex, start });
      start += step.ms;
    }
  });
  return steps;
})();

export const PIPELINE_TOTAL_MS = PIPELINE_STEPS.reduce((total, step) => total + step.ms, 0);

/** Which step an API error code belongs to. Unlisted codes have no step. */
const ERROR_STEPS: Record<string, string> = {
  missing_url: "validate-url",
  invalid_url: "validate-url",
  invalid_site_type: "validate-url",
  blocked_url: "validate-url",
  fetch_failed: "fetch-home",
  http_error: "fetch-home",
  not_html: "fetch-home",
};

export function stepForError(code: string | undefined): string | null {
  return code ? (ERROR_STEPS[code] ?? null) : null;
}
