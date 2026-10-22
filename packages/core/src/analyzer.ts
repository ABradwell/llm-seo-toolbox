import * as cheerio from "cheerio";
import { NodeHtmlMarkdown } from "node-html-markdown";

import type {
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
  DiscoveryFile,
  FixLanguage,
  PageAuditResult,
  RemovedNoise,
  SiteClassification,
  SiteProfile,
  SiteType,
  VisionPayload,
} from "./types";

import { aggregatePageChecks, directPageChecks } from "./aggregate";
import { classifySite } from "./classifier";
import { buildContentModel, type ContentModel } from "./content";
import { fetchText, type FetchTextOutcome } from "./fetch-page";
import { sectionForPath } from "./llms";
import { validateLlmsTxt, type LlmsTxtValidation } from "./llms-txt";
import { analyzePage, extractJsonLd, failedPage } from "./page-audit";
import {
  AI_CRAWLERS,
  crawlerAccess,
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
import { gradeFor, scoreAudit, scorePillar } from "./score";
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
}

interface FetchSettings {
  timeoutMs: number;
  userAgent?: string;
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

async function probeOpenApi(origin: string, settings: FetchSettings): Promise<ProbeResult> {
  const candidates = ["/openapi.json", "/.well-known/openapi.json", "/openapi.yaml"];

  const results = await Promise.all(
    candidates.map(async (path) => {
      const response = await fetchText(new URL(path, origin), {
        accept: "application/json,application/yaml,text/yaml,*/*;q=0.5",
        timeoutMs: settings.timeoutMs,
        userAgent: settings.userAgent,
        maxBytes: 1_000_000,
      });

      const head = response.body.slice(0, 3_000);
      const looksStructured =
        response.ok &&
        !looksLikeHtml(response.body) &&
        (/"(openapi|swagger)"\s*:/.test(head) || /^\s*(openapi|swagger)\s*:/im.test(head));

      return { path, response, looksStructured };
    }),
  );

  const hit = results.find((entry) => entry.looksStructured);
  if (!hit) {
    return {
      found: false,
      path: null,
      url: null,
      status: null,
      bytes: 0,
      detail: "No OpenAPI description was found at /openapi.json or the usual .well-known paths.",
    };
  }

  return {
    found: true,
    path: hit.path,
    url: new URL(hit.path, origin).toString(),
    status: hit.response.status,
    bytes: hit.response.bytes,
    detail: `An API description is published at ${hit.path}.`,
  };
}

async function probeWellKnown(
  origin: string,
  settings: FetchSettings,
): Promise<ProbeResult & { entries: string[] }> {
  const candidates = [
    { path: "/.well-known/security.txt", validate: (body: string) => /contact\s*:/i.test(body) },
    {
      path: "/.well-known/ai-plugin.json",
      validate: (body: string) => {
        try {
          const parsed = JSON.parse(body) as Record<string, unknown>;
          return Boolean(parsed.schema_version || parsed.name_for_model);
        } catch {
          return false;
        }
      },
    },
  ];

  const results = await Promise.all(
    candidates.map(async (candidate) => {
      const response = await fetchText(new URL(candidate.path, origin), {
        accept: "application/json,text/plain,*/*;q=0.5",
        timeoutMs: settings.timeoutMs,
        userAgent: settings.userAgent,
        maxBytes: 400_000,
      });
      return {
        path: candidate.path,
        response,
        valid: response.ok && candidate.validate(response.body),
      };
    }),
  );

  const entries = results.filter((entry) => entry.valid).map((entry) => entry.path);
  const first = results.find((entry) => entry.valid);

  if (!first) {
    return {
      found: false,
      path: null,
      url: null,
      status: null,
      bytes: 0,
      detail: "No .well-known discovery documents were found.",
      entries: [],
    };
  }

  return {
    found: true,
    path: first.path,
    url: new URL(first.path, origin).toString(),
    status: first.response.status,
    bytes: first.response.bytes,
    detail: `Discovery documents found: ${entries.join(", ")}.`,
    entries,
  };
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
}): AuditPillar {
  const { origin, llms, llmsFull, sitemap, robots, robotsBody } = input;
  const checks: AuditCheck[] = [];

  const llmsIsText = llms.ok && !looksLikeHtml(llms.body);
  const llmsValidation: LlmsTxtValidation | null = llmsIsText ? validateLlmsTxt(llms.body) : null;
  const llmsValid = llmsValidation?.valid ?? false;

  let llmsStatus: CheckStatus = "fail";
  if (llmsValid) llmsStatus = "pass";
  else if (llmsIsText) llmsStatus = "warn";
  else if (llms.ok) llmsStatus = "warn";

  const llmsSummary = llmsValid
    ? `Valid · ${plural(llmsValidation?.linkCount ?? 0, "link")}`
    : llmsIsText
      ? `Invalid · ${plural(llmsValidation?.issues.filter((issue) => issue.severity === "error").length ?? 0, "error")}`
      : llms.ok
        ? `Not text · ${formatBytes(llms.bytes)}`
        : llms.status === 404
          ? "Missing"
          : llms.status === 0
            ? "Unreachable"
            : `HTTP ${llms.status}`;

  const llmsDetail = llmsValid
    ? `H1 “${llmsValidation?.h1}” with ${plural(llmsValidation?.linkCount ?? 0, "markdown link")} across ${plural(llmsValidation?.sections.length ?? 0, "section")}.`
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
          }`
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
  pageAccess: {
    metaRobots: AuditCheck;
    xRobotsTag: AuditCheck;
  };
}): AuditPillar {
  const { origin, robots, robotsResponse, pageAccess } = input;
  const checks: AuditCheck[] = [];

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
              `User-agent: *
