import type { AuditPage, SamplingMethod } from "./types";

import { sectionForPath } from "./llms";
import { isPageCandidate } from "./sitemap";
import { pathLabel } from "./url";

/** Hard cap on pages fetched for the site score. */
export const SITE_SAMPLE_SIZE = 8;
/** Parallel page fetches. Keeps the audit inside the 60s route budget. */
export const SAMPLE_CONCURRENCY = 4;
/** Stop starting new page fetches after this long. */
export const SAMPLE_DEADLINE_MS = 25_000;
/** The llms.txt editor only needs a bounded inventory. */
export const MAX_INVENTORY_PAGES = 80;

const SECTION_ORDER = [
  "Documentation",
  "Guides",
  "Developers",
  "Product",
  "Updates",
  "Company",
  "Pages",
];

export interface InventoryInput {
  origin: string;
  seedUrl: string;
  sitemapUrls: string[];
  homepageLinks: string[];
  maxListed?: number;
}

export interface PageInventory {
  /** Every unique page-like URL. */
  all: AuditPage[];
  /** Bounded list for transport and the llms.txt editor. */
  pages: AuditPage[];
  inventorySize: number;
  method: SamplingMethod;
  sitemapCandidates: number;
}

/**
 * Build the inventory from origin-level sources only. The focus URL is
 * deliberately absent: the sample must be identical for `/` and `/app`.
 */
export function buildInventory(input: InventoryInput): PageInventory {
  const maxListed = input.maxListed ?? MAX_INVENTORY_PAGES;
  const all: AuditPage[] = [];
  const seen = new Set<string>();
  let sitemapCandidates = 0;
  let linkCandidates = 0;

  const add = (
    value: string,
    source: AuditPage["source"],
    options: { allowQuery?: boolean; force?: boolean } = {},
  ): void => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return;
    }

    url.hash = "";

    if (!options.force && !isPageCandidate(url.toString(), input.origin, options)) return;
    if (url.origin !== input.origin) return;

    const normalized = url.toString();
    if (seen.has(normalized)) return;
    seen.add(normalized);

    if (source === "sitemap") sitemapCandidates += 1;
    if (source === "link") linkCandidates += 1;

    const isHome = url.pathname === "/" || url.pathname === "";
    all.push({
      url: normalized,
      label: isHome ? "Home" : pathLabel(url.pathname),
      section: sectionForPath(isHome ? "/" : url.pathname),
      source,
    });
  };

  add(input.seedUrl, "home", { force: true });
  for (const value of input.sitemapUrls) add(value, "sitemap", { allowQuery: true });
  for (const value of input.homepageLinks) add(value, "link");

  all.sort(comparePages);

  const method: SamplingMethod =
    sitemapCandidates > 0 ? "sitemap" : linkCandidates > 0 ? "links" : "homepage";

  return {
    all,
    pages: all.slice(0, maxListed),
    inventorySize: all.length,
    method,
    sitemapCandidates,
  };
}

function comparePages(a: AuditPage, b: AuditPage): number {
  if (a.source === "home") return -1;
  if (b.source === "home") return 1;
  const sectionA = sectionRank(a.section);
  const sectionB = sectionRank(b.section);
  if (sectionA !== sectionB) return sectionA - sectionB;
  return a.url.localeCompare(b.url);
}

function sectionRank(section: string): number {
  const index = SECTION_ORDER.indexOf(section);
  return index === -1 ? SECTION_ORDER.length : index;
}

/**
 * Deterministic stratified sample. The focus URL is not an input.
 * One page per section is selected before a second page from any section.
 */
export function selectSample(pages: AuditPage[], size = SITE_SAMPLE_SIZE): AuditPage[] {
  if (pages.length === 0 || size <= 0) return [];

  const seed = pages.find((page) => page.source === "home") ?? pages[0];
  const selected: AuditPage[] = [seed];
  if (size === 1) return selected;

  const groups = new Map<string, AuditPage[]>();
  for (const page of pages) {
    if (page.url === seed.url) continue;
    const group = groups.get(page.section) ?? [];
    group.push(page);
    groups.set(page.section, group);
  }

  const sections = [...groups.keys()].sort((a, b) => {
    const rank = sectionRank(a) - sectionRank(b);
    return rank !== 0 ? rank : a.localeCompare(b);
  });

  for (const section of sections) {
    groups.get(section)?.sort(compareSampleCandidates);
  }

  while (selected.length < size) {
    let added = false;
    for (const section of sections) {
      if (selected.length >= size) break;
      const next = groups.get(section)?.shift();
      if (!next) continue;
      selected.push(next);
      added = true;
    }
    if (!added) break;
  }

  return selected;
}

function compareSampleCandidates(a: AuditPage, b: AuditPage): number {
  const depthA = pathDepth(a.url);
  const depthB = pathDepth(b.url);
  if (depthA !== depthB) return depthA - depthB;
  if (a.url.length !== b.url.length) return a.url.length - b.url.length;
  return a.url.localeCompare(b.url);
}

function pathDepth(value: string): number {
  try {
    return new URL(value).pathname.split("/").filter(Boolean).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

/** Run async work with a fixed concurrency, preserving input order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];

  const results = new Array<R>(items.length);
  let next = 0;
  const width = Math.max(1, Math.min(limit, items.length));

  async function run(): Promise<void> {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: width }, () => run()));
  return results;
}
