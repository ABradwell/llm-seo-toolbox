import { describe, expect, it } from "vitest";

import type { AuditPage } from "./types";

import { buildInventory, mapWithConcurrency, selectSample, SITE_SAMPLE_SIZE } from "./sampling";

describe("buildInventory", () => {
  it("uses sitemap URLs, then homepage links, and caps only the listed copy", () => {
    const inventory = buildInventory({
      origin: "https://example.com",
      seedUrl: "https://example.com/",
      sitemapUrls: [
        "https://example.com/pricing",
        "https://example.com/docs/start",
        "https://example.com/api/reference",
        "https://example.com/logo.png",
      ],
      homepageLinks: [
        "https://example.com/about",
        "https://example.com/pricing?ref=nav",
        "https://other.example.com/elsewhere",
      ],
      maxListed: 3,
    });

    expect(inventory.method).toBe("sitemap");
    expect(inventory.all.map((page) => page.url)).toEqual([
      "https://example.com/",
      "https://example.com/docs/start",
      "https://example.com/pricing",
      "https://example.com/about",
    ]);
    expect(inventory.pages).toHaveLength(3);
    expect(inventory.inventorySize).toBe(4);
  });

  it("allows content-selecting query strings from sitemaps but not links", () => {
    const inventory = buildInventory({
      origin: "https://example.com",
      seedUrl: "https://example.com/",
      sitemapUrls: ["https://example.com/compare?a=1&b=2"],
      homepageLinks: ["https://example.com/compare?utm_source=nav"],
    });

    expect(inventory.all.map((page) => page.url)).toEqual([
      "https://example.com/",
      "https://example.com/compare?a=1&b=2",
    ]);
  });

  it("falls back to homepage links when the sitemap is absent", () => {
    const inventory = buildInventory({
      origin: "https://example.com",
      seedUrl: "https://example.com/",
      sitemapUrls: [],
      homepageLinks: ["https://example.com/about"],
    });

    expect(inventory.method).toBe("links");
    expect(inventory.all).toHaveLength(2);
  });
});

describe("selectSample", () => {
  function pages(count: number): AuditPage[] {
    return [
      { url: "https://example.com/", label: "Home", section: "Home", source: "home" },
      ...Array.from({ length: count }, (_, index) => ({
        url: `https://example.com/docs/page-${index + 1}`,
        label: `Page ${index + 1}`,
        section: index % 3 === 0 ? "Documentation" : index % 3 === 1 ? "Guides" : "Product",
        source: "sitemap" as const,
      })),
    ];
  }

  it("is deterministic and independent of the focus URL", () => {
    const inventory = pages(20);
    const first = selectSample(inventory);
    const second = selectSample(inventory);

    expect(first.map((page) => page.url)).toEqual(second.map((page) => page.url));
    expect(first).toHaveLength(SITE_SAMPLE_SIZE);
    expect(first[0].source).toBe("home");
  });

  it("takes one page per section before taking a second from a section", () => {
    const selected = selectSample(pages(20), 4);
    const sections = selected.slice(1).map((page) => page.section);
    expect(new Set(sections).size).toBe(3);
  });

  it("does not invent pages when the inventory is smaller than the sample", () => {
    expect(selectSample(pages(2), 8)).toHaveLength(3);
  });
});

describe("mapWithConcurrency", () => {
  it("preserves input order while limiting parallelism", async () => {
    let active = 0;
    let peak = 0;
    const result = await mapWithConcurrency([30, 10, 20, 5, 15], 2, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, value));
      active -= 1;
      return value * 2;
    });

    expect(result).toEqual([60, 20, 40, 10, 30]);
    expect(peak).toBeLessThanOrEqual(2);
  });
});
