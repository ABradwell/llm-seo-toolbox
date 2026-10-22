import type { AuditCheck, PageAuditResult, PageSampleSummary } from "./types";

import { statusScore } from "./score";

export interface PageCheckGroups {
  access: {
    metaRobots: AuditCheck;
    xRobotsTag: AuditCheck;
  };
  parseability: AuditCheck[];
  structured: AuditCheck[];
}

const ACCESS_IDS = ["meta-robots", "x-robots-tag"] as const;
const PARSEABILITY_IDS = ["h1", "heading-order", "snr", "ssr-content"] as const;
const STRUCTURED_IDS = ["json-ld", "schema-types"] as const;

/**
 * Aggregate one check across sampled pages by mean status score.
 * A 7/8 pass rate becomes 88 and a warning, not a 50-point binary warning.
 */
export function aggregatePageChecks(pages: PageAuditResult[]): PageCheckGroups {
  const analyzed = pages.filter((page) => page.outcome === "analyzed");
  const allIds = [...ACCESS_IDS, ...PARSEABILITY_IDS, ...STRUCTURED_IDS];
  const aggregated = new Map<string, AuditCheck>();

  for (const id of allIds) {
    aggregated.set(id, aggregateCheck(id, analyzed));
  }

  return groupsFromMap(aggregated);
}

/** Use one page's checks directly. This preserves the old page-scope display. */
export function directPageChecks(page: PageAuditResult): PageCheckGroups {
  const map = new Map(page.checks.map((check) => [check.id, check]));
  return groupsFromMap(map);
}

function groupsFromMap(map: Map<string, AuditCheck>): PageCheckGroups {
  return {
    access: {
      metaRobots: map.get("meta-robots") ?? missingCheck("meta-robots", "robots meta directives"),
      xRobotsTag: map.get("x-robots-tag") ?? missingCheck("x-robots-tag", "X-Robots-Tag header"),
    },
    parseability: PARSEABILITY_IDS.map((id) => map.get(id) ?? missingCheck(id, fallbackLabel(id))),
    structured: STRUCTURED_IDS.map((id) => map.get(id) ?? missingCheck(id, fallbackLabel(id))),
  };
}

function aggregateCheck(id: string, pages: PageAuditResult[]): AuditCheck {
  const observations = pages
    .map((page) => ({
      page,
      check: page.checks.find((candidate) => candidate.id === id),
    }))
    .filter((entry): entry is { page: PageAuditResult; check: AuditCheck } => Boolean(entry.check));

  if (observations.length === 0) {
    return missingCheck(id, fallbackLabel(id));
  }

  const template = observations[0].check;
  const scores = observations
    .map((entry) => statusScore(entry.check.status))
    .filter((value): value is number => value !== null);

  if (scores.length === 0) return missingCheck(id, template.label);

  const score = Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length);
  const passed = observations.filter((entry) => entry.check.status === "pass").length;
  const warned = observations.filter((entry) => entry.check.status === "warn").length;
  const failed = observations.filter((entry) => entry.check.status === "fail").length;
  const affected = observations
    .filter((entry) => entry.check.status !== "pass")
    .map((entry) => entry.page.url)
    .slice(0, 5);

  const sample: PageSampleSummary = {
    total: observations.length,
    passed,
    warned,
    failed,
    affected,
  };

  const status = score >= 90 ? "pass" : score >= 50 ? "warn" : "fail";
  const failing = observations.find((entry) => entry.check.status !== "pass");
  const detailParts = [
    `${passed} of ${observations.length} sampled pages pass`,
    warned > 0 ? `${warned} warn` : null,
    failed > 0 ? `${failed} fail` : null,
  ].filter(Boolean);

  return {
    ...template,
    status,
    score,
    scope: "page",
    summary: `${passed} / ${observations.length} pages pass`,
    detail: `${detailParts.join(" · ")}.${affected.length > 0 ? ` Failing pages: ${affected.join(", ")}.` : ""}`,
    evidence: failing?.check.evidence ?? template.evidence,
    sample,
  };
}

function missingCheck(id: string, label: string): AuditCheck {
  return {
    id,
    label,
    status: "info",
    summary: "No pages analyzed",
    detail: "No sampled page produced an observation for this check.",
    weight: 1,
    scope: "page",
  };
}

function fallbackLabel(id: string): string {
  switch (id) {
    case "meta-robots":
      return "robots meta directives";
    case "x-robots-tag":
      return "X-Robots-Tag header";
    case "h1":
      return "Single H1";
    case "heading-order":
      return "Heading sequence";
    case "snr":
      return "Static HTML signal-to-noise";
    case "ssr-content":
      return "SSR payload readability";
    case "json-ld":
      return "JSON-LD presence & syntax";
    case "schema-types":
      return "Profile schema types";
    default:
      return id;
  }
}