Allow: /

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
      group.agents.some((agent) =>
        AI_CRAWLERS.some((crawler) => crawler.label.toLowerCase() === agent),
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
          : "Add named Google-Extended, ClaudeBot and GPTBot groups with the access you intend to grant.",
      fix:
        aiPolicyStatus === "pass"
          ? undefined
          : fix(
              "robots",
              `User-agent: Google-Extended
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: GPTBot
Allow: /`,
            ),
      weight: 1,
    }),
  );

  for (const crawler of AI_CRAWLERS) {
    const access = crawlerAccess(robots, crawler.label, "/");
    checks.push(
      check({
        id: `bot-${crawler.id}`,
        label: `${crawler.label} access`,
        status: access.status,
        summary: access.summary,
        detail: `${crawler.vendor}: ${access.detail}`,
        protocol: "RFC 9309 §2.2.1",
        evidence: evidenceAt("/robots.txt", access.line),
        recommendation:
          access.status === "fail"
            ? `Update the ${crawler.label} group in robots.txt so the paths you want cited are crawlable.`
            : access.scope === "wildcard" || access.scope === "missing"
              ? `Add an explicit ${crawler.label} group so the allow decision is auditable rather than inherited from a wildcard.`
              : undefined,
        fix:
          access.status === "fail" || access.scope === "wildcard" || access.scope === "missing"
            ? fix(
                "robots",
                `User-agent: ${crawler.label}
Allow: /`,
              )
            : undefined,
        weight: 2,
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

function buildStructuredPillar(input: {
  openApi: ProbeResult;
  wellKnown: ProbeResult & { entries: string[] };
  classification: SiteClassification;
  pageStructured: AuditCheck[];
}): AuditPillar {
  const { openApi, wellKnown, classification, pageStructured } = input;
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
    check({
      id: "well-known",
      label: ".well-known discovery",
      status: wellKnown.found ? "pass" : "warn",
      summary: wellKnown.found ? plural(wellKnown.entries.length, "document") : "Nothing found",
      detail: wellKnown.detail,
      protocol: "RFC 8615 · .well-known",
      evidence: evidenceAt(wellKnown.path ?? "/.well-known/", wellKnown.found ? 1 : null),
      recommendation: wellKnown.found
        ? undefined
        : "Add /.well-known/security.txt (and ai-plugin.json if you expose tools) so agents can discover machine-readable policies.",
      fix: wellKnown.found
        ? undefined
        : fix(
            "text",
            `Contact: mailto:security@example.com
Expires: 2030-01-01T00:00:00.000Z
Preferred-Languages: en
Canonical: https://example.com/.well-known/security.txt`,
          ),
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
  wellKnown: ProbeResult & { entries: string[] };
}

async function loadDiscovery(origin: string, settings: FetchSettings): Promise<DiscoveryBundle> {
  const [robotsResponse, llmsResponse, llmsFullResponse, primarySitemap, openApi, wellKnown] =
    await Promise.all([
      fetchText(new URL("/robots.txt", origin), {
        accept: "text/plain,*/*;q=0.5",
        timeoutMs: settings.timeoutMs,
        userAgent: settings.userAgent,
        maxBytes: 300_000,
      }),
      fetchText(new URL("/llms.txt", origin), {
        accept: "text/plain,text/markdown,*/*;q=0.5",
        timeoutMs: settings.timeoutMs,
        userAgent: settings.userAgent,
        maxBytes: 400_000,
      }),
      fetchText(new URL("/llms-full.txt", origin), {
        accept: "text/plain,text/markdown,*/*;q=0.5",
        timeoutMs: settings.timeoutMs,
        userAgent: settings.userAgent,
        maxBytes: 2_000_000,
      }),
      fetchText(new URL("/sitemap.xml", origin), {
        accept: "application/xml,text/xml,application/xhtml+xml,*/*;q=0.5",
        timeoutMs: settings.timeoutMs,
        userAgent: settings.userAgent,
        maxBytes: 4_000_000,
      }),
      probeOpenApi(origin, settings),
      probeWellKnown(origin, settings),
    ]);

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
    .sort((a, b) => {
      const rank = (status: CheckStatus) => (status === "fail" ? 0 : status === "warn" ? 1 : 2);
      if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
      return b.weight - a.weight;
    })
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
  const seedVision = buildVision({ html: seedResponse.body, title, content });

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
    profileLabel: classification.label,
    profileType: classification.type,
    content,
    source: "home",
    fetchMs: 0,
  });

  const deadlineAt = Date.now() + SAMPLE_DEADLINE_MS;
  let deadlineHit = false;
  const others = sample.filter((page) => page.url !== seedPage.url);

  const extra = await mapWithConcurrency(others, SAMPLE_CONCURRENCY, async (page) => {
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

  const pageChecks = aggregatePageChecks(pageResults);
  const pillars: AuditPillar[] = [
    buildDiscoveryPillar({
      origin,
      llms: discovery.llmsResponse,
      llmsFull: discovery.llmsFullResponse,
      sitemap,
      robots,
      robotsBody: robotsResponse.body,
    }),
    buildAccessPillar({
      origin,
      robots,
      robotsResponse,
      pageAccess: pageChecks.access,
    }),
    buildParseabilityPillar(pageChecks.parseability),
    buildStructuredPillar({
      openApi,
      wellKnown,
      classification,
      pageStructured: pageChecks.structured,
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
  const siteKey = `${requested.origin}::${options.siteType ?? "auto"}`;
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
    const focusKey = `${requested.toString()}::${options.siteType ?? "auto"}`;
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
    meta: {
      fetchMs: Date.now() - startedAt,
      pageCount: base.pages.length,
      discoveredPageCount: base.coverage.inventorySize,
      sampledPageCount: base.coverage.analyzedPages,
      crawledAt: base.crawledAt,
      cached: siteCached && focusCached,
      siteCached,
      focusCached,
      scoringVersion: "site-1",
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
  const cacheKey = `${requested.toString()}::${options.siteType ?? "auto"}::page`;
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
  const vision = buildVision({ html: response.body, title, content });

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
    profileLabel: classification.label,
    profileType: classification.type,
    content,
    source: "focus",
    fetchMs: 0,
  });

  const pageChecks = directPageChecks(page);
  const pillars: AuditPillar[] = [
    buildDiscoveryPillar({
      origin,
      llms: discovery.llmsResponse,
      llmsFull: discovery.llmsFullResponse,
      sitemap,
      robots,
      robotsBody: robotsResponse.body,
    }),
    buildAccessPillar({
      origin,
      robots,
      robotsResponse,
      pageAccess: pageChecks.access,
    }),
    buildParseabilityPillar(pageChecks.parseability),
    buildStructuredPillar({
      openApi,
      wellKnown,
      classification,
      pageStructured: pageChecks.structured,
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
    meta: {
      fetchMs: Date.now() - startedAt,
      pageCount: inventory.pages.length,
      discoveredPageCount: inventory.inventorySize,
      sampledPageCount: 1,
      crawledAt: new Date().toISOString(),
      cached: false,
      siteCached: false,
      focusCached: false,
      scoringVersion: "site-1",
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
