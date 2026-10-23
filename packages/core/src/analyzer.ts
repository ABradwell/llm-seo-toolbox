import * as cheerio from "cheerio";
import { NodeHtmlMarkdown } from "node-html-markdown";

import type {
  AgentFetchComparison,
  AuditCheck,
  AuditCoverage,
  AuditFix,
  AuditPage,
  AuditPillar,
  AuditResult,
  AuditScope,
  CheckEvidence,
  CheckFix,
  CheckStatus,
  CrawlerIntent,
  DiscoveryFile,
  FixLanguage,
  FreshnessSignal,
  PageAuditResult,
  RemovedNoise,
  SiteClassification,
  SiteProfile,
  SiteType,
  VisionPayload,
} from "./types";

import { aggregatePageChecks, directPageChecks } from "./aggregate";
import { compareAgentFetch, crawlerUserAgent } from "./agent-fetch";
import { classifySite } from "./classifier";
import { buildContentModel, type ContentModel } from "./content";
import { crawlersByIntent } from "./crawlers";
import { fetchText, type FetchTextOutcome } from "./fetch-page";
import { sectionForPath } from "./llms";
import {
  extractLlmsTxtLinks,
  llmsTxtCoverage,
  resolveLlmsTxtLinks,
  validateLlmsTxt,
  type LlmsResolvedLink,
  type LlmsTxtCoverage,
  type LlmsTxtValidation,
} from "./llms-txt";
import { extractMetadata, type PageMetadata } from "./metadata";
import { analyzePage, extractJsonLd, failedPage } from "./page-audit";
import {
  AI_CRAWLERS,
  crawlerAccessOnPaths,
  emptyRobots,
  hasExplicitAiPolicy,
  parseRobots,
  type RobotsData,
} from "./robots";
import {
  buildInventory,
  mapWithConcurrency,
  SAMPLE_CONCURRENCY,
  SAMPLE_DEADLINE_MS,
  selectSample,
  SITE_SAMPLE_SIZE,
} from "./sampling";
import { compareFixPriority, gradeFor, scoreAudit, scorePillar } from "./score";
import { assertSafeUrl, UnsafeUrlError } from "./security";
import { looksLikeHtml, parseSitemap } from "./sitemap";
import { pathLabel, prettyDomain } from "./url";
import { formatBytes, formatNumber, normalizeWhitespace } from "./format";

const RAW_PREVIEW_LIMIT = 22_000;
const MARKDOWN_LIMIT = 42_000;
const STANDARD_TIMEOUT_MS = 6_000;
const PAGE_MAX_BYTES = 1_500_000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const SITE_CACHE_MAX_ENTRIES = 30;
const FOCUS_CACHE_MAX_ENTRIES = 50;
const PAGE_SCOPE_CACHE_MAX_ENTRIES = 20;

export interface AnalyzeOptions {
  /** A user-pinned V3 profile; the automatic classification is still reported. */
  siteType?: SiteType | null;
  /** Site-scoped by default; `page` keeps the V2 hybrid audit. */
  scope?: AuditScope;
  /** Per-request timeout. Defaults to the tuned web-audit budget. */
  timeoutMs?: number;
  /** Overrides the crawler user agent for every request in this audit. */
  userAgent?: string;
  /** Set to false to bypass the in-process result cache (used by the CLI). */
  cache?: boolean;
  /** Set to false to skip the optional HEAD checks on llms.txt links. */
  resolveLinks?: boolean;
  /** Set to false to skip the live AI user-agent fetch comparison. */
  agentFetch?: boolean;
  /** Extra request headers, used for protected previews and staging hosts. */
  headers?: Record<string, string>;
}

const SCORING_VERSION = "site-2" as const;

interface FetchSettings {
  timeoutMs: number;
  userAgent?: string;
  headers?: Record<string, string>;
}

export class AuditError extends Error {
  readonly code: string;
  readonly status: number;
  readonly hint?: string;

  constructor(code: string, message: string, status = 400, hint?: string) {
    super(message);
    this.name = "AuditError";
    this.code = code;
    this.status = status;
    this.hint = hint;
  }
}

interface SiteBase {
  finalUrl: string;
  origin: string;
  profile: SiteProfile;
  classification: SiteClassification;
  pages: AuditPage[];
  files: DiscoveryFile[];
  pillars: AuditPillar[];
  score: number;
  grade: ReturnType<typeof gradeFor>;
  fixes: AuditFix[];
  coverage: AuditCoverage;
  pageResults: PageAuditResult[];
  seedPage: PageAuditResult;
  seedVision: VisionPayload;
  freshness: FreshnessSignal | null;
  agentFetch: AgentFetchComparison[];
  crawledAt: string;
}

interface FocusBase {
  page: PageAuditResult;
  vision: VisionPayload;
}

interface CacheEntry<T> {
  expires: number;
  value: T;
}

const siteCache = new Map<string, CacheEntry<SiteBase>>();
const focusCache = new Map<string, CacheEntry<FocusBase>>();
const pageScopeCache = new Map<string, CacheEntry<AuditResult>>();

function readCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
): { value: T; cached: boolean } | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    cache.delete(key);
    return null;
  }
  return { value: hit.value, cached: true };
}

function writeCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  value: T,
  maxEntries: number,
): void {
  if (cache.size >= maxEntries) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { expires: Date.now() + CACHE_TTL_MS, value });
}

/** Test and instrumentation hook; the cache is in-memory per instance. */
export function clearAuditCache(): void {
  siteCache.clear();
  focusCache.clear();
  pageScopeCache.clear();
}

function check(
  input: Omit<AuditCheck, "weight" | "scope"> & { weight?: number; scope?: AuditCheck["scope"] },
): AuditCheck {
  return { weight: input.weight ?? 1, scope: input.scope ?? "site", ...input };
}

function fix(language: FixLanguage, code: string): CheckFix {
  return { language, code: code.trim() };
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

/** Returns a source line as evidence, trimmed and capped for transport. */
function evidenceAt(file: string, line: number | null, source?: string): CheckEvidence {
  if (line === null) return { file, line: null, snippet: null };
  const snippet = source?.split(/\r?\n/)[line - 1]?.trim() ?? null;
  return { file, line, snippet: snippet ? snippet.slice(0, 240) : null };
}

function lineOfFirstMatch(source: string, pattern: RegExp): number | null {
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (pattern.test(lines[index])) return index + 1;
  }
  return null;
}

function truncateForTransport(value: string, limit: number): { text: string; truncated: boolean } {
  if (value.length <= limit) return { text: value, truncated: false };
  return { text: `${value.slice(0, limit)}\n\n<!-- preview truncated -->`, truncated: true };
}

