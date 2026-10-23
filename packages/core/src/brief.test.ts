import { describe, expect, it } from "vitest";

import { buildPlainBrief, renderChangeRequests } from "./brief";
import { auditFixture } from "./fixtures";
import { buildReport } from "./report";
import type { AuditReport, AuditReportCheck } from "./report";

function reportCheck(
  id: string,
  status: AuditReportCheck["status"],
  extra: Partial<AuditReportCheck> = {},
): AuditReportCheck {
  return {
    id,
    label: `${id} label`,
    pillar: "access",
    pillarName: "Crawler Access Rules",
    status,
    score: null,
    weight: 1,
    summary: `${id} summary`,
    detail: `${id} detail`,
    scope: "site",
    ...extra,
  };
}

function reportWith(checks: AuditReportCheck[]): AuditReport {
  return { ...buildReport(auditFixture()), checks };
}

describe("buildPlainBrief", () => {
  it("splits issues into must fix and worth improving, and lists what works", () => {
    const brief = buildPlainBrief(buildReport(auditFixture()));

    expect(brief.mustFix.map((issue) => issue.id)).toEqual(["h1"]);
    expect(brief.improve.map((issue) => issue.id)).toEqual(["bot-bytespider"]);
    expect(brief.working.map((entry) => entry.id)).toEqual(["llms-txt", "meta-robots", "json-ld"]);
    expect(brief.gradeLabel).toBe("Needs work");
    expect(brief.summary).toContain("Start with the 1 must-fix item below.");
  });

  it("orders by weight inside each group and does not cap the list", () => {
    const checks = Array.from({ length: 12 }, (_, index) =>
      reportCheck(`check-${index}`, "fail", { weight: index }),
    );
    const brief = buildPlainBrief(reportWith(checks));

    expect(brief.mustFix).toHaveLength(12);
    expect(brief.mustFix[0].id).toBe("check-11");
    expect(brief.mustFix[11].id).toBe("check-0");
  });

  it("describes reach from the scope and page sample", () => {
    const brief = buildPlainBrief(
      reportWith([
        reportCheck("sitemap", "fail", { pillar: "discovery" }),
        reportCheck("h1", "warn", {
          pillar: "parseability",
          scope: "page",
          sample: {
            total: 8,
            passed: 5,
            warned: 2,
            failed: 1,
            affected: ["https://example.com/a", "https://example.com/b"],
          },
        }),
        reportCheck("snr", "warn", { pillar: "parseability", scope: "page" }),
      ]),
    );

    expect(brief.mustFix[0].affects).toBe("Whole site");
    const h1 = brief.improve.find((issue) => issue.id === "h1");
    expect(h1?.affects).toBe("3 of 8 sampled pages");
    expect(h1?.pages).toEqual(["https://example.com/a", "https://example.com/b"]);
    expect(h1?.area).toBe("Being read");
    expect(brief.improve.find((issue) => issue.id === "snr")?.affects).toBe("This page");
  });

  it("skips informational checks", () => {
    const brief = buildPlainBrief(reportWith([reportCheck("openapi", "info")]));
    expect(brief.mustFix).toEqual([]);
    expect(brief.improve).toEqual([]);
    expect(brief.working).toEqual([]);
  });
});

describe("renderChangeRequests", () => {
  const report = reportWith([
    reportCheck("bot-gptbot", "fail", {
      weight: 2,
      recommendation: "Update the GPTBot group in robots.txt.",
      evidence: { file: "/robots.txt", line: 12, snippet: "Disallow: /" },
      fix: { language: "robots", code: "User-agent: GPTBot\nAllow: /" },
    }),
    reportCheck("ai-policy", "warn"),
  ]);
  const brief = buildPlainBrief(report);

  it("renders plain requests without technical detail by default", () => {
    const text = renderChangeRequests(brief);

    expect(text).toContain("# Change requests for example.com");
    expect(text).toContain("Audit of https://example.com/ on Oct 21, 2026.");
    expect(text).toContain("## Must fix (1)");
    expect(text).toContain("### 1. Access for ChatGPT (GPTBot)");
    expect(text).toContain("What we need:\n- Update robots.txt so GPTBot is allowed");
    expect(text).toContain("Affects: Whole site. Usually handled by: developer.");
    expect(text).toContain("## Worth improving (1)");
    expect(text).toContain("### 2. A clear policy for AI crawlers");
    expect(text).not.toContain("Technical reference");
    expect(text).not.toContain("```");
    expect(text).not.toContain("—");
  });

  it("adds references, recommendations and fix snippets for developers", () => {
    const text = renderChangeRequests(brief, {
      includeTechnical: true,
      reportUrl: "https://llmready.example/app?url=example.com&view=technical",
    });

    expect(text).toContain(
      "Technical reference: `bot-gptbot`, bot-gptbot label, /robots.txt line 12. Found: bot-gptbot summary.",
    );
    expect(text).toContain("Recommendation: Update the GPTBot group in robots.txt.");
    expect(text).toContain("```robots\nUser-agent: GPTBot\nAllow: /\n```");
    expect(text).toContain(
      "Full technical report: https://llmready.example/app?url=example.com&view=technical",
    );
  });

  it("keeps only the selected issues and renumbers them", () => {
    const text = renderChangeRequests(brief, { selectedIds: ["ai-policy"] });
    expect(text).not.toContain("## Must fix");
    expect(text).toContain("### 1. A clear policy for AI crawlers");
  });

  it("says so when nothing is selected", () => {
    const text = renderChangeRequests(brief, { selectedIds: [], marker: "llm-seo-toolbox" });
    expect(text.startsWith("<!-- llm-seo-toolbox -->")).toBe(true);
    expect(text).toContain("No changes requested.");
  });
});
