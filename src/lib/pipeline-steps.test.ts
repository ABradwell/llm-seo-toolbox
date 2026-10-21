import { describe, expect, it } from "vitest";

import type { AuditCheck, AuditPillar, AuditResult, DiscoveryFile } from "@/types/audit";

import { PIPELINE_PHASES, PIPELINE_STEPS, PIPELINE_TOTAL_MS, stepForError } from "./pipeline-steps";

function check(status: AuditCheck["status"]): AuditCheck {
  return { id: `check-${status}`, label: status, status, summary: "", detail: "", weight: 1 };
}

function pillar(id: AuditPillar["id"], checks: AuditCheck[]): AuditPillar {
  return { id, name: id, shortName: id, description: "", score: 80, checks };
}

function file(id: string, found: boolean): DiscoveryFile {
  return {
    id,
    label: id,
    path: `/${id}`,
    url: "",
    found,
    statusCode: found ? 200 : 404,
    bytes: 0,
    note: "",
  };
}

const audit = {
  url: "https://example.com/",
  finalUrl: "https://example.com/",
  domain: "example.com",
  score: 84,
  grade: "B",
  pillars: [
    pillar("discovery", [check("pass"), check("pass"), check("warn"), check("info")]),
    pillar("access", [check("pass")]),
    pillar("parseability", [check("fail"), check("pass")]),
    pillar("structured", [check("pass"), check("pass")]),
  ],
  classification: {
    type: "saas",
    label: "SaaS",
    confidence: 82,
    method: "heuristic",
    signals: [
      {
        type: "saas",
        label: "Structured data · SoftwareApplication",
        detail: "",
        weight: 8,
        source: "structured-data",
      },
      { type: "saas", label: "URL · /pricing", detail: "", weight: 6, source: "url" },
      {
        type: "saas",
        label: "Hostname · app.example.com",
        detail: "",
        weight: 4,
        source: "hostname",
      },
    ],
  },
  files: [
    file("llms-txt", true),
    file("llms-full-txt", false),
    file("sitemap", true),
    file("robots-txt", true),
    file("openapi", false),
    file("well-known", false),
  ],
  pages: [
    { url: "", label: "", section: "", source: "sitemap" },
    { url: "", label: "", section: "", source: "sitemap" },
    { url: "", label: "", section: "", source: "home" },
  ],
  vision: { htmlBytes: 2_048 },
  meta: { cached: false },
} as unknown as AuditResult;

function resultFor(id: string) {
  const step = PIPELINE_STEPS.find((candidate) => candidate.id === id);
  if (!step) throw new Error(`No step ${id}`);
  return step.result(audit);
}

describe("pipeline steps", () => {
  it("lays steps end to end across three phases", () => {
    expect(PIPELINE_PHASES.map((phase) => phase.title)).toEqual([
      "Collecting site",
      "Classifying site",
      "Analyzing LLM compatibility",
    ]);
    expect(PIPELINE_STEPS).toHaveLength(13);
    expect(new Set(PIPELINE_STEPS.map((step) => step.id)).size).toBe(13);
    const last = PIPELINE_STEPS.at(-1)!;
    expect(last.start + last.ms).toBe(PIPELINE_TOTAL_MS);
  });

  it("reads collection results from the audit", () => {
    expect(resultFor("validate-url")).toBe("https · example.com");
    expect(resultFor("fetch-home")).toBe("2.0 KB HTML");
    expect(resultFor("fetch-discovery")).toBe("2 of 3 found");
    expect(resultFor("read-sitemap")).toBe("2 URLs sampled");
    expect(PIPELINE_PHASES[0].summary(audit)).toBe("3 of 6 files found");
  });

  it("reads classification results from the audit", () => {
    expect(resultFor("inspect-json-ld")).toBe("SoftwareApplication");
    expect(resultFor("scan-routes")).toBe("2 signals");
    expect(resultFor("check-meta")).toBe("no signals");
    expect(resultFor("assign-profile")).toBe("SaaS · 82%");
  });

  it("marks a pinned profile instead of a confidence", () => {
    const pinned = {
      ...audit,
      classification: { ...audit.classification, method: "override" },
    } as AuditResult;
    expect(PIPELINE_PHASES[1].summary(pinned)).toBe("SaaS · pinned");
  });

  it("counts passing checks per pillar, ignoring info checks", () => {
    expect(resultFor("pillar-discovery")).toBe("2 of 3 pass");
    expect(resultFor("pillar-parseability")).toBe("1 of 2 pass");
    expect(resultFor("score")).toBe("84 · grade B");
    expect(PIPELINE_PHASES[2].summary(audit)).toBe("score 84 · B");
  });

  it("maps API error codes to the step that owns them", () => {
    expect(stepForError("blocked_url")).toBe("validate-url");
    expect(stepForError("not_html")).toBe("fetch-home");
    expect(stepForError("rate_limited")).toBeNull();
    expect(stepForError(undefined)).toBeNull();
  });
});
