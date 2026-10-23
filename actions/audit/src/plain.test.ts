import { describe, expect, it } from "vitest";

import { buildReport } from "@llm-seo-toolbox/core";
import { auditFixture } from "@llm-seo-toolbox/core/fixtures";

import { renderPlainComment } from "./plain";

describe("renderPlainComment", () => {
  it("leads with the gate verdict and nests the change requests", () => {
    const report = buildReport(auditFixture(), { minScore: 75, minGrade: "B" });
    const body = renderPlainComment(report, {
      marker: "llm-seo-toolbox-audit-report",
      runUrl: "https://github.com/o/r/actions/runs/1",
    });

    expect(
      body.startsWith(
        "<!-- llm-seo-toolbox-audit-report -->\n\n## ❌ LLM SEO Toolbox audit failed",
      ),
    ).toBe(true);
    expect(body).toContain("Score 63/100 (minimum 75) · Grade C (minimum B)");
    expect(body).toContain("### Change requests for example.com");
    expect(body).toContain("#### Must fix (1)");
    expect(body).toContain("##### 1. A clear main heading on each page");
    expect(body).toContain("Technical reference: `h1`");
    expect(body).toContain("Full technical report: https://github.com/o/r/actions/runs/1");
  });
});
