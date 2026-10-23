import { describe, expect, it } from "vitest";

import type { AuditCheck, PageAuditResult } from "./types";

import { aggregatePageChecks, directPageChecks } from "./aggregate";

const IDS = [
  "meta-robots",
  "x-robots-tag",
  "h1",
  "heading-order",
  "snr",
  "ssr-content",
  "json-ld",
  "schema-types",
];

function check(id: string, status: AuditCheck["status"]): AuditCheck {
  return {
    id,
    label: id,
    status,
    summary: "",
    detail: `${id} detail`,
    protocol: "test",
    recommendation: status === "pass" ? undefined : `Fix ${id}.`,
    weight: 1,
    scope: "page",
  };
}

function page(url: string, h1Status: AuditCheck["status"]): PageAuditResult {
  const checks = IDS.map((id) => check(id, id === "h1" ? h1Status : "pass"));
  return {
    url,
    finalUrl: url,
    label: url,
    section: "Pages",
    source: "sitemap",
    outcome: "analyzed",
    status: "pass",
    score: 90,
    grade: "A",
    checks,
    title: "",
    textChars: 1_000,
    snr: 0.8,
    h1Count: 1,
    headingCount: 3,
    jsonLdTypes: [],
    metaRobots: "",
    xRobotsTag: null,
    fetchMs: 10,
  };
}

describe("aggregatePageChecks", () => {
  it("uses the mean status score, not a binary warning", () => {
    const pages = Array.from({ length: 8 }, (_, index) =>
      page(`https://example.com/page-${index + 1}`, index === 7 ? "fail" : "pass"),
    );
    const groups = aggregatePageChecks(pages);
    const h1 = groups.parseability.find((entry) => entry.id === "h1")!;

    expect(h1.score).toBe(88);
    expect(h1.status).toBe("warn");
    expect(h1.summary).toBe("7 / 8 pages pass");
    expect(h1.sample).toMatchObject({
      total: 8,
      passed: 7,
      warned: 0,
      failed: 1,
      affected: ["https://example.com/page-8"],
    });
    expect(h1.scope).toBe("page");
  });

  it("takes the recommendation from a failing page when the first page passes", () => {
    const pages = [page("https://example.com/a", "pass"), page("https://example.com/b", "fail")];
    const h1 = aggregatePageChecks(pages).parseability.find((entry) => entry.id === "h1")!;

    expect(h1.status).toBe("warn");
    expect(h1.recommendation).toBe("Fix h1.");
  });

  it("keeps a single warning from turning the aggregate into a binary warning", () => {
    const pages = Array.from({ length: 8 }, (_, index) =>
      page(`https://example.com/page-${index + 1}`, index === 0 ? "warn" : "pass"),
    );
    const h1 = aggregatePageChecks(pages).parseability.find((entry) => entry.id === "h1")!;

    expect(h1.score).toBe(94);
    expect(h1.status).toBe("pass");
    expect(h1.sample).toMatchObject({ passed: 7, warned: 1, failed: 0 });
  });

  it("fails an aggregate when no sampled page passes", () => {
    const pages = Array.from({ length: 8 }, (_, index) =>
      page(`https://example.com/page-${index + 1}`, "fail"),
    );
    const h1 = aggregatePageChecks(pages).parseability.find((entry) => entry.id === "h1")!;

    expect(h1.score).toBe(0);
    expect(h1.status).toBe("fail");
    expect(h1.sample?.affected).toHaveLength(5);
  });

  it("ignores pages that could not be analyzed", () => {
    const pages = [
      page("https://example.com/ok", "pass"),
      {
        ...page("https://example.com/broken", "fail"),
        outcome: "unreachable" as const,
        checks: [],
      },
    ];
    const h1 = aggregatePageChecks(pages).parseability.find((entry) => entry.id === "h1")!;

    expect(h1.score).toBe(100);
    expect(h1.sample?.total).toBe(1);
  });
});

describe("directPageChecks", () => {
  it("returns the page checks unchanged for page scope", () => {
    const result = page("https://example.com/app", "warn");
    const groups = directPageChecks(result);

    expect(groups.parseability.find((entry) => entry.id === "h1")).toBe(
      result.checks.find((entry) => entry.id === "h1"),
    );
    expect(groups.parseability.every((entry) => entry.sample === undefined)).toBe(true);
  });
});
