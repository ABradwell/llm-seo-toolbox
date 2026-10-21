import { describe, expect, it } from "vitest";

import { auditFixture } from "./fixtures";
import {
  buildReport,
  evaluateThresholds,
  gradeRank,
  renderMarkdownReport,
  statusForScore,
} from "./report";

describe("evaluateThresholds", () => {
  it("passes when both score and grade meet the minimums", () => {
    const result = evaluateThresholds(88, "B", { minScore: 75, minGrade: "B" });
    expect(result.passed).toBe(true);
    expect(result.scorePassed).toBe(true);
    expect(result.gradePassed).toBe(true);
  });

  it("fails when the score is below the minimum", () => {
    const result = evaluateThresholds(74, "A", { minScore: 75, minGrade: "B" });
    expect(result.passed).toBe(false);
    expect(result.scorePassed).toBe(false);
    expect(result.gradePassed).toBe(true);
  });

  it("fails when the grade is below the minimum even if the score is high", () => {
    const result = evaluateThresholds(90, "C", { minScore: 75, minGrade: "B" });
    expect(result.passed).toBe(false);
    expect(result.scorePassed).toBe(true);
    expect(result.gradePassed).toBe(false);
  });

  it("defaults to score 0 and grade F", () => {
    const result = evaluateThresholds(0, "F");
    expect(result.passed).toBe(true);
  });

  it("ranks grades from A to F", () => {
    expect(gradeRank("A")).toBeGreaterThan(gradeRank("B"));
    expect(gradeRank("F")).toBe(0);
  });
});

describe("statusForScore", () => {
  it("maps pillar scores onto the audit status colours", () => {
    expect(statusForScore(75)).toBe("pass");
    expect(statusForScore(74)).toBe("warn");
    expect(statusForScore(49)).toBe("fail");
  });
});

describe("buildReport", () => {
  it("flattens pillars and checks without inventing fields", () => {
    const report = buildReport(auditFixture());
    expect(report.pillars.discovery.score).toBe(100);
    expect(report.checks).toHaveLength(5);
    expect(report.checks[0].pillar).toBe("discovery");
    expect(report.siteType).toBe("saas");
    expect(report.detectedType).toBe("saas");
    expect(report.thresholds).toBeUndefined();
  });

  it("attaches the threshold verdict when thresholds are provided", () => {
    const report = buildReport(auditFixture(), { minScore: 90, minGrade: "B" });
    expect(report.passed).toBe(false);
    expect(report.thresholds?.scorePassed).toBe(false);
    expect(report.thresholds?.gradePassed).toBe(false);
  });
});

describe("renderMarkdownReport", () => {
  it("renders a sticky marker, metric table and pillar breakdown", () => {
    const report = buildReport(auditFixture(), { minScore: 75, minGrade: "B" });
    const markdown = renderMarkdownReport(report, { marker: "audit-marker" });

    expect(markdown.startsWith("<!-- audit-marker -->")).toBe(true);
    expect(markdown).toContain("## ❌ LLM SEO Toolbox audit");
    expect(markdown).toContain("| **Composite score** | **63 / 100** | ≥ 75 | ❌ Fail |");
    expect(markdown).toContain("**Discovery & Manifests** | 100/100");
    expect(markdown).toContain("3 passed · 1 warnings · 1 failed");
    expect(markdown).toContain("<summary>🔍 View all 5 check findings</summary>");
    expect(markdown).toContain("### Fix first");
    expect(
      markdown.trimEnd().endsWith("Toolbox](https://github.com/ABradwell/llm-seo-toolbox).*"),
    ).toBe(true);
  });

  it("escapes pipes in check labels so the table stays intact", () => {
    const report = buildReport(auditFixture(), { minScore: 0, minGrade: "F" });
    const markdown = renderMarkdownReport(report);
    expect(markdown).toContain("llms.txt \\| manifest");
  });

  it("omits the marker and details when not requested", () => {
    const report = buildReport(auditFixture(), { minScore: 0, minGrade: "F" });
    const markdown = renderMarkdownReport(report, { includeDetails: false });
    expect(markdown.includes("<!--")).toBe(false);
    expect(markdown).not.toContain("View all");
  });
});