function probeErrorMessage(error: unknown): string {
  if (error instanceof UnsafeUrlError) return error.message;
  return "The site could not be fetched.";
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${formatNumber(count)} ${count === 1 ? singular : pluralForm}`;
}

// ---------------------------------------------------------------------------
// Fetching helpers
// ---------------------------------------------------------------------------

interface SitemapBudget {
  remaining: number;
  fetched: number;
  childCount: number;
  lastStatus: number | null;
  foundXml: boolean;
  firstUrlLine: number | null;
  lastmods: Record<string, string>;
}

async function expandSitemap(
  url: string,
  budget: SitemapBudget,
  settings: FetchSettings,
  depth = 0,
): Promise<string[]> {
  if (budget.remaining <= 0 || depth > 1) return [];

  budget.remaining -= 1;
  budget.fetched += 1;

  const response = await fetchText(url, {
    accept: "application/xml,text/xml,application/xhtml+xml,*/*;q=0.5",
    timeoutMs: settings.timeoutMs,
    userAgent: settings.userAgent,
    headers: settings.headers,
    maxBytes: 4_000_000,
  });

  if (response.status) budget.lastStatus = response.status;
  if (!response.ok || looksLikeHtml(response.body)) return [];

  const parsed = parseSitemap(response.body);
  if (parsed.kind === "unknown") return [];

  budget.foundXml = true;
  if (budget.firstUrlLine === null && parsed.urls.length > 0) {
    budget.firstUrlLine = lineOfFirstMatch(response.body, /<loc[\s>]/i) ?? 1;
  }

  for (const [pageUrl, lastmod] of Object.entries(parsed.lastmods)) {
    budget.lastmods[pageUrl] = lastmod;
  }

  if (parsed.kind === "urlset") return parsed.urls;

  budget.childCount = Math.max(budget.childCount, parsed.sitemaps.length);
  const children = parsed.sitemaps.slice(0, 3);
  const results = await Promise.all(
    children.map((child) => expandSitemap(child, budget, settings, depth + 1)),
  );
  return results.flat();
}

interface SitemapOutcome {
  found: boolean;
  urls: string[];
  filesFetched: number;
  lastStatus: number | null;
  note: string;
  bytes: number;
  primaryUrl: string;
  firstUrlLine: number | null;
  /** URL → sitemap lastmod for every URL that declares one. */
  lastmods: Record<string, string>;
}

async function loadSitemap(
  origin: string,
  robots: RobotsData,
  primary: FetchTextOutcome,
  settings: FetchSettings,
): Promise<SitemapOutcome> {
  const budget: SitemapBudget = {
    remaining: 5,
    fetched: 0,
    childCount: 0,
    lastStatus: primary.status || null,
    foundXml: false,
    firstUrlLine: null,
    lastmods: {},
  };

  const primaryUrl = new URL("/sitemap.xml", origin).toString();
  let urls = await expandSitemap(primaryUrl, budget, settings);
  let primaryUrlUsed = primaryUrl;

  if (urls.length === 0) {
    const directives = robots.sitemaps
      .filter((candidate) => {
        try {
          const parsed = new URL(candidate);
          return parsed.protocol === "http:" || parsed.protocol === "https:";
        } catch {
          return false;
        }
      })
      .slice(0, 2);

    for (const directive of directives) {
      const parsed = await expandSitemap(directive, budget, settings);
      if (parsed.length > 0) {
        urls = parsed;
        primaryUrlUsed = directive;
        break;
      }
    }
  }

  if (urls.length === 0) {
    const fallback = `${origin}/sitemap_index.xml`;
    const parsed = await expandSitemap(fallback, budget, settings);
    if (parsed.length > 0) {
      urls = parsed;
      primaryUrlUsed = fallback;
    }
  }

  const unique = [...new Set(urls)];
  const found = budget.foundXml || urls.length > 0;

  return {
    found,
    urls: unique,
    filesFetched: budget.fetched,
    lastStatus: budget.lastStatus,
    bytes: primary.bytes,
    primaryUrl: primaryUrlUsed,
    firstUrlLine: budget.firstUrlLine,
    lastmods: budget.lastmods,
    note: found
      ? `${formatNumber(unique.length)} URLs across ${budget.fetched} file${budget.fetched === 1 ? "" : "s"}`
      : primary.status === 404
        ? "Not published"
        : "Not usable",
  };
}

interface ProbeResult {
  found: boolean;
  path: string | null;
  url: string | null;
  status: number | null;
  bytes: number;
  detail: string;
}

interface WellKnownProbe extends ProbeResult {
  entries: string[];
  apiCatalog: boolean;
  security: boolean;
  /** OpenAPI descriptions advertised by the RFC 9727 API catalog. */
  openApiLinks: string[];
}

interface ApiCatalogProbe {
  found: boolean;
  links: string[];
  status: number | null;
  bytes: number;
  detail: string;
}

function linksetHrefs(value: unknown, origin: string): string[] {
  const hrefs: string[] = [];

  const visit = (entry: unknown): void => {
    if (typeof entry === "string") {
      hrefs.push(entry);
      return;
    }
    if (!entry || typeof entry !== "object") return;
    const record = entry as Record<string, unknown>;
    const type = String(record.type ?? "").toLowerCase();
    const href = typeof record.href === "string" ? record.href : null;
    if (href && (/openapi|swagger|api\.(?:json|ya?ml)/i.test(href) || type.includes("openapi"))) {
      try {
        hrefs.push(new URL(href, origin).toString());
      } catch {
        // Ignore malformed catalog links.
      }
    }
    for (const key of ["linkset", "service-desc", "service-doc", "describedby", "item"]) {
      const nested = record[key];
      if (Array.isArray(nested)) nested.forEach(visit);
      else if (nested !== undefined) visit(nested);
    }
  };

  if (Array.isArray(value)) value.forEach(visit);
  else visit(value);
  return [...new Set(hrefs)];
}

async function probeApiCatalog(origin: string, settings: FetchSettings): Promise<ApiCatalogProbe> {
  const path = "/.well-known/api-catalog";
  const response = await fetchText(new URL(path, origin), {
    accept: "application/linkset+json,application/json,*/*;q=0.5",
    timeoutMs: settings.timeoutMs,
    userAgent: settings.userAgent,
    headers: settings.headers,
    maxBytes: 400_000,
  });

  if (!response.ok || looksLikeHtml(response.body)) {
    return {
      found: false,
      links: [],
      status: response.status || null,
      bytes: response.bytes,
      detail: "No RFC 9727 API catalog was found.",
    };
  }

  try {
    const parsed = JSON.parse(response.body) as Record<string, unknown>;
    const linkset = parsed.linkset;
    if (!Array.isArray(linkset)) throw new Error("missing linkset");
    const links = linksetHrefs(linkset, origin);
    return {
      found: true,
      links,
      status: response.status,
      bytes: response.bytes,
      detail:
        links.length > 0
          ? `The API catalog advertises ${plural(links.length, "OpenAPI description")}.`
          : "An API catalog is published, but it does not advertise an OpenAPI description.",
    };
  } catch {
    return {
      found: false,
      links: [],
      status: response.status,
      bytes: response.bytes,
      detail: "The API catalog could not be parsed as an RFC 9727 linkset.",
    };
  }
}

async function probeOpenApi(
  origin: string,
  settings: FetchSettings,
  catalogLinks: readonly string[] = [],
): Promise<ProbeResult> {
  const candidates = [
    ...new Set(["/openapi.json", "/.well-known/openapi.json", "/openapi.yaml", ...catalogLinks]),
  ];

  const results = await Promise.all(
    candidates.map(async (candidate) => {
      let url: URL;
      try {
        url = new URL(candidate, origin);
      } catch {
        return null;
      }
      const response = await fetchText(url, {
        accept: "application/json,application/yaml,text/yaml,*/*;q=0.5",
        timeoutMs: settings.timeoutMs,
        userAgent: settings.userAgent,
        headers: settings.headers,
        maxBytes: 1_000_000,
      });

      const head = response.body.slice(0, 3_000);
      const looksStructured =
        response.ok &&
        !looksLikeHtml(response.body) &&
        (/"(openapi|swagger)"\s*:/.test(head) || /^\s*(openapi|swagger)\s*:/im.test(head));

      return { path: url.pathname, url: url.toString(), response, looksStructured };
    }),
  );

  const hit = results.find((entry) => entry?.looksStructured);
  if (!hit) {
    return {
      found: false,
      path: null,
      url: null,
      status: null,
      bytes: 0,
      detail:
        "No OpenAPI description was found at /openapi.json, the usual .well-known paths, or the API catalog.",
    };
  }

  return {
    found: true,
    path: hit.path,
    url: hit.url,
    status: hit.response.status,
    bytes: hit.response.bytes,
    detail: `An API description is published at ${hit.path}.`,
  };
}

async function probeWellKnown(origin: string, settings: FetchSettings): Promise<WellKnownProbe> {
  const [catalog, security] = await Promise.all([
    probeApiCatalog(origin, settings),
    (async () => {
      const response = await fetchText(new URL("/.well-known/security.txt", origin), {
        accept: "text/plain,*/*;q=0.5",
        timeoutMs: settings.timeoutMs,
        userAgent: settings.userAgent,
        headers: settings.headers,
        maxBytes: 400_000,
      });
      return {
        path: "/.well-known/security.txt",
        response,
        valid: response.ok && /contact\s*:/i.test(response.body),
      };
    })(),
  ]);

  const entries = [
    ...(catalog.found ? ["/.well-known/api-catalog"] : []),
    ...(security.valid ? ["/.well-known/security.txt"] : []),
  ];
  const first = catalog.found
    ? { path: "/.well-known/api-catalog", status: catalog.status, bytes: catalog.bytes }
    : security.valid
      ? {
          path: security.path,
          status: security.response.status,
          bytes: security.response.bytes,
        }
      : null;

  if (!first) {
    return {
      found: false,
      path: null,
      url: null,
      status: null,
      bytes: 0,
      detail: "No API catalog or security.txt document was found under /.well-known/.",
      entries: [],
      apiCatalog: false,
      security: false,
      openApiLinks: [],
    };
  }

  return {
    found: true,
    path: first.path,
    url: new URL(first.path, origin).toString(),
    status: first.status,
    bytes: first.bytes,
    detail:
      entries.length > 0
        ? `Discovery documents found: ${entries.join(", ")}.${catalog.detail !== "No RFC 9727 API catalog was found." ? ` ${catalog.detail}` : ""}`
        : "No .well-known discovery documents were found.",
    entries,
    apiCatalog: catalog.found,
    security: security.valid,
    openApiLinks: catalog.links,
  };
}

// ---------------------------------------------------------------------------
// Discovery probes
// ---------------------------------------------------------------------------

interface FeedProbe {
  found: boolean;
  url: string | null;
  status: number | null;
  items: number;
  line: number | null;
  detail: string;
}

interface MarkdownProbe {
  offered: boolean;
  url: string | null;
  path: string;
  line: number | null;
  matched: boolean;
  via: "negotiation" | "alternate" | "sibling" | null;
  detail: string;
}

interface AgentFetchProbe {
  status: CheckStatus;
  comparisons: AgentFetchComparison[];
  detail: string;
}

function feedItemCount(body: string): number {
  const rss = body.match(/<item[\s>]/gi)?.length ?? 0;
  const atom = body.match(/<entry[\s>]/gi)?.length ?? 0;
  if (rss > 0 || atom > 0) return Math.max(rss, atom);
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    return Array.isArray(parsed.items) ? parsed.items.length : 0;
  } catch {
    return 0;
  }
}

async function probeFeed(metadata: PageMetadata, settings: FetchSettings): Promise<FeedProbe> {
  const link = metadata.feeds[0];
  if (!link) {
    return {
      found: false,
      url: null,
      status: null,
      items: 0,
      line: null,
      detail: "The homepage does not advertise an RSS, Atom or JSON feed.",
    };
  }

  const response = await fetchText(link.href, {
    accept:
      "application/rss+xml,application/atom+xml,application/feed+json,application/json,*/*;q=0.5",
    timeoutMs: settings.timeoutMs,
    userAgent: settings.userAgent,
    headers: settings.headers,
    maxBytes: 1_000_000,
  });

  if (!response.ok || looksLikeHtml(response.body)) {
    return {
      found: true,
      url: link.href,
      status: response.status || null,
      items: 0,
      line: link.line,
      detail: !response.ok
        ? `The feed link returns HTTP ${response.status || "no response"}.`
        : "The feed link returns an HTML page rather than a feed document.",
    };
  }

  const items = feedItemCount(response.body);
  return {
    found: true,
    url: link.href,
    status: response.status,
    items,
    line: link.line,
    detail:
      items > 0
        ? `The feed resolves to ${plural(items, "item")}.`
        : "The feed resolves, but it does not contain any items.",
  };
}

function normalizeHeading(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function headingMatches(markdown: string, pageHeading: string): boolean {
  const first = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/m.exec(markdown)?.[1] ?? "";
  const left = normalizeHeading(first);
  const right = normalizeHeading(pageHeading);
  if (!left || !right) return false;
  if (left === right || left.includes(right) || right.includes(left)) return true;

  const leftTokens = new Set(left.split(" ").filter((token) => token.length > 2));
  const rightTokens = new Set(right.split(" ").filter((token) => token.length > 2));
  if (leftTokens.size === 0 || rightTokens.size === 0) return false;
  let shared = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) shared += 1;
  return shared / Math.min(leftTokens.size, rightTokens.size) >= 0.6;
}

function looksLikeMarkdown(body: string): boolean {
  return !looksLikeHtml(body) && /^\s{0,3}#{1,6}\s+\S/m.test(body);
}

async function probeMarkdownMirror(input: {
  pageUrl: string;
  metadata: PageMetadata;
  pageHeading: string;
  settings: FetchSettings;
}): Promise<MarkdownProbe> {
  const { pageUrl, metadata, pageHeading, settings } = input;
  const pagePath = new URL(pageUrl).pathname;

  const evaluate = (
    body: string,
    url: string,
    line: number | null,
    via: MarkdownProbe["via"],
  ): MarkdownProbe => {
    if (!body.trim()) {
      return {
        offered: true,
        url,
        path: new URL(url).pathname,
        line,
        matched: false,
        via,
        detail: "A markdown response was returned, but it was empty.",
      };
    }
    const matched = headingMatches(body, pageHeading);
    return {
      offered: true,
      url,
      path: new URL(url).pathname,
      line,
      matched,
      via,
      detail: matched
        ? `Markdown is available at ${new URL(url).pathname} and its first heading matches the page H1.`
        : "Markdown was returned, but its first heading does not match the page H1.",
    };
  };

  const negotiation = await fetchText(pageUrl, {
    accept: "text/markdown,text/x-markdown,text/plain;q=0.8,text/html;q=0.5",
    timeoutMs: settings.timeoutMs,
    userAgent: settings.userAgent,
    headers: settings.headers,
    maxBytes: 1_500_000,
  });
  if (
    negotiation.ok &&
    (/text\/(?:x-)?markdown/i.test(negotiation.contentType) || looksLikeMarkdown(negotiation.body))
  ) {
    return evaluate(negotiation.body, negotiation.finalUrl, null, "negotiation");
  }

  const alternate = metadata.markdownAlternates[0];
  if (alternate) {
    const response = await fetchText(alternate.href, {
      accept: "text/markdown,text/x-markdown,text/plain;q=0.8,*/*;q=0.5",
      timeoutMs: settings.timeoutMs,
      userAgent: settings.userAgent,
      headers: settings.headers,
      maxBytes: 1_500_000,
    });
    if (response.ok && looksLikeMarkdown(response.body)) {
      return evaluate(response.body, response.finalUrl, alternate.line, "alternate");
    }
  }

  const sibling = new URL(pageUrl);
  sibling.pathname = pagePath.endsWith("/")
    ? `${pagePath}index.md`
    : `${pagePath.replace(/\/$/, "")}.md`;
  sibling.search = "";
  const siblingResponse = await fetchText(sibling, {
    accept: "text/markdown,text/x-markdown,text/plain;q=0.8,*/*;q=0.5",
    timeoutMs: settings.timeoutMs,
    userAgent: settings.userAgent,
    headers: settings.headers,
    maxBytes: 1_500_000,
  });
  if (siblingResponse.ok && looksLikeMarkdown(siblingResponse.body)) {
    return evaluate(siblingResponse.body, siblingResponse.finalUrl, null, "sibling");
  }

  return {
    offered: false,
    url: null,
    path: pagePath,
    line: null,
    matched: false,
    via: null,
    detail:
      "No markdown mirror was found through content negotiation, a markdown alternate link or a .md sibling.",
  };
}

async function probeAgentFetch(input: {
  pageUrl: string;
  baseline: FetchTextOutcome;
  settings: FetchSettings;
}): Promise<AgentFetchProbe> {
  const { pageUrl, baseline, settings } = input;
  const fetchAs = (label: string): Promise<FetchTextOutcome> =>
    fetchText(pageUrl, {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.6",
      timeoutMs: settings.timeoutMs,
      userAgent: crawlerUserAgent(label),
      headers: settings.headers,
      maxBytes: 2_500_000,
    });

  const gpt = await fetchAs("GPTBot");
  const gptComparison = compareAgentFetch({
    userAgent: "GPTBot",
    baseline,
    response: gpt,
  });

  let searchComparison: AgentFetchComparison | null = null;
  if (gptComparison.blocked) {
    const search = await fetchAs("OAI-SearchBot");
    searchComparison = compareAgentFetch({
      userAgent: "OAI-SearchBot",
      baseline,
      response: search,
    });
  }

  const comparisons = searchComparison ? [gptComparison, searchComparison] : [gptComparison];
  const challenge = comparisons.find((entry) => entry.challenge)?.challenge ?? null;
  const searchBlocked = searchComparison?.blocked ?? false;

  let status: CheckStatus;
  let detail: string;
  if (searchBlocked || challenge) {
    status = "fail";
    detail = `${gptComparison.detail}${searchComparison ? ` ${searchComparison.detail}` : ""}${
      challenge
        ? ` The ${challenge} challenge page blocks agents before they can read robots.txt.`
        : ""
    }`;
  } else if (gptComparison.blocked) {
    status = "warn";
    detail = `${gptComparison.detail} OAI-SearchBot is allowed, so this looks like a training-only block.`;
  } else {
    status = "pass";
    detail = `${gptComparison.detail} The default fetch and the GPTBot fetch are consistent.`;
  }

  return { status, comparisons, detail };
}

function lastmodFor(url: string, lastmods: Record<string, string>): string | null {
  const direct = lastmods[url];
  if (direct) return direct;
  const trimmed = url.replace(/\/$/, "");
  for (const [key, value] of Object.entries(lastmods)) {
    if (key.replace(/\/$/, "") === trimmed) return value;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Document extraction
// ---------------------------------------------------------------------------

function extractLinks($: cheerio.CheerioAPI, base: URL): string[] {
  const links = new Set<string>();

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    if (/^(mailto:|tel:|javascript:|data:|#)/i.test(href)) return;

    try {
      const url = new URL(href, base);
      if (url.origin !== base.origin) return;
      url.hash = "";
      links.add(url.toString());
    } catch {
      // Ignore malformed hrefs.
    }
  });

  return [...links].slice(0, 150);
}

function buildVision(input: { html: string; title: string; content: ContentModel }): VisionPayload {
  const { html, title, content } = input;
  const removed: RemovedNoise = { scripts: 0, styles: 0, landmarks: 0, svg: 0, frames: 0 };

  const previewDoc = cheerio.load(html);
  previewDoc("script").each((_, element) => {
    removed.scripts += 1;
    const length = byteLength(previewDoc(element).text());
    previewDoc(element).replaceWith(`<!-- script removed: ${length} chars -->`);
  });
  previewDoc("style").each((_, element) => {
    removed.styles += 1;
    const length = byteLength(previewDoc(element).text());
    previewDoc(element).replaceWith(`<!-- style removed: ${length} chars -->`);
  });
  previewDoc("svg").each((_, element) => {
    removed.svg += 1;
    previewDoc(element).replaceWith("<!-- svg removed -->");
  });
  previewDoc("iframe").each((_, element) => {
    removed.frames += 1;
    previewDoc(element).replaceWith("<!-- iframe removed -->");
  });

  const previewHtml = previewDoc.html() ?? "";
  const raw = truncateForTransport(previewHtml, RAW_PREVIEW_LIMIT);

  removed.landmarks = content.removed.landmarks;

  const nhm = new NodeHtmlMarkdown({ maxConsecutiveNewlines: 2 });
  let markdown = nhm
    .translate(content.cleanHtml)
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();

  if (markdown && !markdown.startsWith("#")) {
    markdown = `# ${title || "Page content"}\n\n${markdown}`;
  }
  if (!markdown) {
    markdown = `# ${title || "Page content"}\n\n_No readable content was found in the initial HTML response._`;
  }

  const markdownPreview = truncateForTransport(markdown, MARKDOWN_LIMIT);
  const textBytes = content.textBytes;
  const htmlBytes = byteLength(html);
  const markdownBytes = byteLength(markdown);
  const reductionPct =
    htmlBytes > 0 ? Math.max(0, Math.round((1 - markdownBytes / htmlBytes) * 100)) : 0;

  return {
    rawHtml: raw.text,
    markdown: markdownPreview.text,
    htmlBytes,
    markdownBytes,
    textBytes,
    reductionPct,
    tokenEstimate: {
      html: Math.ceil(htmlBytes / 4),
      markdown: Math.ceil(markdownBytes / 4),
    },
    removed,
    rawTruncated: raw.truncated,
    markdownTruncated: markdownPreview.truncated,
  };
}

