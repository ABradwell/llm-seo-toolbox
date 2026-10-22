import { scoreAudit } from "./score";
import { siteTypeById } from "./site-types";
import type { AuditCheck, AuditPillar, AuditResult, CheckStatus } from "./types";

function check(id: string, status: CheckStatus, weight = 1): AuditCheck {
  return {
    id,
    label: id === "llms-txt" ? "llms.txt | manifest" : id,
    status,
    summary: `${id} summary`,
    detail: `${id} detail`,
    recommendation: status === "pass" ? undefined : `Fix ${id}.`,
    weight,
  };
}

const PILLARS: AuditPillar[] = [
  {
    id: "discovery",
    name: "Discovery & Manifests",
    shortName: "Discovery",
    description: "Can an agent find a curated index?",
    score: 100,
    checks: [check("llms-txt", "pass", 3)],
  },
  {
    id: "access",
    name: "Crawler Access Rules",
    shortName: "Access",
    description: "Are AI user agents allowed in?",
    score: 50,
    checks: [check("bot-bytespider", "warn", 2), check("meta-robots", "pass")],
  },
  {
    id: "parseability",
    name: "Static Parseability",
    shortName: "Parse",
    description: "Does the first response read like a document?",
    score: 0,
    checks: [check("h1", "fail", 1.5)],
  },
  {
    id: "structured",
    name: "Structured Machine Interfaces",
    shortName: "Schema",
    description: "Can agents classify the page?",
    score: 100,
    checks: [check("json-ld", "pass", 2.5)],
  },
];

export function auditFixture(): AuditResult {
  const score = scoreAudit(PILLARS);
  return {
    url: "https://example.com/",
    finalUrl: "https://example.com/",
    domain: "example.com",
    score,
    grade: "C",
    gradeLabel: "Needs work",
    pillars: PILLARS,
    classification: {
      type: "saas",
      label: siteTypeById("saas").label,
      confidence: 77,
      method: "heuristic",
      detected: { type: "saas", label: siteTypeById("saas").label, confidence: 77 },
      signals: [
        {
          type: "saas",
          label: "Structured data · SoftwareApplication",
          detail: "JSON-LD declares SoftwareApplication.",
          weight: 18,
          source: "structured-data",
        },
      ],
      compatibility: {
        openApiScored: true,
        recommendedSchema: ["SoftwareApplication", "WebApplication", "FAQPage"],
        note: "OpenAPI is scored.",
      },
    },
    profile: {
      url: "https://example.com/",
      finalUrl: "https://example.com/",
      domain: "example.com",
      title: "Example",
      description: "An example site.",
      siteName: "Example",
      language: "en",
    },
    pages: [{ url: "https://example.com/", label: "Home", section: "Home", source: "home" }],
    files: [
      {
        id: "llms-txt",
        label: "llms.txt",
        path: "/llms.txt",
        url: "https://example.com/llms.txt",
        found: true,
        statusCode: 200,
        bytes: 1200,
        note: "Published",
      },
    ],
    vision: {
      rawHtml: "<html></html>",
      markdown: "# Example",
      htmlBytes: 1000,
      markdownBytes: 100,
      textBytes: 90,
      reductionPct: 90,
      tokenEstimate: { html: 250, markdown: 25 },
      removed: { scripts: 1, styles: 0, landmarks: 0, svg: 0, frames: 0 },
      rawTruncated: false,
      markdownTruncated: false,
    },
    fixes: [
      {
        checkId: "h1",
        pillarId: "parseability",
        pillarName: "Parse",
        label: "h1",
        status: "fail",
        summary: "h1 summary",
        recommendation: "Fix h1.",
      },
    ],
    meta: {
      fetchMs: 800,
      pageCount: 1,
      crawledAt: "2026-10-21T12:00:00.000Z",
      cached: false,
    },
  };
}
