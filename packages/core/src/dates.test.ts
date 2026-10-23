import { describe, expect, it } from "vitest";

import { collectDateSignals, daysBetween, monthsBetween } from "./dates";
import type { PageMetadata } from "./metadata";
import type { StructuredDataReport } from "./structured-data";

function metadata(overrides: Partial<PageMetadata> = {}): PageMetadata {
  return {
    title: "",
    titleLine: null,
    description: "",
    descriptionLine: null,
    canonical: null,
    canonicalLine: null,
    lang: null,
    langLine: null,
    siteName: null,
    ogType: null,
    ogTitle: null,
    ogDescription: null,
    published: null,
    modified: null,
    feeds: [],
    markdownAlternates: [],
    alternates: [],
    ...overrides,
  };
}

function report(nodes: StructuredDataReport["nodes"] = []): StructuredDataReport {
  return {
    valid: 0,
    invalid: 0,
    types: [...new Set(nodes.flatMap((entry) => entry.types))],
    blocks: [],
    firstValidLine: null,
    firstBlockLine: null,
    nodes,
    formats: {
      "json-ld": nodes.filter((entry) => entry.format === "json-ld").length,
      microdata: nodes.filter((entry) => entry.format === "microdata").length,
      rdfa: nodes.filter((entry) => entry.format === "rdfa").length,
    },
  };
}

describe("collectDateSignals", () => {
  it("reads meta published and modified timestamps", () => {
    const result = collectDateSignals({
      metadata: metadata({
        published: { value: "2025-01-01T00:00:00Z", line: 4 },
        modified: { value: "2026-02-01T00:00:00Z", line: 5 },
      }),
      structured: report(),
      html: "<html></html>",
    });

    expect(result.modified?.iso).toBe("2026-02-01T00:00:00Z");
    expect(result.modified?.source).toBe("meta");
    expect(result.published?.iso).toBe("2025-01-01T00:00:00Z");
    expect(result.signals.map((signal) => signal.property)).toEqual([
      "article:published_time",
      "article:modified_time",
    ]);
  });

  it("reads JSON-LD dates and picks the freshest modified value", () => {
    const result = collectDateSignals({
      metadata: metadata(),
      structured: report([
        {
          format: "json-ld",
          types: ["Article"],
          properties: {
            datePublished: "2024-01-01",
            dateModified: ["2025-01-01", "2026-06-01"],
          },
          line: 8,
        },
      ]),
      html: "<html></html>",
    });

    expect(result.published?.iso).toBe("2024-01-01");
    expect(result.modified?.iso).toBe("2026-06-01");
    expect(result.signals.filter((signal) => signal.source === "json-ld")).toHaveLength(3);
    expect(result.signals[0].line).toBe(8);
  });

  it("reads time elements, headers and the sitemap lastmod", () => {
    const result = collectDateSignals({
      metadata: metadata(),
      structured: report(),
      html: `<html><body>
        <time datetime="2026-01-01">January</time>
        <time datetime="2026-03-01" itemprop="dateModified">March</time>
      </body></html>`,
      headers: { "last-modified": "Wed, 01 Apr 2026 00:00:00 GMT" },
      sitemapLastmod: "2026-05-01",
    });

    expect(result.signals.find((signal) => signal.property === "time:datetime")?.line).toBe(2);
    expect(result.signals.find((signal) => signal.property === "time:modified")?.line).toBe(3);
    expect(result.signals.find((signal) => signal.source === "header")?.iso).toBe(
      "Wed, 01 Apr 2026 00:00:00 GMT",
    );
    expect(result.sitemap?.iso).toBe("2026-05-01");
    expect(result.modified?.iso).toBe("2026-05-01");
  });

  it("ignores unparseable dates", () => {
    const result = collectDateSignals({
      metadata: metadata({ modified: { value: "not a date", line: 1 } }),
      structured: report([
        {
          format: "json-ld",
          types: ["Article"],
          properties: { dateModified: "also not a date" },
          line: 1,
        },
      ]),
      html: '<html><body><time datetime="nope">Never</time></body></html>',
      headers: { "last-modified": "not a date" },
      sitemapLastmod: "not a date",
    });

    expect(result.signals).toEqual([]);
    expect(result.modified).toBeNull();
    expect(result.published).toBeNull();
    expect(result.sitemap).toBeNull();
  });

  it("returns null dates when nothing is exposed", () => {
    const result = collectDateSignals({
      metadata: metadata(),
      structured: report(),
      html: "<html><body><p>No dates</p></body></html>",
    });

    expect(result).toEqual({ signals: [], modified: null, published: null, sitemap: null });
  });
});

describe("monthsBetween", () => {
  it("counts whole months from an ISO date", () => {
    const now = new Date("2026-01-01T00:00:00Z").getTime();
    expect(monthsBetween("2025-01-01T00:00:00Z", now)).toBeCloseTo(12, 0);
    expect(monthsBetween("2024-07-01T00:00:00Z", now)).toBeCloseTo(18, 0);
  });

  it("returns infinity for an invalid date", () => {
    expect(monthsBetween("not a date")).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("daysBetween", () => {
  it("returns the absolute distance in days", () => {
    expect(daysBetween("2026-01-01", "2026-01-08")).toBe(7);
    expect(daysBetween("2026-01-08", "2026-01-01")).toBe(7);
  });

  it("returns infinity when either date is invalid", () => {
    expect(daysBetween("not a date", "2026-01-01")).toBe(Number.POSITIVE_INFINITY);
  });
});
