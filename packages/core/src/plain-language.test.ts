import { describe, expect, it } from "vitest";

import {
  PAGE_CHECK_IDS,
  plainCatalogEntry,
  plainCopyFor,
  plainGradeSummary,
  SITE_CHECK_IDS,
} from "./plain-language";

const context = {
  origin: "https://example.com",
  profile: "documentation",
  schema: ["TechArticle", "APIReference", "FAQPage"],
};

const ALL_IDS = [...SITE_CHECK_IDS, ...PAGE_CHECK_IDS];

/** Terms a marketer should never need to know to read a title or a problem. */
const JARGON = [
  /\bRFC\b/i,
  /JSON-LD/i,
  /\bSSR\b/i,
  /\bH1\b/i,
  /user-agent/i,
  /\bSNR\b/i,
  /schema\.org/i,
  /\bheaders?\b/i,
];

describe("plain-language catalog", () => {
  it("covers every check id the engine emits", () => {
    expect(ALL_IDS).toHaveLength(20);
    for (const id of ALL_IDS) {
      expect(plainCatalogEntry(id), id).toBeDefined();
    }
  });

  it.each(ALL_IDS)("%s resolves copy for both warn and fail", (id) => {
    for (const status of ["warn", "fail"] as const) {
      const copy = plainCopyFor({ id, label: id, status }, context);
      expect(copy.known).toBe(true);
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.problem.length).toBeGreaterThan(0);
      expect(copy.why.length).toBeGreaterThan(0);
      expect(copy.good.length).toBeGreaterThan(0);
      expect(copy.asks.length).toBeGreaterThan(0);
    }
  });

  it.each(ALL_IDS)("%s keeps jargon out of titles and problems", (id) => {
    for (const status of ["warn", "fail"] as const) {
      const copy = plainCopyFor({ id, label: id, status }, context);
      for (const pattern of JARGON) {
        expect(copy.title, `${id} title`).not.toMatch(pattern);
        expect(copy.problem, `${id} ${status} problem`).not.toMatch(pattern);
      }
    }
  });

  it.each(ALL_IDS)("%s fills every token and avoids em dashes", (id) => {
    const copy = plainCopyFor({ id, label: id, status: "fail" }, context);
    const text = [copy.title, copy.problem, copy.why, copy.good, ...copy.asks].join("\n");
    expect(text).not.toMatch(/\{\w+\}/);
    expect(text).not.toContain("—");
  });

  it("names the crawler, its vendor and the assistant it feeds", () => {
    const copy = plainCopyFor(
      { id: "bot-gptbot", label: "GPTBot access", status: "fail" },
      context,
    );
    expect(copy.title).toBe("Access for ChatGPT (GPTBot)");
    expect(copy.problem).toContain("OpenAI's crawler (GPTBot)");
    expect(copy.asks[0]).toContain("GPTBot");
  });

  it("fills the site origin and profile into asks and problems", () => {
    const sitemap = plainCopyFor({ id: "sitemap", label: "sitemap", status: "fail" }, context);
    expect(sitemap.asks.join(" ")).toContain("https://example.com/sitemap.xml");

    const schema = plainCopyFor({ id: "schema-types", label: "schema", status: "warn" }, context);
    expect(schema.problem).toContain("(documentation)");
    expect(schema.asks[0]).toContain("TechArticle");
    expect(schema.good).toContain("TechArticle, APIReference or FAQPage");
  });

  it("returns no problem or asks for passing checks", () => {
    const copy = plainCopyFor({ id: "h1", label: "Single H1", status: "pass" }, context);
    expect(copy.title).toBe("A clear main heading on each page");
    expect(copy.problem).toBe("");
    expect(copy.asks).toEqual([]);
  });

  it("falls back to the technical copy for unknown checks", () => {
    const copy = plainCopyFor(
      { id: "new-check", label: "New check", status: "warn", recommendation: "Do the thing." },
      context,
    );
    expect(copy.known).toBe(false);
    expect(copy.title).toBe("New check");
    expect(copy.problem).toBe("Do the thing.");
    expect(copy.asks).toEqual(["Do the thing."]);
  });
});

describe("plainGradeSummary", () => {
  it("points at must-fix items first", () => {
    expect(plainGradeSummary("C", { mustFix: 2, improve: 3 })).toBe(
      "AI assistants can read parts of your site, but some gaps get in the way. Start with the 2 must-fix items below.",
    );
  });

  it("handles improvement-only and clean results", () => {
    expect(plainGradeSummary("B", { mustFix: 0, improve: 1 })).toContain(
      "1 improvement would help.",
    );
    expect(plainGradeSummary("A", { mustFix: 0, improve: 0 })).toContain(
      "Nothing needs changing right now.",
    );
  });
});
