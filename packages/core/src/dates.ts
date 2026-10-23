import * as cheerio from "cheerio";

import type { FreshnessSignal } from "./types";
import type { PageMetadata } from "./metadata";
import type { StructuredDataReport } from "./structured-data";

function sourceLine(element: unknown): number | null {
  if (!element || typeof element !== "object") return null;
  const location = (element as { sourceCodeLocation?: { startLine?: number } }).sourceCodeLocation;
  return location?.startLine ?? null;
}

function isValidDate(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

function push(
  signals: FreshnessSignal[],
  source: FreshnessSignal["source"],
  property: string,
  value: string | null | undefined,
  line: number | null,
): void {
  if (!value) return;
  const iso = value.trim();
  if (!isValidDate(iso)) return;
  signals.push({ source, property, iso, line });
}

export interface DateCollection {
  signals: FreshnessSignal[];
  modified: FreshnessSignal | null;
  published: FreshnessSignal | null;
  sitemap: FreshnessSignal | null;
}

/**
 * Collects every machine-readable date signal on a page and returns the
 * freshest modified and published dates with their source.
 */
export function collectDateSignals(input: {
  metadata: PageMetadata;
  structured: StructuredDataReport;
  html: string;
  headers?: Record<string, string>;
  sitemapLastmod?: string | null;
}): DateCollection {
  const { metadata, structured, html, headers = {}, sitemapLastmod } = input;
  const signals: FreshnessSignal[] = [];

  push(
    signals,
    "meta",
    "article:published_time",
    metadata.published?.value,
    metadata.published?.line ?? null,
  );
  push(
    signals,
    "meta",
    "article:modified_time",
    metadata.modified?.value,
    metadata.modified?.line ?? null,
  );

  for (const node of structured.nodes) {
    for (const property of ["datePublished", "dateModified", "uploadDate", "dateCreated"]) {
      const value = node.properties[property];
      if (Array.isArray(value)) {
        value.forEach((entry) => push(signals, "json-ld", property, String(entry), node.line));
      } else {
        push(signals, "json-ld", property, value === undefined ? null : String(value), node.line);
      }
    }
  }

  const $ = cheerio.load(html, { sourceCodeLocationInfo: true });
  $("time[datetime]").each((_, element) => {
    const value = $(element).attr("datetime");
    const property =
      $(element).attr("itemprop") === "dateModified" ? "time:modified" : "time:datetime";
    push(signals, "time", property, value, sourceLine(element));
  });

  push(signals, "header", "last-modified", headers["last-modified"], null);
  push(signals, "sitemap", "lastmod", sitemapLastmod, null);

  const modifiedSignals = signals.filter(
    (signal) =>
      /modified|updated|uploaddate/i.test(signal.property) ||
      signal.source === "sitemap" ||
      signal.source === "header",
  );
  const publishedSignals = signals.filter((signal) =>
    /published|created|date\b/i.test(signal.property),
  );

  const freshest = (values: FreshnessSignal[]): FreshnessSignal | null =>
    values.length === 0
      ? null
      : [...values].sort((a, b) => new Date(b.iso).getTime() - new Date(a.iso).getTime())[0];

  return {
    signals,
    modified: freshest(modifiedSignals),
    published: freshest(publishedSignals),
    sitemap: signals.find((signal) => signal.source === "sitemap") ?? null,
  };
}

export function monthsBetween(from: string, now = Date.now()): number {
  const start = new Date(from).getTime();
  if (Number.isNaN(start)) return Number.POSITIVE_INFINITY;
  return (now - start) / (1000 * 60 * 60 * 24 * 30.44);
}

export function daysBetween(left: string, right: string): number {
  const a = new Date(left).getTime();
  const b = new Date(right).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY;
  return Math.abs(a - b) / (1000 * 60 * 60 * 24);
}
