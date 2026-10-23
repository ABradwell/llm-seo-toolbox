import { describe, expect, it } from "vitest";

import { buildReport } from "@llm-seo-toolbox/core";
import { auditFixture } from "@llm-seo-toolbox/core/fixtures";

import { createPalette } from "../color";
import { renderBrief } from "./brief";
import { renderJson } from "./json";
import { renderSummary } from "./summary";
import { renderTable } from "./table";

const report = buildReport(auditFixture(), { minScore: 75, minGrade: "B" });

describe("renderTable", () => {
  it("draws the pillar table and the attention list", () => {
    const output = renderTable(report, createPalette(false));
    expect(output).toContain("Discovery & Manifests");
    expect(output).toContain("100/100");
    expect(output).toContain("PASS");
    expect(output).toContain("Needs attention");
    expect(output).toContain("Threshold not met");
    expect(output.includes("\u001b[")).toBe(false);
  });

  it("colourises when the palette is enabled", () => {
    const output = renderTable(report, createPalette(true));
    expect(output.includes("\u001b[")).toBe(true);
  });
});

describe("renderSummary", () => {
  it("prints one line per pillar and the gate verdict", () => {
    const output = renderSummary(report, createPalette(false));
    expect(output).toContain("63/100");
    expect(output).toContain("Discovery 100");
    expect(output).toContain("3 pass · 1 warn · 1 fail");
    expect(output).toContain("Gate failed");
  });
});

describe("renderJson", () => {
  it("round-trips the report through JSON", () => {
    const parsed = JSON.parse(renderJson(report)) as {
      score: number;
      thresholds: { passed: boolean };
    };
    expect(parsed.score).toBe(63);
    expect(parsed.thresholds.passed).toBe(false);
  });
});

describe("renderBrief", () => {
  it("prints plain-language change requests with technical references", () => {
    const output = renderBrief(report);
    expect(output).toContain("# Change requests for example.com");
    expect(output).toContain("## Must fix (1)");
    expect(output).toContain("### 1. A clear main heading on each page");
    expect(output).toContain("What we need:");
    expect(output).toContain("Technical reference: `h1`");
    expect(output).not.toContain("\u001b[");
  });
});