function buildFiles(
  origin: string,
  robotsResponse: FetchTextOutcome,
  llmsResponse: FetchTextOutcome,
  llmsFullResponse: FetchTextOutcome,
  sitemap: SitemapOutcome,
  openApi: ProbeResult,
  wellKnown: ProbeResult,
): DiscoveryFile[] {
  const file = (
    id: string,
    label: string,
    path: string,
    response: FetchTextOutcome,
    note: string,
  ): DiscoveryFile => ({
    id,
    label,
    path,
    url: new URL(path, origin).toString(),
    found: response.ok,
    statusCode: response.status || null,
    bytes: response.bytes,
    note,
  });

  return [
    file(
      "llms-txt",
      "llms.txt",
      "/llms.txt",
      llmsResponse,
      llmsResponse.ok
        ? "Published"
        : llmsResponse.status === 404
          ? "Not published"
          : "Could not verify",
    ),
    file(
      "llms-full-txt",
      "llms-full.txt",
      "/llms-full.txt",
      llmsFullResponse,
      llmsFullResponse.ok
        ? "Published"
        : llmsFullResponse.status === 404
          ? "Optional, not published"
          : "Could not verify",
    ),
    {
      id: "sitemap",
      label: "sitemap.xml",
      path: new URL(sitemap.primaryUrl).pathname,
      url: sitemap.primaryUrl,
      found: sitemap.found,
      statusCode: sitemap.lastStatus,
      bytes: sitemap.bytes,
      note: sitemap.note,
    },
    file(
      "robots-txt",
      "robots.txt",
      "/robots.txt",
      robotsResponse,
      robotsResponse.ok
        ? "Published"
        : robotsResponse.status === 404
          ? "Not published"
          : "Could not verify",
    ),
    {
      id: "openapi",
      label: "OpenAPI",
      path: openApi.path ?? "/openapi.json",
      url: openApi.url ?? new URL("/openapi.json", origin).toString(),
      found: openApi.found,
      statusCode: openApi.status,
      bytes: openApi.bytes,
      note: openApi.found ? "Schema available" : "Not found",
    },
    {
      id: "well-known",
      label: ".well-known",
      path: wellKnown.path ?? "/.well-known/",
      url: wellKnown.path
        ? new URL(wellKnown.path, origin).toString()
        : new URL("/.well-known/", origin).toString(),
      found: wellKnown.found,
      statusCode: wellKnown.status,
      bytes: wellKnown.bytes,
      note: wellKnown.found ? "Discovery documents found" : "Nothing found",
    },
  ];
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

function buildDiscoveryPillar(input: {
  origin: string;
  llms: FetchTextOutcome;
  llmsFull: FetchTextOutcome;
  sitemap: SitemapOutcome;
  robots: RobotsData;
  robotsBody: string;
  profileType: SiteType;
  feed: FeedProbe;
  markdown: MarkdownProbe;
  llmsResolved: readonly LlmsResolvedLink[];
  llmsCoverage: LlmsTxtCoverage | null;
  pageDiscovery: AuditCheck[];
}): AuditPillar {
  const {
    origin,
    llms,
    llmsFull,
    sitemap,
    robots,
    robotsBody,
    profileType,
    feed,
    markdown,
    llmsResolved,
    llmsCoverage,
    pageDiscovery,
  } = input;
  const checks: AuditCheck[] = [];

  const llmsIsText = llms.ok && !looksLikeHtml(llms.body);
  const llmsValidation: LlmsTxtValidation | null = llmsIsText ? validateLlmsTxt(llms.body) : null;
  const llmsValid = llmsValidation?.valid ?? false;
  const brokenLinks = llmsResolved.filter((link) => !link.ok);
  const lowCoverage = llmsCoverage !== null && llmsCoverage.sampled < 25;

  let llmsStatus: CheckStatus = "fail";
  if (llmsValid) llmsStatus = "pass";
  else if (llmsIsText) llmsStatus = "warn";
  else if (llms.ok) llmsStatus = "warn";
  if (llmsValid && (brokenLinks.length > 0 || lowCoverage)) llmsStatus = "warn";

  const llmsSummary = llmsValid
    ? brokenLinks.length > 0
      ? `Valid · ${plural(brokenLinks.length, "broken link")}`
      : lowCoverage
        ? `Valid · ${llmsCoverage?.sampled ?? 0}% page coverage`
        : `Valid · ${plural(llmsValidation?.linkCount ?? 0, "link")}`
    : llmsIsText
      ? `Invalid · ${plural(llmsValidation?.issues.filter((issue) => issue.severity === "error").length ?? 0, "error")}`
      : llms.ok
        ? `Not text · ${formatBytes(llms.bytes)}`
        : llms.status === 404
          ? "Missing"
          : llms.status === 0
            ? "Unreachable"
            : `HTTP ${llms.status}`;

  const coverageDetail = llmsCoverage
    ? ` Coverage: ${llmsCoverage.sampled}% of sampled pages are linked and ${llmsCoverage.sitemap}% of links appear in the sitemap.`
    : "";
  const resolutionDetail =
    llmsResolved.length > 0
      ? ` Resolved ${plural(llmsResolved.length, "link")}: ${
          brokenLinks.length === 0
            ? "all reachable."
            : `${brokenLinks.length} broken or undeclared off-origin (${brokenLinks
                .map((link) => `${new URL(link.url).pathname} → ${link.status || "no response"}`)
                .join(", ")}).`
        }`
      : "";

  const llmsDetail = llmsValid
    ? `H1 “${llmsValidation?.h1}” with ${plural(llmsValidation?.linkCount ?? 0, "markdown link")} across ${plural(llmsValidation?.sections.length ?? 0, "section")}.${coverageDetail}${resolutionDetail}`
    : !llms.ok
      ? llms.status === 404
        ? "No /llms.txt file was found at the site root, so agents have no curated entry point."
        : `The manifest could not be verified (HTTP ${llms.status || "no response"}).`
      : !llmsIsText
        ? "The URL returns HTML instead of a plain-text manifest, which usually means the host serves a catch-all page for unknown paths."
        : `The file exists but fails the structural checks: ${
            llmsValidation?.issues
              .filter((issue) => issue.severity === "error")
              .map((issue) => issue.message)
              .join(" ") || "missing H1 or markdown links."
          }`;

  const llmsErrorLine =
    llmsValidation?.h1Line ??
    llmsValidation?.issues.find((issue) => issue.line !== null)?.line ??
    (llms.ok ? 1 : null);

  checks.push(
    check({
      id: "llms-txt",
      label: "llms.txt manifest",
      status: llmsStatus,
      summary: llmsSummary,
      detail: llmsDetail,
      protocol: "llmstxt.org · H1 + markdown index",
      evidence: evidenceAt("/llms.txt", llmsErrorLine, llms.body),
      recommendation:
        llmsStatus === "pass"
          ? undefined
          : "Publish /llms.txt with one H1, a blockquote summary and H2 sections linking to the pages an LLM should read first.",
      fix:
        llmsStatus === "pass"
          ? undefined
          : fix(
              "markdown",
              `# Your site name

> One sentence explaining what this site covers and who it is for.

## Documentation
- [Getting started](${origin}/docs/start)
- [API reference](${origin}/docs/api)
- [Authentication](${origin}/docs/auth)`,
            ),
      weight: 3,
    }),
  );

  const llmsFullUsable = llmsFull.ok && !looksLikeHtml(llmsFull.body) && llmsFull.bytes > 50;
  const llmsFullValidation = llmsFullUsable ? validateLlmsTxt(llmsFull.body) : null;
  const llmsFullPaginated = llmsFullValidation?.paginated ?? false;
  const llmsFullStatus: CheckStatus = llmsFullUsable && !llmsFullPaginated ? "pass" : "warn";

  checks.push(
    check({
      id: "llms-full-txt",
      label: "llms-full.txt bundle",
      status: llmsFullStatus,
      summary: llmsFullUsable
        ? llmsFullPaginated
          ? `Paginated · ${formatBytes(llmsFull.bytes)}`
          : `Unpaginated · ${formatBytes(llmsFull.bytes)}`
        : llmsFull.status === 404
          ? "Not published"
          : "Not usable",
      detail: llmsFullUsable
        ? llmsFullPaginated
          ? "The bundle contains pagination markers. A single unpaginated file lets an agent ingest the whole corpus in one request."
          : `One file with ${plural(llmsFullValidation?.lines ?? 0, "line")} of context, ready for single-request ingestion.`
        : llmsFull.status === 404
          ? "The optional expanded manifest is not published."
          : "The optional expanded manifest could not be verified as a plain-text bundle.",
      protocol: "llmstxt.org · llms-full.txt",
      evidence: evidenceAt(
        "/llms-full.txt",
        llmsFullValidation?.h1Line ?? (llmsFull.ok ? 1 : null),
        llmsFull.body,
      ),
      recommendation:
        llmsFullStatus === "pass"
          ? undefined
          : "Publish /llms-full.txt as one unpaginated markdown file containing the long-form content agents should ingest without crawling.",
      fix:
        llmsFullStatus === "pass"
          ? undefined
          : fix(
              "markdown",
              `# Your site name

> The complete documentation bundle.

## Getting started

Full page content in markdown, with no \`?page=\` links and no truncated sections.
`,
            ),
      weight: 1,
    }),
  );

  const sitemapHasUrls = sitemap.urls.length > 0;
  const hasDirective = robots.sitemapLines.length > 0;
  const directiveLine = robots.sitemapLines[0] ?? null;
  const sitemapStatus: CheckStatus = sitemapHasUrls
    ? hasDirective
      ? "pass"
      : "warn"
    : sitemap.found
      ? "warn"
      : sitemap.lastStatus === 404
        ? "fail"
        : "warn";
  const lastmodCount = sitemap.urls.filter((url) => lastmodFor(url, sitemap.lastmods)).length;
  const lastmodShare =
    sitemap.urls.length === 0 ? 0 : Math.round((lastmodCount / sitemap.urls.length) * 100);

  checks.push(
    check({
      id: "sitemap",
      label: "sitemap + robots directive",
      status: sitemapStatus,
      summary: sitemapHasUrls
        ? `${formatNumber(sitemap.urls.length)} URLs${hasDirective ? " · directive" : " · no directive"}`
        : sitemap.found
          ? "Empty"
          : sitemap.lastStatus === 404
            ? "Missing"
            : "Unverified",
      detail: sitemapHasUrls
        ? `Discovered ${formatNumber(sitemap.urls.length)} indexable URLs from ${sitemap.primaryUrl}.${
            hasDirective
              ? ` robots.txt references a sitemap on line ${directiveLine}.`
              : " robots.txt does not reference the sitemap with a Sitemap: directive."
          }${sitemapHasUrls ? ` ${lastmodCount} of ${formatNumber(sitemap.urls.length)} URLs (${lastmodShare}%) declare a lastmod.` : ""}`
        : sitemap.found
          ? "A sitemap was found but did not contain any usable URLs."
          : "No usable XML sitemap was found at /sitemap.xml or the locations referenced in robots.txt.",
      protocol: "sitemaps.org · RFC 9309 Sitemap directive",
      evidence: hasDirective
        ? evidenceAt("/robots.txt", directiveLine, robotsBody)
        : sitemapHasUrls
          ? evidenceAt("/sitemap.xml", sitemap.firstUrlLine)
          : evidenceAt("/sitemap.xml", null),
      recommendation:
        sitemapStatus === "pass"
          ? undefined
          : "Publish an XML sitemap at /sitemap.xml, keep it fresh, and reference it from robots.txt with a Sitemap: directive.",
      fix:
        sitemapStatus === "pass"
          ? undefined
          : fix(
              "robots",
              `# robots.txt
Sitemap: ${origin}/sitemap.xml

# /sitemap.xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${origin}/docs/start</loc></url>
</urlset>`,
            ),
      weight: 2,
    }),
  );

  const feedExpected = profileType === "blog-media";
  const feedWeight = feedExpected ? 1 : profileType === "docs" || profileType === "saas" ? 0.5 : 0;
  const feedStatus: CheckStatus = feed.found
    ? feed.items > 0
      ? "pass"
      : "warn"
    : feedExpected
      ? "fail"
      : "info";

  checks.push(
    check({
      id: "feed",
      label: "RSS or Atom feed",
      status: feedStatus,
      summary: feed.found ? plural(feed.items, "item") : "No feed",
      detail: feed.detail,
      protocol: "RSS 2.0 · Atom · JSON Feed",
      evidence: feed.url
        ? evidenceAt(new URL(feed.url).pathname, feed.line ?? null)
        : evidenceAt("/", null),
      recommendation:
        feedStatus === "pass" || feedStatus === "info"
          ? undefined
          : 'Publish an RSS or Atom feed and link it from the homepage with <link rel="alternate" type="application/rss+xml">.',
      fix:
        feedStatus === "pass" || feedStatus === "info"
          ? undefined
          : fix(
              "html",
              `<link rel="alternate" type="application/rss+xml" title="Your site feed" href="${origin}/feed.xml" />`,
            ),
      weight: feedWeight,
    }),
  );

  const markdownScored = profileType === "docs" || profileType === "saas";
  const markdownStatus: CheckStatus =
    markdown.offered && markdownScored ? (markdown.matched ? "pass" : "warn") : "info";
  const markdownSummary = !markdown.offered
    ? "Not offered"
    : markdown.via === "negotiation"
      ? "Content negotiation"
      : markdown.via === "alternate"
        ? "Alternate link"
        : ".md sibling";

  checks.push(
    check({
      id: "markdown-mirror",
      label: "Markdown for agents",
      status: markdownStatus,
      summary: markdownSummary,
      detail: markdown.detail,
      protocol: "text/markdown content negotiation · link rel=alternate",
      evidence: evidenceAt(markdown.path, markdown.line),
      recommendation:
        markdownStatus === "pass" || markdownStatus === "info"
          ? undefined
          : 'Serve a markdown version through Accept: text/markdown, a <link rel="alternate" type="text/markdown"> tag, or a .md sibling path.',
      fix:
        markdownStatus === "pass" || markdownStatus === "info"
          ? undefined
          : fix(
              "http",
              `# Content negotiation for agents
Accept: text/markdown → return the markdown source of the page

# Or advertise a sibling
<link rel="alternate" type="text/markdown" href="/docs/start.md" />`,
            ),
      weight: markdownScored ? 1.5 : 0,
    }),
  );

  checks.push(...pageDiscovery);

  return {
    id: "discovery",
    name: "Discovery & Manifests",
    shortName: "Discovery",
    description: "Can an agent find a curated, standards-compliant index of the content?",
    score: 0,
    checks,
  };
}

function buildAccessPillar(input: {
  origin: string;
  robots: RobotsData;
  robotsResponse: FetchTextOutcome;
  paths: string[];
  agent: AgentFetchProbe | null;
  agentFetchEnabled: boolean;
  pageAccess: {
    metaRobots: AuditCheck;
    xRobotsTag: AuditCheck;
  };
}): AuditPillar {
  const { origin, robots, robotsResponse, paths, agent, agentFetchEnabled, pageAccess } = input;
  const checks: AuditCheck[] = [];
  const sampledPaths = [...new Set(paths.length > 0 ? paths : ["/"])];

  let robotsStatus: CheckStatus = "pass";
  if (robotsResponse.status === 404) robotsStatus = "warn";
  else if (!robotsResponse.ok) robotsStatus = "fail";

  checks.push(
    check({
      id: "robots-reachable",
      label: "robots.txt reachable",
      status: robotsStatus,
      summary: robotsResponse.ok
        ? `Found · ${formatBytes(robotsResponse.bytes)}`
        : robotsResponse.status === 404
          ? "Missing"
          : "Unreachable",
      detail: robotsResponse.ok
        ? `Parsed ${plural(robots.groups.length, "user-agent group")} and ${plural(robots.sitemaps.length, "sitemap directive")}.`
        : robotsResponse.status === 404
          ? "No robots.txt exists, so crawler access is implicit rather than explicit."
          : "robots.txt could not be read, so crawler access cannot be verified.",
      protocol: "RFC 9309 §2.2",
      evidence: evidenceAt("/robots.txt", robotsResponse.ok ? 1 : null),
      recommendation:
        robotsStatus === "pass"
          ? undefined
          : "Publish a robots.txt that states your crawler policy explicitly, including the AI user agents you want to allow or block.",
      fix:
        robotsStatus === "pass"
          ? undefined
          : fix(
              "robots",
              `# Search and citation crawlers
User-agent: OAI-SearchBot
Allow: /

User-agent: Claude-SearchBot
Allow: /

User-agent: PerplexityBot
Allow: /

# On-demand fetch agents
User-agent: ChatGPT-User
Allow: /

User-agent: Claude-User
Allow: /

# Training crawlers: Allow or Disallow is a deliberate choice
User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Google-Extended
Allow: /

Sitemap: ${origin}/sitemap.xml`,
            ),
      weight: 1,
    }),
  );

  const explicitPolicy = hasExplicitAiPolicy(robots);
  const aiPolicyStatus: CheckStatus = !robots.exists ? "warn" : explicitPolicy ? "pass" : "warn";
  const aiGroupLine =
    robots.groups.find((group) =>
      group.agents.some((agentName) =>
        AI_CRAWLERS.some((crawler) => crawler.label.toLowerCase() === agentName),
      ),
    )?.line ?? null;

  checks.push(
    check({
      id: "ai-policy",
      label: "Explicit AI user-agent policy",
      status: aiPolicyStatus,
      summary: explicitPolicy
        ? "Explicit groups found"
        : robots.exists
          ? "No AI groups"
          : "No robots.txt",
      detail: explicitPolicy
        ? "robots.txt names at least one AI crawler explicitly, so the policy is auditable."
        : robots.exists
          ? "robots.txt only uses wildcard groups. Add named AI crawler groups so allow/block intent is explicit."
          : "There is no robots.txt to hold an explicit AI crawler policy.",
      protocol: "RFC 9309 §2.2.1",
      evidence: evidenceAt("/robots.txt", aiGroupLine ?? (robots.exists ? 1 : null)),
      recommendation:
        aiPolicyStatus === "pass"
          ? undefined
          : "Add named groups for search, fetch and training crawlers so the allow/block intent is explicit. Blocking training is a valid choice.",
      fix:
        aiPolicyStatus === "pass"
          ? undefined
          : fix(
              "robots",
              `# Search and citation crawlers
User-agent: OAI-SearchBot
Allow: /

# On-demand fetch agents
User-agent: ChatGPT-User
Allow: /

# Training crawlers: choose Allow or Disallow deliberately
User-agent: GPTBot
Allow: /`,
            ),
      weight: 1,
    }),
  );

  const intentEntries = (intent: CrawlerIntent) =>
    crawlersByIntent(intent).map((crawler) => ({
      crawler,
      access: crawlerAccessOnPaths(robots, crawler.label, sampledPaths),
    }));

  const searchEntries = intentEntries("search");
  const fetchEntries = intentEntries("fetch");
  const trainingEntries = intentEntries("training");

  const blockedCrawlers = (entries: typeof searchEntries) =>
    entries.filter((entry) => entry.access.status === "fail");

  const searchBlocked = blockedCrawlers(searchEntries);
  const fetchBlocked = blockedCrawlers(fetchEntries);

  const intentCheck = (
    id: string,
    label: string,
    weight: number,
    entries: typeof searchEntries,
    blocked: typeof searchEntries,
    detailPass: string,
  ): AuditCheck => {
    const firstBlocked = blocked[0];
    const evidenceLine =
      firstBlocked?.access.line ??
      entries.find((entry) => entry.access.line !== null)?.access.line ??
      (robots.exists ? 1 : null);
    return check({
      id,
      label,
      status: blocked.length === 0 ? "pass" : "fail",
      summary:
        blocked.length === 0
          ? `All ${entries.length} allowed`
          : `${blocked.length} of ${entries.length} blocked`,
      detail:
        blocked.length === 0
          ? detailPass
          : `${blocked
              .map(
                (entry) =>
                  `${entry.crawler.label} is blocked on ${entry.access.blockedPaths.join(", ")}`,
              )
              .join("; ")}. The worst sampled path decides each crawler.`,
      protocol: "RFC 9309 §2.2.1 · sampled paths",
      evidence: evidenceAt("/robots.txt", evidenceLine),
      recommendation:
        blocked.length === 0
          ? undefined
          : `Allow ${blocked.map((entry) => entry.crawler.label).join(", ")} on the paths you want cited. Search and fetch agents need the content itself, not only the homepage.`,
      fix:
        blocked.length === 0
          ? undefined
          : fix(
              "robots",
              blocked
                .map(
                  (entry) => `User-agent: ${entry.crawler.label}
Allow: /`,
                )
                .join("\n\n"),
            ),
      weight,
    });
  };

  checks.push(
    intentCheck(
      "access-search",
      "Search and citation crawlers",
      3,
      searchEntries,
      searchBlocked,
      `Every search crawler is allowed on all ${sampledPaths.length} sampled paths, so answers can cite the site.`,
    ),
  );
  checks.push(
    intentCheck(
      "access-fetch",
      "On-demand fetch agents",
      2,
      fetchEntries,
      fetchBlocked,
      `Every on-demand fetch agent is allowed on all ${sampledPaths.length} sampled paths.`,
    ),
  );

  const explicitTraining = trainingEntries.filter((entry) => entry.access.scope === "specific");
  const trainingInherited = trainingEntries.filter((entry) => entry.access.scope !== "specific");
  const trainingStatus: CheckStatus =
    trainingEntries.length > 0 && explicitTraining.length === trainingEntries.length
      ? "pass"
      : "warn";
  const trainingLine =
    trainingInherited.find((entry) => entry.access.line !== null)?.access.line ??
    explicitTraining[0]?.access.line ??
    (robots.exists ? 1 : null);

  checks.push(
    check({
      id: "access-training",
      label: "Training crawlers",
      status: trainingStatus,
      summary: `${explicitTraining.length}/${trainingEntries.length} explicit`,
      detail:
        trainingStatus === "pass"
          ? "Every training crawler is named explicitly. Whether the group allows or disallows training, the choice is auditable."
          : `${trainingInherited.length} training crawler${trainingInherited.length === 1 ? "" : "s"} inherit a wildcard group. Name them explicitly so a decision to allow or block training is visible.`,
      protocol: "RFC 9309 §2.2.1 · explicit training policy",
      evidence: evidenceAt("/robots.txt", trainingLine),
      recommendation:
        trainingStatus === "pass"
          ? undefined
          : "Add explicit groups for the training crawlers you care about. Allow and Disallow are both valid; the point is to make the choice auditable.",
      fix:
        trainingStatus === "pass"
          ? undefined
          : fix(
              "robots",
              `# Training crawlers: choose one policy per vendor
User-agent: GPTBot
Allow: /          # or: Disallow: /

User-agent: ClaudeBot
Allow: /          # or: Disallow: /

User-agent: Google-Extended
Allow: /          # or: Disallow: /`,
            ),
      weight: 1,
    }),
  );

  const agentStatus: CheckStatus = !agentFetchEnabled || !agent ? "info" : agent.status;
  checks.push(
    check({
      id: "agent-fetch",
      label: "AI user-agent firewall check",
      status: agentStatus,
      summary:
        agentStatus === "info"
          ? "Skipped"
          : agentStatus === "pass"
            ? "Agents allowed"
            : agentStatus === "warn"
              ? "Training-only block"
              : "Firewall block",
      detail: !agentFetchEnabled
        ? "The live AI user-agent comparison was disabled for this run."
        : (agent?.detail ?? "The live AI user-agent comparison did not run."),
      protocol: "Live HTTP fetch · GPTBot and OAI-SearchBot",
      evidence: agent
        ? {
            file: "HTTP response headers",
            line: null,
            snippet: agent.comparisons
              .map(
                (entry) =>
                  `${entry.userAgent}: HTTP ${entry.status || "no response"} · ${formatBytes(entry.bytes)}${
                    entry.challenge ? ` · ${entry.challenge} challenge` : ""
                  }`,
              )
              .join("\n"),
          }
        : undefined,
      recommendation:
        agentStatus === "warn" || agentStatus === "fail"
          ? "Allow search and on-demand fetch agents in the firewall as well as in robots.txt. A training-only block should still let OAI-SearchBot and ChatGPT-User through."
          : undefined,
      fix:
        agentStatus === "warn" || agentStatus === "fail"
          ? fix(
              "text",
              `# Firewall runbook
Cloudflare: Security → Bots → enable "AI bots" only for training crawlers, and allow OAI-SearchBot, Claude-SearchBot and PerplexityBot.
Akamai Bot Manager: add the search and fetch agents to the allowlist by user agent.
Generic WAF: exclude OAI-SearchBot, Claude-SearchBot, PerplexityBot, ChatGPT-User and Claude-User from bot challenges.`,
            )
          : undefined,
      weight: 3,
    }),
  );

  const signal = robots.contentSignals[0] ?? null;
  const searchCrawlersAllowed = searchEntries.every((entry) => entry.access.status === "pass");
  const trainingCrawlersBlocked = trainingEntries.every((entry) => entry.access.status === "fail");
  const conflicts: string[] = [];
  if (signal?.search === "no" && searchCrawlersAllowed) {
    conflicts.push("Content-Signal says search=no while every search crawler is allowed");
  }
  if (signal?.aiTrain === "yes" && trainingCrawlersBlocked) {
    conflicts.push("Content-Signal says ai-train=yes while every training crawler is blocked");
  }
  const contentSignalStatus: CheckStatus = !signal
    ? "info"
    : conflicts.length > 0
      ? "warn"
      : "pass";

  checks.push(
    check({
      id: "content-signal",
      label: "Content-Signal directive",
      status: contentSignalStatus,
      summary: signal
        ? `search=${signal.search ?? "?"} · ai-input=${signal.aiInput ?? "?"} · ai-train=${signal.aiTrain ?? "?"}`
        : "Not declared",
      detail: signal
        ? `Cloudflare Content-Signal declares search=${signal.search ?? "unset"}, ai-input=${signal.aiInput ?? "unset"} and ai-train=${signal.aiTrain ?? "unset"}.${
            conflicts.length > 0 ? ` Conflicts: ${conflicts.join("; ")}.` : ""
          }`
        : "robots.txt does not declare a Cloudflare Content-Signal directive. The directive is optional, but it makes AI usage preferences machine-readable.",
      protocol: "Cloudflare Content-Signal · robots.txt",
      evidence: evidenceAt("/robots.txt", signal?.line ?? null),
      recommendation:
        contentSignalStatus === "warn"
          ? "Make the Content-Signal values agree with the crawler groups in robots.txt."
          : undefined,
      fix:
        contentSignalStatus === "warn"
          ? fix(
              "robots",
              `Content-Signal: search=yes, ai-input=yes, ai-train=no
# Keep the crawler groups consistent with these values.`,
            )
          : undefined,
      weight: 0.5,
    }),
  );

  for (const crawler of AI_CRAWLERS) {
    const access = crawlerAccessOnPaths(robots, crawler.label, sampledPaths);
    const recommendation =
      access.status === "fail"
        ? `Update the ${crawler.label} group in robots.txt so the paths you want cited are crawlable.`
        : access.scope === "wildcard" || access.scope === "missing" || access.scope === "none"
          ? `Add an explicit ${crawler.label} group so the allow decision is auditable rather than inherited from a wildcard.`
          : undefined;
    checks.push(
      check({
        id: `bot-${crawler.id}`,
        label: `${crawler.label} access`,
        status: access.status,
        summary: access.summary,
        detail: `${crawler.vendor} · ${crawler.intent} intent: ${access.detail}`,
        protocol: "RFC 9309 §2.2.1 · sampled paths",
        evidence: evidenceAt("/robots.txt", access.line),
        recommendation,
        fix: recommendation
          ? fix(
              "robots",
              `User-agent: ${crawler.label}
Allow: /`,
            )
          : undefined,
        weight: 0,
        sample: {
          total: sampledPaths.length,
          passed: access.allowedCount,
          warned: 0,
          failed: access.blockedPaths.length,
          affected: access.blockedPaths,
        },
      }),
    );
  }

  checks.push(pageAccess.metaRobots, pageAccess.xRobotsTag);

  return {
    id: "access",
    name: "Crawler Access Rules",
    shortName: "Access",
    description: "Are the user agents that power AI answers explicitly allowed in?",
    score: 0,
    checks,
  };
}

function buildParseabilityPillar(checks: AuditCheck[]): AuditPillar {
  return {
    id: "parseability",
    name: "Static Parseability",
    shortName: "Parse",
    description: "Does the first HTML response read like a document, not a script bundle?",
    score: 0,
    checks,
  };
}

function identityHosts(sameAs: readonly string[]): Set<string> {
  const hosts = new Set<string>();
  for (const value of sameAs) {
    try {
      hosts.add(new URL(value).hostname.replace(/^www\./, ""));
    } catch {
      // Ignore malformed sameAs values.
    }
  }
  return hosts;
}

function buildEntityIdentityCheck(input: {
  pageResults: PageAuditResult[];
  profileType: SiteType;
  origin: string;
  siteName: string;
}): AuditCheck {
  const { pageResults, profileType, origin, siteName } = input;
  const candidates = pageResults.filter(
    (page) => page.outcome === "analyzed" && (page.source === "home" || page.section === "Company"),
  );
  const signals = candidates.flatMap((page) => page.identity.map((signal) => ({ page, signal })));
  const preferred =
    signals.find((entry) =>
      profileType === "portfolio"
        ? entry.signal.type === "Person"
        : entry.signal.type === "Organization",
    ) ?? signals[0];

  const fixPayload = {
    "@context": "https://schema.org",
    "@type": profileType === "portfolio" ? "Person" : "Organization",
    name: siteName || "Your site name",
    url: origin,
    description: "One sentence describing who you are and what you do.",
    sameAs: [
      "https://www.wikidata.org/wiki/Q000000",
      "https://www.linkedin.com/company/your-company",
      "https://github.com/your-org",
      ...(profileType === "portfolio"
        ? []
        : ["https://www.crunchbase.com/organization/your-company"]),
    ],
    ...(profileType === "portfolio"
      ? {
          jobTitle: "Your role",
          knowsAbout: ["Topic one", "Topic two"],
        }
      : {}),
  };

  if (!preferred) {
    return check({
      id: "entity-identity",
      label: "Organization or Person identity",
      status: "fail",
      summary: "No identity node",
      detail:
        "No Organization or Person structured-data node was found on the homepage or a Company page such as /about or /team.",
      protocol: "schema.org · Organization / Person · sameAs",
      evidence: evidenceAt("/", null),
      recommendation:
        "Publish an Organization or Person node with name, url, description and at least two sameAs links to authoritative profiles.",
      fix: fix("json", JSON.stringify(fixPayload, null, 2)),
      weight: 2.5,
    });
  }

  const { page, signal } = preferred;
  const hosts = identityHosts(signal.sameAs);
  const hasCore = Boolean(signal.name && signal.url && signal.description);
  const hasSameAs = hosts.size >= 2;
  const portfolioExtra =
    profileType !== "portfolio" || Boolean(signal.jobTitle) || signal.knowsAbout.length > 0;
  const status: CheckStatus = hasCore && hasSameAs && portfolioExtra ? "pass" : "warn";
  const missing = [
    !signal.name ? "name" : null,
    !signal.url ? "url" : null,
    !signal.description ? "description" : null,
    !hasSameAs ? "two sameAs hosts" : null,
    !portfolioExtra ? "jobTitle or knowsAbout" : null,
  ].filter(Boolean);

  return check({
    id: "entity-identity",
    label: "Organization or Person identity",
    status,
    summary: `${signal.type} · ${hosts.size} sameAs host${hosts.size === 1 ? "" : "s"}`,
    detail:
      status === "pass"
        ? `A ${signal.type} node on ${new URL(page.finalUrl).pathname} names the entity and links to ${hosts.size} distinct sameAs hosts.`
        : `A ${signal.type} node was found on ${new URL(page.finalUrl).pathname}, but it is missing ${missing.join(", ")}.`,
    protocol: "schema.org · Organization / Person · sameAs",
    evidence: evidenceAt(new URL(page.finalUrl).pathname, signal.line),
    recommendation:
      status === "pass"
        ? undefined
        : "Complete the identity node with name, url, description and at least two sameAs links to profiles on other sites.",
    fix: status === "pass" ? undefined : fix("json", JSON.stringify(fixPayload, null, 2)),
    weight: 2.5,
  });
}

function buildStructuredPillar(input: {
  origin: string;
  openApi: ProbeResult;
  wellKnown: WellKnownProbe;
  classification: SiteClassification;
  pageStructured: AuditCheck[];
  pageResults: PageAuditResult[];
  siteName: string;
}): AuditPillar {
  const { origin, openApi, wellKnown, classification, pageStructured, pageResults, siteName } =
    input;
  const checks: AuditCheck[] = [...pageStructured];
  const profileLabel = classification.label;

  const openApiScored = classification.compatibility.openApiScored;
  const openApiStatus: CheckStatus = !openApiScored ? "info" : openApi.found ? "pass" : "warn";

  checks.push(
    check({
      id: "openapi",
      label: "OpenAPI description",
      status: openApiStatus,
      summary: !openApiScored
        ? "Not scored"
        : openApi.found
          ? (openApi.path ?? "Found")
          : "Not found",
      detail: !openApiScored
        ? `OpenAPI is not part of the ${profileLabel} compatibility profile. It is scored for SaaS and documentation sites only.`
        : openApi.detail,
      protocol: "OpenAPI 3 · /openapi.json",
      evidence: evidenceAt(openApi.path ?? "/openapi.json", openApi.found ? 1 : null),
      recommendation:
        !openApiScored || openApi.found
          ? undefined
          : "If the site exposes an API, publish an OpenAPI description at /openapi.json so agents can call it correctly.",
      fix:
        !openApiScored || openApi.found
          ? undefined
          : fix(
              "json",
              JSON.stringify(
                {
                  openapi: "3.1.0",
                  info: { title: "Your API", version: "1.0.0" },
                  paths: {},
                },
                null,
                2,
              ),
            ),
      weight: 1.5,
    }),
  );

  checks.push(
    buildEntityIdentityCheck({
      pageResults,
      profileType: classification.type,
      origin,
      siteName,
    }),
  );

  const wellKnownScored = classification.compatibility.openApiScored;
  const wellKnownStatus: CheckStatus = wellKnown.apiCatalog
    ? wellKnownScored
      ? "pass"
      : "info"
    : wellKnownScored
      ? "warn"
      : "info";
  const wellKnownSummary = wellKnown.apiCatalog
    ? "API catalog"
    : wellKnown.security
      ? "security.txt only"
      : "Nothing found";

  checks.push(
    check({
      id: "well-known",
      label: ".well-known discovery",
      status: wellKnownStatus,
      summary: wellKnownSummary,
      detail: wellKnown.apiCatalog
        ? wellKnown.detail
        : wellKnown.security
          ? "Only /.well-known/security.txt was found. It is useful for security reports, but it does not describe the site's API to agents."
          : `No /.well-known/api-catalog document was found. ${wellKnownScored ? "Publish one so agents can discover the OpenAPI description." : "The API catalog is optional for this profile."}`,
      protocol: "RFC 9727 · API catalog · RFC 9116 · security.txt",
      evidence: evidenceAt(wellKnown.path ?? "/.well-known/", wellKnown.found ? 1 : null),
      recommendation:
        wellKnownStatus === "warn"
          ? "Publish /.well-known/api-catalog with a linkset entry pointing at the OpenAPI description."
          : undefined,
      fix:
        wellKnownStatus === "warn"
          ? fix(
              "json",
              JSON.stringify(
                {
                  linkset: [
                    {
                      anchor: origin,
                      "service-desc": [
                        {
                          href: `${origin}/openapi.json`,
                          type: "application/vnd.oai.openapi+json",
                        },
                      ],
                    },
                  ],
                },
                null,
                2,
              ),
            )
          : undefined,
      weight: 0.5,
    }),
  );

  return {
    id: "structured",
    name: "Structured Machine Interfaces",
    shortName: "Schema",
    description: "Can agents classify the page and execute against a schema without guessing?",
    score: 0,
    checks,
  };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

interface DiscoveryBundle {
  robotsResponse: FetchTextOutcome;
  llmsResponse: FetchTextOutcome;
  llmsFullResponse: FetchTextOutcome;
  robots: RobotsData;
  sitemap: SitemapOutcome;
  openApi: ProbeResult;
  wellKnown: WellKnownProbe;
}

async function loadDiscovery(origin: string, settings: FetchSettings): Promise<DiscoveryBundle> {
  const [robotsResponse, llmsResponse, llmsFullResponse, primarySitemap, wellKnown] =
    await Promise.all([
      fetchText(new URL("/robots.txt", origin), {
        accept: "text/plain,*/*;q=0.5",
        timeoutMs: settings.timeoutMs,
        userAgent: settings.userAgent,
        headers: settings.headers,
        maxBytes: 300_000,
      }),
      fetchText(new URL("/llms.txt", origin), {
        accept: "text/plain,text/markdown,*/*;q=0.5",
        timeoutMs: settings.timeoutMs,
        userAgent: settings.userAgent,
        headers: settings.headers,
        maxBytes: 400_000,
      }),
      fetchText(new URL("/llms-full.txt", origin), {
        accept: "text/plain,text/markdown,*/*;q=0.5",
        timeoutMs: settings.timeoutMs,
        userAgent: settings.userAgent,
        headers: settings.headers,
        maxBytes: 2_000_000,
      }),
      fetchText(new URL("/sitemap.xml", origin), {
        accept: "application/xml,text/xml,application/xhtml+xml,*/*;q=0.5",
        timeoutMs: settings.timeoutMs,
        userAgent: settings.userAgent,
        headers: settings.headers,
        maxBytes: 4_000_000,
      }),
      probeWellKnown(origin, settings),
    ]);

  const openApi = await probeOpenApi(origin, settings, wellKnown.openApiLinks);

  const robots =
    robotsResponse.ok && !looksLikeHtml(robotsResponse.body)
      ? parseRobots(robotsResponse.body)
      : emptyRobots();

  const sitemap = await loadSitemap(origin, robots, primarySitemap, settings);

  return {
    robotsResponse,
    llmsResponse,
    llmsFullResponse,
    robots,
    sitemap,
    openApi,
    wellKnown,
  };
}

function isHtmlResponse(response: FetchTextOutcome): boolean {
  const contentType = response.contentType.toLowerCase();
  const head = response.body.slice(0, 300).toLowerCase();
  return contentType.includes("html") || head.includes("<html") || head.includes("<!doctype html");
}

function assertFetchable(response: FetchTextOutcome): void {
  if (response.unsafe) {
    throw new AuditError("blocked_url", response.error ?? "The URL is not allowed.", 400);
  }

  if (response.error) {
    throw new AuditError(
      "fetch_failed",
      response.error,
      502,
      "The site may be blocking automated requests, be offline, or be slow to respond.",
    );
  }

  if (!response.ok) {
    throw new AuditError(
      "http_error",
      `The page responded with HTTP ${response.status}.`,
      502,
      response.status === 403 || response.status === 401
        ? "Some sites block automated audits. Try again or audit a different URL."
        : undefined,
    );
  }

  if (!isHtmlResponse(response)) {
    throw new AuditError("not_html", "That URL did not return an HTML page.", 415);
  }
}

function fetchHtml(
  url: URL,
  settings: FetchSettings,
  timeoutMs = settings.timeoutMs,
): Promise<FetchTextOutcome> {
  return fetchText(url, {
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.6",
    timeoutMs,
    userAgent: settings.userAgent,
    headers: settings.headers,
    maxBytes: 2_500_000,
  });
}

function sameUrl(a: string, b: string): boolean {
  try {
    const left = new URL(a);
    const right = new URL(b);
    left.hash = "";
    right.hash = "";
    return left.toString() === right.toString();
  } catch {
    return false;
  }
}

function toAuditPage(url: URL, source: AuditPage["source"] = "home"): AuditPage {
  const isHome = url.pathname === "/" || url.pathname === "";
  return {
    url: url.toString(),
    label: isHome ? "Home" : pathLabel(url.pathname),
    section: sectionForPath(isHome ? "/" : url.pathname),
    source,
  };
}

function buildFixes(pillars: AuditPillar[]): AuditFix[] {
  return pillars
    .flatMap((pillar) =>
      pillar.checks
        .filter((entry) => entry.status === "fail" || entry.status === "warn")
        .map((entry) => ({
          checkId: entry.id,
          pillarId: pillar.id,
          pillarName: pillar.shortName,
          label: entry.label,
          status: entry.status,
          summary: entry.summary,
          recommendation: entry.recommendation ?? "Review this check and adjust the site.",
          evidence: entry.evidence,
          fix: entry.fix,
          weight: entry.weight,
          scope: entry.scope,
          sample: entry.sample,
        })),
    )
    .sort(compareFixPriority)
    .slice(0, 8);
}

function coverageNote(input: {
  method: AuditCoverage["method"];
  inventorySize: number;
  analyzedPages: number;
  failedPages: number;
  deadlineHit: boolean;
  homepageFallback: boolean;
}): string {
  if (input.method === "page") {
    return "Page-scoped audit · origin-wide manifests and access rules are still checked.";
  }

  const source =
    input.method === "sitemap"
      ? "the sitemap"
      : input.method === "links"
        ? "homepage links"
        : "the homepage";
  const parts = [
    `Analyzed ${input.analyzedPages} of ${formatNumber(input.inventorySize)} pages from ${source}`,
  ];
  if (input.failedPages > 0) {
    parts.push(
      `${input.failedPages} selected page${input.failedPages === 1 ? "" : "s"} could not be read`,
    );
  }
  if (input.deadlineHit) parts.push("the sampling deadline was reached");
  if (input.homepageFallback) parts.push("the focus page was used as the site seed");
  return `${parts.join(" · ")}.`;
}

function focusFailure(input: {
  requested: URL;
  outcome: "unreachable" | "not-html" | "off-origin";
  error: string;
  finalUrl?: string;
  fetchMs: number;
}): FocusBase {
  return {
    page: failedPage({
      url: input.requested.toString(),
      finalUrl: input.finalUrl ?? input.requested.toString(),
      label: pathLabel(input.requested.pathname),
      section: sectionForPath(input.requested.pathname),
      source: "focus",
      outcome: input.outcome,
      error: input.error,
      fetchMs: input.fetchMs,
    }),
    vision: {
      rawHtml: "",
      markdown: "",
      htmlBytes: 0,
      markdownBytes: 0,
      textBytes: 0,
      reductionPct: 0,
      tokenEstimate: { html: 0, markdown: 0 },
      removed: { scripts: 0, styles: 0, landmarks: 0, svg: 0, frames: 0 },
      rawTruncated: false,
      markdownTruncated: false,
    },
  };
}

function fetchSettings(options: AnalyzeOptions): FetchSettings {
  return {
    timeoutMs: options.timeoutMs ?? STANDARD_TIMEOUT_MS,
    userAgent: options.userAgent,
    headers: options.headers,
  };
}

async function buildSiteBase(requested: URL, options: AnalyzeOptions): Promise<SiteBase> {
  const settings = fetchSettings(options);
  const homeTimeoutMs = options.timeoutMs ?? 9_000;
  const seedUrl = new URL("/", requested.origin);
  let seedResponse: FetchTextOutcome;
  let homepageFallback = false;

  try {
    seedResponse = await fetchHtml(seedUrl, settings, homeTimeoutMs);
    assertFetchable(seedResponse);
  } catch (error) {
    if (sameUrl(requested.toString(), seedUrl.toString())) throw error;
    seedResponse = await fetchHtml(requested, settings, homeTimeoutMs);
    assertFetchable(seedResponse);
    homepageFallback = true;
  }

  const finalUrl = new URL(seedResponse.finalUrl);
  const origin = finalUrl.origin;
  const discovery = await loadDiscovery(origin, settings);
  const { robots, robotsResponse, sitemap, openApi, wellKnown } = discovery;
  const $ = cheerio.load(seedResponse.body, { sourceCodeLocationInfo: true });

  const title =
    normalizeWhitespace($("head title").first().text()) ||
    normalizeWhitespace($('meta[property="og:title"]').attr("content") ?? "") ||
    prettyDomain(finalUrl.toString());

  const description =
    $('meta[name="description"]').attr("content")?.trim() ??
    $('meta[property="og:description"]').attr("content")?.trim() ??
    "";

  const siteName =
    $('meta[property="og:site_name"]').attr("content")?.trim() ||
    title.split(/[|·—–-]/)[0]?.trim() ||
    prettyDomain(finalUrl.toString());

  const language = $("html").attr("lang")?.trim() ?? null;
  const ogType = $('meta[property="og:type"]').attr("content")?.trim().toLowerCase() ?? null;

  const profile: SiteProfile = {
    url: requested.toString(),
    finalUrl: finalUrl.toString(),
    domain: prettyDomain(finalUrl.toString()),
    title: title.slice(0, 300),
    description: normalizeWhitespace(description).slice(0, 600),
    siteName: siteName.slice(0, 120),
    language,
  };

  const content = buildContentModel(seedResponse.body);
  const jsonLd = extractJsonLd($);
  const links = extractLinks($, finalUrl);
  const seedMetadata = extractMetadata($, finalUrl.toString());
  const seedVision = buildVision({ html: seedResponse.body, title, content });
  const seedHeading = content.headings.find((heading) => heading.level === 1)?.text ?? title;

  const classification = classifySite(
    {
      finalUrl: finalUrl.toString(),
      html: seedResponse.body,
      title,
      description,
      ogType,
      jsonLdTypes: jsonLd.types,
      sitemapUrls: sitemap.urls,
      navUrls: links,
      llmsTxt:
        discovery.llmsResponse.ok && !looksLikeHtml(discovery.llmsResponse.body)
          ? discovery.llmsResponse.body
          : null,
      hasOpenApi: openApi.found,
    },
    { override: options.siteType ?? null },
  );

  const feedPromise = probeFeed(seedMetadata, settings);
  const markdownPromise = probeMarkdownMirror({
    pageUrl: finalUrl.toString(),
    metadata: seedMetadata,
    pageHeading: seedHeading,
    settings,
  });
  const agentPromise =
    options.agentFetch === false
      ? Promise.resolve(null)
      : probeAgentFetch({
          pageUrl: finalUrl.toString(),
          baseline: seedResponse,
          settings,
        });

  const inventory = buildInventory({
    origin,
    seedUrl: finalUrl.toString(),
    sitemapUrls: sitemap.urls,
    homepageLinks: links,
  });
  const sample = selectSample(inventory.all, SITE_SAMPLE_SIZE);
  const seedAuditPage =
    inventory.all.find((page) => page.source === "home") ?? toAuditPage(finalUrl, "home");

  const seedPage = analyzePage({
    page: seedAuditPage,
    html: seedResponse.body,
    headers: seedResponse.headers,
    finalUrl: finalUrl.toString(),
    recommendedSchema: classification.compatibility.recommendedSchema,
    requiredSchema: classification.compatibility.requiredSchema,
    faqExpected: classification.compatibility.faqExpected,
    siteName: profile.siteName,
    sitemapLastmod: lastmodFor(finalUrl.toString(), sitemap.lastmods),
    profileLabel: classification.label,
    profileType: classification.type,
    content,
    source: "home",
    fetchMs: 0,
  });

  const deadlineAt = Date.now() + SAMPLE_DEADLINE_MS;
  let deadlineHit = false;
  const others = sample.filter((page) => page.url !== seedPage.url);

  const pagePromise = mapWithConcurrency(others, SAMPLE_CONCURRENCY, async (page) => {
    if (Date.now() >= deadlineAt) {
      deadlineHit = true;
      return null;
    }

    const pageStarted = Date.now();
    try {
      const response = await fetchText(page.url, {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.6",
        timeoutMs: settings.timeoutMs,
        userAgent: settings.userAgent,
        headers: settings.headers,
        maxBytes: PAGE_MAX_BYTES,
      });

      if (response.unsafe || response.error || !response.ok) {
        return failedPage({
          url: page.url,
          finalUrl: response.finalUrl,
          label: page.label,
          section: page.section,
          source: page.source,
          outcome: "unreachable",
          error:
            response.error ??
            (response.status ? `The page responded with HTTP ${response.status}.` : "Unreachable."),
          fetchMs: Date.now() - pageStarted,
        });
      }

      const pageFinal = new URL(response.finalUrl);
      if (pageFinal.origin !== origin) {
        return failedPage({
          url: page.url,
          finalUrl: pageFinal.toString(),
          label: page.label,
          section: page.section,
          source: page.source,
          outcome: "off-origin",
          error: "The page redirected off the audited origin.",
          fetchMs: Date.now() - pageStarted,
        });
      }

      if (!isHtmlResponse(response)) {
        return failedPage({
          url: page.url,
          finalUrl: pageFinal.toString(),
          label: page.label,
          section: page.section,
          source: page.source,
          outcome: "not-html",
          error: "The page did not return HTML.",
          fetchMs: Date.now() - pageStarted,
        });
      }

      return analyzePage({
        page,
        html: response.body,
        headers: response.headers,
        finalUrl: pageFinal.toString(),
        recommendedSchema: classification.compatibility.recommendedSchema,
        requiredSchema: classification.compatibility.requiredSchema,
        faqExpected: classification.compatibility.faqExpected,
        siteName: profile.siteName,
        sitemapLastmod: lastmodFor(pageFinal.toString(), sitemap.lastmods),
        profileLabel: classification.label,
        profileType: classification.type,
        fetchMs: Date.now() - pageStarted,
      });
    } catch (error) {
      return failedPage({
        url: page.url,
        label: page.label,
        section: page.section,
        source: page.source,
        outcome: "unreachable",
        error: error instanceof Error ? error.message : "The page could not be fetched.",
        fetchMs: Date.now() - pageStarted,
      });
    }
  });

  const [extra, feed, markdown, agent] = await Promise.all([
    pagePromise,
    feedPromise,
    markdownPromise,
    agentPromise,
  ]);

  const seen = new Set([seedPage.finalUrl]);
  const pageResults: PageAuditResult[] = [seedPage];
  for (const result of extra) {
    if (!result) continue;
    if (result.outcome === "analyzed") {
      if (seen.has(result.finalUrl)) continue;
      seen.add(result.finalUrl);
    }
    pageResults.push(result);
  }

  const analyzedPages = pageResults.filter((page) => page.outcome === "analyzed").length;
  const failedPages = pageResults.length - analyzedPages;
  const skippedPages = Math.max(0, inventory.inventorySize - sample.length);
  const truncated = skippedPages > 0 || deadlineHit;

  const coverage: AuditCoverage = {
    method: inventory.method,
    inventorySize: inventory.inventorySize,
    listedPages: inventory.pages.length,
    sampleSize: sample.length,
    analyzedPages,
    failedPages,
    skippedPages,
    sitemapFound: sitemap.found,
    homepageFallback,
    truncated,
    deadlineHit,
    note: coverageNote({
      method: inventory.method,
      inventorySize: inventory.inventorySize,
      analyzedPages,
      failedPages,
      deadlineHit,
      homepageFallback,
    }),
  };

  const llmsIsText = discovery.llmsResponse.ok && !looksLikeHtml(discovery.llmsResponse.body);
  const llmsLinks = llmsIsText
    ? extractLlmsTxtLinks(discovery.llmsResponse.body, new URL("/llms.txt", origin).toString())
    : [];
  const llmsResolved =
    options.resolveLinks !== false && llmsLinks.length > 0
      ? await resolveLlmsTxtLinks(llmsLinks, {
          origin,
          timeoutMs: settings.timeoutMs,
          headers: settings.headers,
        })
      : [];
  const llmsCoverage =
    llmsLinks.length > 0
      ? llmsTxtCoverage(
          llmsLinks,
          pageResults.filter((page) => page.outcome === "analyzed").map((page) => page.url),
          sitemap.urls,
        )
      : null;

  const sampledPaths = [
    ...new Set([
      "/",
      ...pageResults
        .filter((page) => page.outcome === "analyzed")
        .map((page) => {
          const url = new URL(page.finalUrl);
          return `${url.pathname}${url.search}` || "/";
        }),
    ]),
  ];

  const pageChecks = aggregatePageChecks(pageResults);
  const pillars: AuditPillar[] = [
    buildDiscoveryPillar({
      origin,
      llms: discovery.llmsResponse,
      llmsFull: discovery.llmsFullResponse,
      sitemap,
      robots,
      robotsBody: robotsResponse.body,
      profileType: classification.type,
      feed,
      markdown,
      llmsResolved,
      llmsCoverage,
      pageDiscovery: pageChecks.discovery,
    }),
    buildAccessPillar({
      origin,
      robots,
      robotsResponse,
      paths: sampledPaths,
      agent,
      agentFetchEnabled: options.agentFetch !== false,
      pageAccess: pageChecks.access,
    }),
    buildParseabilityPillar(pageChecks.parseability),
    buildStructuredPillar({
      origin,
      openApi,
      wellKnown,
      classification,
      pageStructured: pageChecks.structured,
      pageResults,
      siteName: profile.siteName,
    }),
  ].map((pillar) => ({ ...pillar, score: scorePillar(pillar) }));

  const score = scoreAudit(pillars);
  const files = buildFiles(
    origin,
    robotsResponse,
    discovery.llmsResponse,
    discovery.llmsFullResponse,
    sitemap,
    openApi,
    wellKnown,
  );

  return {
    finalUrl: finalUrl.toString(),
    origin,
    profile,
    classification,
    pages: inventory.pages,
    files,
    pillars,
    score,
    grade: gradeFor(score),
    fixes: buildFixes(pillars),
    coverage,
    pageResults,
    seedPage,
    seedVision,
    freshness: seedPage.freshness,
    agentFetch: agent?.comparisons ?? [],
    crawledAt: new Date().toISOString(),
  };
}

async function buildFocus(
  requested: URL,
  base: SiteBase,
  options: AnalyzeOptions,
): Promise<FocusBase> {
  const started = Date.now();
  const settings = fetchSettings(options);
  const homeTimeoutMs = options.timeoutMs ?? 9_000;

  try {
    const response = await fetchHtml(requested, settings, homeTimeoutMs);

    if (response.unsafe || response.error || !response.ok) {
      const fromSample = base.pageResults.find(
        (page) =>
          sameUrl(page.url, requested.toString()) || sameUrl(page.finalUrl, requested.toString()),
      );
      if (fromSample) return { page: fromSample, vision: base.seedVision };
      return focusFailure({
        requested,
        outcome: "unreachable",
        error:
          response.error ??
          (response.status ? `The page responded with HTTP ${response.status}.` : "Unreachable."),
        finalUrl: response.finalUrl,
        fetchMs: Date.now() - started,
      });
    }

    const finalUrl = new URL(response.finalUrl);
    if (finalUrl.origin !== base.origin) {
      return focusFailure({
        requested,
        outcome: "off-origin",
        error: "The page redirected off the audited origin.",
        finalUrl: finalUrl.toString(),
        fetchMs: Date.now() - started,
      });
    }

    if (!isHtmlResponse(response)) {
      return focusFailure({
        requested,
        outcome: "not-html",
        error: "The page did not return HTML.",
        finalUrl: finalUrl.toString(),
        fetchMs: Date.now() - started,
      });
    }

    const content = buildContentModel(response.body);
    const fromSample = base.pageResults.find((page) => sameUrl(page.finalUrl, finalUrl.toString()));
    const page =
      fromSample ??
      analyzePage({
        page: toAuditPage(finalUrl, "home"),
        html: response.body,
        headers: response.headers,
        finalUrl: finalUrl.toString(),
        recommendedSchema: base.classification.compatibility.recommendedSchema,
        profileLabel: base.classification.label,
        profileType: base.classification.type,
        content,
        source: "focus",
        fetchMs: Date.now() - started,
      });

    const vision = buildVision({
      html: response.body,
      title: page.title || prettyDomain(finalUrl.toString()),
      content,
    });

    return { page, vision };
  } catch (error) {
    const fromSample = base.pageResults.find(
      (page) =>
        sameUrl(page.url, requested.toString()) || sameUrl(page.finalUrl, requested.toString()),
    );
    if (fromSample) return { page: fromSample, vision: base.seedVision };
    return focusFailure({
      requested,
      outcome: "unreachable",
      error: error instanceof Error ? error.message : "The page could not be fetched.",
      fetchMs: Date.now() - started,
    });
  }
}

async function analyzeSiteScope(
  requested: URL,
  options: AnalyzeOptions,
  startedAt: number,
): Promise<AuditResult> {
  const cacheEnabled = options.cache !== false;
  const siteKey = `${SCORING_VERSION}::${requested.origin}::${options.siteType ?? "auto"}::${options.resolveLinks === false ? "no-links" : "links"}::${options.agentFetch === false ? "no-agent" : "agent"}`;
  const siteHit = cacheEnabled ? readCache(siteCache, siteKey) : null;
  const siteCached = Boolean(siteHit);
  const base = siteHit?.value ?? (await buildSiteBase(requested, options));
  if (cacheEnabled && !siteHit) writeCache(siteCache, siteKey, base, SITE_CACHE_MAX_ENTRIES);

  const seedIsFocus =
    (requested.pathname === "/" && !requested.search) ||
    sameUrl(requested.toString(), base.finalUrl) ||
    sameUrl(requested.toString(), base.seedPage.finalUrl);

  let focus: FocusBase;
  let focusCached = false;

  if (seedIsFocus) {
    focus = { page: base.seedPage, vision: base.seedVision };
    focusCached = siteCached;
  } else {
    const focusKey = `${SCORING_VERSION}::${requested.toString()}::${options.siteType ?? "auto"}`;
    const focusHit = cacheEnabled ? readCache(focusCache, focusKey) : null;
    if (focusHit) {
      focus = focusHit.value;
      focusCached = true;
    } else {
      focus = await buildFocus(requested, base, options);
      if (cacheEnabled) writeCache(focusCache, focusKey, focus, FOCUS_CACHE_MAX_ENTRIES);
    }
  }

  return {
    scope: "site",
    url: requested.toString(),
    finalUrl: base.finalUrl,
    focusUrl: focus.page.finalUrl,
    domain: base.profile.domain,
    score: base.score,
    grade: base.grade.grade,
    gradeLabel: base.grade.label,
    pillars: base.pillars,
    classification: base.classification,
    profile: { ...base.profile, url: requested.toString(), finalUrl: base.finalUrl },
    pages: base.pages,
    pageResults: base.pageResults,
    focusPage: focus.page,
    coverage: base.coverage,
    files: base.files,
    vision: focus.vision,
    fixes: base.fixes,
    freshness: base.freshness,
    agentFetch: base.agentFetch,
    meta: {
      fetchMs: Date.now() - startedAt,
      pageCount: base.pages.length,
      discoveredPageCount: base.coverage.inventorySize,
      sampledPageCount: base.coverage.analyzedPages,
      crawledAt: base.crawledAt,
      cached: siteCached && focusCached,
      siteCached,
      focusCached,
      scoringVersion: SCORING_VERSION,
    },
  };
}

async function analyzePageScope(
  requested: URL,
  options: AnalyzeOptions,
  startedAt: number,
): Promise<AuditResult> {
  const cacheEnabled = options.cache !== false;
  const settings = fetchSettings(options);
  const homeTimeoutMs = options.timeoutMs ?? 9_000;
  const cacheKey = `${SCORING_VERSION}::${requested.toString()}::${options.siteType ?? "auto"}::page`;
  const hit = cacheEnabled ? readCache(pageScopeCache, cacheKey) : null;
  if (hit) {
    return {
      ...hit.value,
      meta: { ...hit.value.meta, cached: true, siteCached: true, focusCached: true },
    };
  }

  const response = await fetchHtml(requested, settings, homeTimeoutMs);
  assertFetchable(response);

  const finalUrl = new URL(response.finalUrl);
  const origin = finalUrl.origin;
  const discovery = await loadDiscovery(origin, settings);
  const { robots, robotsResponse, sitemap, openApi, wellKnown } = discovery;
  const $ = cheerio.load(response.body, { sourceCodeLocationInfo: true });

  const title =
    normalizeWhitespace($("head title").first().text()) ||
    normalizeWhitespace($('meta[property="og:title"]').attr("content") ?? "") ||
    prettyDomain(finalUrl.toString());
  const description =
    $('meta[name="description"]').attr("content")?.trim() ??
    $('meta[property="og:description"]').attr("content")?.trim() ??
    "";
  const siteName =
    $('meta[property="og:site_name"]').attr("content")?.trim() ||
    title.split(/[|·—–-]/)[0]?.trim() ||
    prettyDomain(finalUrl.toString());
  const language = $("html").attr("lang")?.trim() ?? null;
  const ogType = $('meta[property="og:type"]').attr("content")?.trim().toLowerCase() ?? null;

  const profile: SiteProfile = {
    url: requested.toString(),
    finalUrl: finalUrl.toString(),
    domain: prettyDomain(finalUrl.toString()),
    title: title.slice(0, 300),
    description: normalizeWhitespace(description).slice(0, 600),
    siteName: siteName.slice(0, 120),
    language,
  };

  const content = buildContentModel(response.body);
  const jsonLd = extractJsonLd($);
  const links = extractLinks($, finalUrl);
  const metadata = extractMetadata($, finalUrl.toString());
  const vision = buildVision({ html: response.body, title, content });
  const pageHeading = content.headings.find((heading) => heading.level === 1)?.text ?? title;

  const classification = classifySite(
    {
      finalUrl: finalUrl.toString(),
      html: response.body,
      title,
      description,
      ogType,
      jsonLdTypes: jsonLd.types,
      sitemapUrls: sitemap.urls,
      navUrls: links,
      llmsTxt:
        discovery.llmsResponse.ok && !looksLikeHtml(discovery.llmsResponse.body)
          ? discovery.llmsResponse.body
          : null,
      hasOpenApi: openApi.found,
    },
    { override: options.siteType ?? null },
  );

  const [feed, markdown, agent] = await Promise.all([
    probeFeed(metadata, settings),
    probeMarkdownMirror({
      pageUrl: finalUrl.toString(),
      metadata,
      pageHeading,
      settings,
    }),
    options.agentFetch === false
      ? Promise.resolve(null)
      : probeAgentFetch({
          pageUrl: finalUrl.toString(),
          baseline: response,
          settings,
        }),
  ]);

  const inventory = buildInventory({
    origin,
    seedUrl: finalUrl.toString(),
    sitemapUrls: sitemap.urls,
    homepageLinks: links,
  });

  const page = analyzePage({
    page: toAuditPage(finalUrl, "home"),
    html: response.body,
    headers: response.headers,
    finalUrl: finalUrl.toString(),
    recommendedSchema: classification.compatibility.recommendedSchema,
    requiredSchema: classification.compatibility.requiredSchema,
    faqExpected: classification.compatibility.faqExpected,
    siteName: profile.siteName,
    sitemapLastmod: lastmodFor(finalUrl.toString(), sitemap.lastmods),
    profileLabel: classification.label,
    profileType: classification.type,
    content,
    source: "focus",
    fetchMs: 0,
  });

  const llmsIsText = discovery.llmsResponse.ok && !looksLikeHtml(discovery.llmsResponse.body);
  const llmsLinks = llmsIsText
    ? extractLlmsTxtLinks(discovery.llmsResponse.body, new URL("/llms.txt", origin).toString())
    : [];
  const llmsResolved =
    options.resolveLinks !== false && llmsLinks.length > 0
      ? await resolveLlmsTxtLinks(llmsLinks, {
          origin,
          timeoutMs: settings.timeoutMs,
          headers: settings.headers,
        })
      : [];
  const llmsCoverage =
    llmsLinks.length > 0 ? llmsTxtCoverage(llmsLinks, [page.url], sitemap.urls) : null;

  const pageChecks = directPageChecks(page);
  const sampledPaths = [...new Set(["/", `${finalUrl.pathname}${finalUrl.search}` || "/"])];
  const pillars: AuditPillar[] = [
    buildDiscoveryPillar({
      origin,
      llms: discovery.llmsResponse,
      llmsFull: discovery.llmsFullResponse,
      sitemap,
      robots,
      robotsBody: robotsResponse.body,
      profileType: classification.type,
      feed,
      markdown,
      llmsResolved,
      llmsCoverage,
      pageDiscovery: pageChecks.discovery,
    }),
    buildAccessPillar({
      origin,
      robots,
      robotsResponse,
      paths: sampledPaths,
      agent,
      agentFetchEnabled: options.agentFetch !== false,
      pageAccess: pageChecks.access,
    }),
    buildParseabilityPillar(pageChecks.parseability),
    buildStructuredPillar({
      origin,
      openApi,
      wellKnown,
      classification,
      pageStructured: pageChecks.structured,
      pageResults: [page],
      siteName: profile.siteName,
    }),
  ].map((pillar) => ({ ...pillar, score: scorePillar(pillar) }));

  const score = scoreAudit(pillars);
  const files = buildFiles(
    origin,
    robotsResponse,
    discovery.llmsResponse,
    discovery.llmsFullResponse,
    sitemap,
    openApi,
    wellKnown,
  );
  const siteRoot = new URL("/", origin).toString();

  const result: AuditResult = {
    scope: "page",
    url: requested.toString(),
    finalUrl: siteRoot,
    focusUrl: finalUrl.toString(),
    domain: profile.domain,
    score,
    grade: gradeFor(score).grade,
    gradeLabel: gradeFor(score).label,
    pillars,
    classification,
    profile,
    pages: inventory.pages,
    pageResults: [page],
    focusPage: page,
    coverage: {
      method: "page",
      inventorySize: inventory.inventorySize,
      listedPages: inventory.pages.length,
      sampleSize: 1,
      analyzedPages: 1,
      failedPages: 0,
      skippedPages: 0,
      sitemapFound: sitemap.found,
      homepageFallback: false,
      truncated: false,
      deadlineHit: false,
      note: coverageNote({
        method: "page",
        inventorySize: inventory.inventorySize,
        analyzedPages: 1,
        failedPages: 0,
        deadlineHit: false,
        homepageFallback: false,
      }),
    },
    files,
    vision,
    fixes: buildFixes(pillars),
    freshness: page.freshness,
    agentFetch: agent?.comparisons ?? [],
    meta: {
      fetchMs: Date.now() - startedAt,
      pageCount: inventory.pages.length,
      discoveredPageCount: inventory.inventorySize,
      sampledPageCount: 1,
      crawledAt: new Date().toISOString(),
      cached: false,
      siteCached: false,
      focusCached: false,
      scoringVersion: SCORING_VERSION,
    },
  };

  if (cacheEnabled) writeCache(pageScopeCache, cacheKey, result, PAGE_SCOPE_CACHE_MAX_ENTRIES);
  return result;
}

export async function analyzeSite(
  rawInput: string,
  options: AnalyzeOptions = {},
): Promise<AuditResult> {
  const startedAt = Date.now();

  let requested: URL;
  try {
    requested = await assertSafeUrl(rawInput);
  } catch (error) {
    throw new AuditError(
      "blocked_url",
      probeErrorMessage(error),
      400,
      "Internal, private and reserved hosts cannot be audited.",
    );
  }

  const scope: AuditScope = options.scope === "page" ? "page" : "site";
  return scope === "page"
    ? analyzePageScope(requested, options, startedAt)
    : analyzeSiteScope(requested, options, startedAt);
}
