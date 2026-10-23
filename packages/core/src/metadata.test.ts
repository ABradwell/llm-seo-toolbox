import * as cheerio from "cheerio";
import { describe, expect, it } from "vitest";

import { extractMetadata } from "./metadata";

const HTML = `<!doctype html>
<html lang="en">
  <head>
    <title> Example Docs </title>
    <meta name="description" content="  Everything developers need.  " />
    <link rel="canonical" href="/docs/start" />
    <meta property="og:site_name" content="Example" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="Example Docs" />
    <meta property="og:description" content="A fallback description." />
    <meta property="article:published_time" content="2025-01-02T00:00:00Z" />
    <meta property="article:modified_time" content="2026-03-04T00:00:00Z" />
    <link rel="alternate" type="application/rss+xml" href="/feed.xml" />
    <link rel="alternate" type="text/markdown" href="/docs/start.md" />
    <link rel="alternate" hreflang="fr" href="/fr/docs/start" />
  </head>
  <body></body>
</html>`;

describe("extractMetadata", () => {
  const $ = cheerio.load(HTML, { sourceCodeLocationInfo: true });
  const metadata = extractMetadata($, "https://example.com/docs/start");

  it("reads the title, description, language and OpenGraph fields", () => {
    expect(metadata.title).toBe("Example Docs");
    expect(metadata.description).toBe("Everything developers need.");
    expect(metadata.lang).toBe("en");
    expect(metadata.siteName).toBe("Example");
    expect(metadata.ogType).toBe("article");
    expect(metadata.ogTitle).toBe("Example Docs");
    expect(metadata.ogDescription).toBe("A fallback description.");
  });

  it("resolves a relative canonical against the page URL", () => {
    expect(metadata.canonical).toEqual({
      href: "https://example.com/docs/start",
      absolute: false,
    });
    expect(metadata.canonicalLine).toBe(6);
  });

  it("keeps published and modified timestamps", () => {
    expect(metadata.published?.value).toBe("2025-01-02T00:00:00Z");
    expect(metadata.modified?.value).toBe("2026-03-04T00:00:00Z");
  });

  it("separates feeds, markdown alternates and other alternates", () => {
    expect(metadata.feeds.map((entry) => entry.href)).toEqual(["https://example.com/feed.xml"]);
    expect(metadata.markdownAlternates.map((entry) => entry.href)).toEqual([
      "https://example.com/docs/start.md",
    ]);
    expect(metadata.alternates.map((entry) => entry.href)).toEqual([
      "https://example.com/feed.xml",
      "https://example.com/docs/start.md",
      "https://example.com/fr/docs/start",
    ]);
  });

  it("falls back to og:description and handles missing fields", () => {
    const $fallback = cheerio.load(
      '<html><head><meta property="og:description" content="Only OpenGraph." /></head></html>',
    );
    const fallback = extractMetadata($fallback, "https://example.com");

    expect(fallback.description).toBe("Only OpenGraph.");
    expect(fallback.title).toBe("");
    expect(fallback.canonical).toBeNull();
    expect(fallback.published).toBeNull();
    expect(fallback.modified).toBeNull();
    expect(fallback.lang).toBeNull();
  });

  it("detects a feed from its path even without a type", () => {
    const $path = cheerio.load(
      '<html><head><link rel="alternate" href="https://example.com/blog/feed/" /></head></html>',
    );
    const path = extractMetadata($path);

    expect(path.feeds).toHaveLength(1);
    expect(path.feeds[0].href).toBe("https://example.com/blog/feed/");
  });
});
