import * as cheerio from "cheerio";

import { normalizeWhitespace } from "./format";

export interface MetadataLink {
  href: string;
  type: string;
  title: string | null;
  line: number | null;
}

export interface PageMetadata {
  title: string;
  titleLine: number | null;
  description: string;
  descriptionLine: number | null;
  canonical: { href: string; absolute: boolean } | null;
  canonicalLine: number | null;
  lang: string | null;
  langLine: number | null;
  siteName: string | null;
  ogType: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  published: { value: string; line: number | null } | null;
  modified: { value: string; line: number | null } | null;
  feeds: MetadataLink[];
  markdownAlternates: MetadataLink[];
  alternates: MetadataLink[];
}

function sourceLine(element: unknown): number | null {
  if (!element || typeof element !== "object") return null;
  const location = (element as { sourceCodeLocation?: { startLine?: number } }).sourceCodeLocation;
  return location?.startLine ?? null;
}

function resolve(href: string | undefined, base?: string): string | null {
  if (!href?.trim()) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return href.trim();
  }
}

function isAbsolute(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function pathOf(value: string): string {
  try {
    return new URL(value).pathname;
  } catch {
    return value;
  }
}

function metaContent($: cheerio.CheerioAPI, selectors: string): string {
  const element = $(selectors).first();
  return normalizeWhitespace(element.attr("content") ?? "");
}

function linkEntries(
  $: cheerio.CheerioAPI,
  predicate: (type: string, rel: string) => boolean,
  base?: string,
): MetadataLink[] {
  const entries: MetadataLink[] = [];
  $("link[href]").each((_, element) => {
    const node = $(element);
    const type = (node.attr("type") ?? "").trim().toLowerCase();
    const rel = (node.attr("rel") ?? "").trim().toLowerCase();
    if (!predicate(type, rel)) return;
    const href = resolve(node.attr("href"), base);
    if (!href) return;
    entries.push({
      href,
      type,
      title: node.attr("title")?.trim() || null,
      line: sourceLine(element),
    });
  });
  return entries;
}

/**
 * Reads the page head once: title, description, canonical, language,
 * OpenGraph/article timestamps and the feed and markdown alternates. The
 * classifier and the page checks share this pass.
 */
export function extractMetadata($: cheerio.CheerioAPI, baseUrl?: string): PageMetadata {
  const titleNode = $("head title").first();
  const title = normalizeWhitespace(titleNode.text());

  const descriptionNode = $('meta[name="description"]').first();
  const description = normalizeWhitespace(
    descriptionNode.attr("content") ?? $('meta[property="og:description"]').attr("content") ?? "",
  );

  const canonicalNode = $('link[rel="canonical"]').first();
  const canonicalHref = resolve(canonicalNode.attr("href"), baseUrl);

  const htmlNode = $("html").first();

  const publishedRaw =
    metaContent($, 'meta[property="article:published_time"]') ||
    metaContent($, 'meta[name="article:published_time"]') ||
    metaContent($, 'meta[itemprop="datePublished"]') ||
    metaContent($, 'meta[name="date"]') ||
    metaContent($, 'meta[name="pubdate"]');

  const modifiedRaw =
    metaContent($, 'meta[property="article:modified_time"]') ||
    metaContent($, 'meta[name="article:modified_time"]') ||
    metaContent($, 'meta[itemprop="dateModified"]') ||
    metaContent($, 'meta[name="last-modified"]');

  const publishedNode = $(
    'meta[property="article:published_time"], meta[name="article:published_time"], meta[itemprop="datePublished"], meta[name="date"], meta[name="pubdate"]',
  ).first();
  const modifiedNode = $(
    'meta[property="article:modified_time"], meta[name="article:modified_time"], meta[itemprop="dateModified"], meta[name="last-modified"]',
  ).first();

  const alternates = linkEntries($, (_type, rel) => rel.includes("alternate"), baseUrl);
  const feeds = alternates.filter(
    (entry) =>
      /rss|atom|feed\+json/i.test(entry.type) ||
      /(?:^|\/)(?:feed|rss|atom)(?:\/|\.|$)/i.test(pathOf(entry.href)),
  );
  const markdownAlternates = alternates.filter(
    (entry) => entry.type === "text/markdown" || entry.type === "text/x-markdown",
  );

  return {
    title,
    titleLine: sourceLine(titleNode[0]),
    description,
    descriptionLine: sourceLine(descriptionNode[0]),
    canonical: canonicalHref
      ? { href: canonicalHref, absolute: isAbsolute(canonicalNode.attr("href") ?? "") }
      : null,
    canonicalLine: sourceLine(canonicalNode[0]),
    lang: htmlNode.attr("lang")?.trim() || null,
    langLine: sourceLine(htmlNode[0]),
    siteName: metaContent($, 'meta[property="og:site_name"]') || null,
    ogType: metaContent($, 'meta[property="og:type"]') || null,
    ogTitle: metaContent($, 'meta[property="og:title"]') || null,
    ogDescription: metaContent($, 'meta[property="og:description"]') || null,
    published: publishedRaw ? { value: publishedRaw, line: sourceLine(publishedNode[0]) } : null,
    modified: modifiedRaw ? { value: modifiedRaw, line: sourceLine(modifiedNode[0]) } : null,
    feeds,
    markdownAlternates,
    alternates,
  };
}
