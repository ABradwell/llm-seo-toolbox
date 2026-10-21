import { describe, expect, it } from "vitest";

import { isIndexablePage, looksLikeHtml, parseSitemap } from "./sitemap";

describe("parseSitemap", () => {
  it("parses a urlset", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://example.com/</loc></url>
        <url><loc>https://example.com/docs?a=1&amp;b=2</loc></url>
      </urlset>`;

    const result = parseSitemap(xml);
    expect(result.kind).toBe("urlset");
    expect(result.urls).toEqual(["https://example.com/", "https://example.com/docs?a=1&b=2"]);
  });

  it("parses a sitemap index", () => {
    const xml = `<sitemapindex><sitemap><loc>https://example.com/sitemap-1.xml</loc></sitemap></sitemapindex>`;
    const result = parseSitemap(xml);
    expect(result.kind).toBe("sitemapindex");
    expect(result.sitemaps).toEqual(["https://example.com/sitemap-1.xml"]);
  });

  it("ignores invalid locations", () => {
    const result = parseSitemap("<urlset><url><loc>javascript:alert(1)</loc></url></urlset>");
    expect(result.urls).toHaveLength(0);
  });
});

describe("looksLikeHtml", () => {
  it("detects HTML error pages served as sitemaps", () => {
    expect(looksLikeHtml("<!DOCTYPE html><html><body>Not found</body></html>")).toBe(true);
    expect(looksLikeHtml("<urlset><url><loc>https://example.com/</loc></url></urlset>")).toBe(
      false,
    );
  });
});

describe("isIndexablePage", () => {
  it("skips assets and includes pages", () => {
    expect(isIndexablePage("https://example.com/docs/start")).toBe(true);
    expect(isIndexablePage("https://example.com/logo.png")).toBe(false);
    expect(isIndexablePage("https://example.com/sitemap.xml")).toBe(false);
  });
});
