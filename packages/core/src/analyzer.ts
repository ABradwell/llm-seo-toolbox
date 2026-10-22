import * as cheerio from "cheerio";
import { NodeHtmlMarkdown } from "node-html-markdown";

import type {
  AuditCheck,
  AuditPage,
  AuditPillar,
  AuditResult,
  CheckEvidence,
  CheckFix,
  CheckStatus,
  DiscoveryFile,
  FixLanguage,
  RemovedNoise,
  SiteClassification,
  SiteProfile,
  SiteType,
  VisionPayload,
} from "./types";

import { classifySite } from "./classifier";
import { buildContentModel, SNR_PASS, SNR_WARN, type ContentModel } from "./content";
import { evaluateMetaRobots, evaluateXRobotsTag } from "./directives";
import { fetchText, type FetchTextOutcome } from "./fetch-page";
import { sectionForPath } from "./llms";
import { validateLlmsTxt, type LlmsTxtValidation } from "./llms-txt";
import {
  AI_CRAWLERS,
  crawlerAccess,
  emptyRobots,
  hasExplicitAiPolicy,
  parseRobots,
  type RobotsData,
} from "./robots";
import { gradeFor, scoreAudit, scorePillar } from "./score";
import { assertSafeUrl, UnsafeUrlError } from "./security";
import { isIndexablePage, looksLikeHtml, parseSitemap } from "./sitemap";
import { pathLabel, prettyDomain } from "./url";
import { formatBytes, formatNumber, normalizeWhitespace } from "./format";

const RAW_PREVIEW_LIMIT = 22_000;
const MARKDOWN_LIMIT = 42_000;
const MAX_PAGES = 80;
const STANDARD_TIMEOUT_MS = 6_000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 30;

export interface AnalyzeOptions {
  /** A user-pinned V3 profile; the automatic classification is still reported. */
  siteType?: SiteType | null;
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

interface CacheEntry {
  expires: number;
  value: AuditResult;
}

const auditCache = new Map<string, CacheEntry>();

function readCache(key: string): AuditResult | null {
  const hit = auditCache.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    auditCache.delete(key);
    return null;
  }
  return { ...hit.value, meta: { ...hit.value.meta, cached: true } };
}

function writeCache(key: string, value: AuditResult): void {
  if (auditCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = auditCache.keys().next().value;
    if (oldest) auditCache.delete(oldest);
  }
  auditCache.set(key, { expires: Date.now() + CACHE_TTL_MS, value });
}

function check(input: Omit<AuditCheck, "weight"> & { weight?: number }): AuditCheck {
  return { weight: input.weight ?? 1, ...input };
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

function sourceLine(element: unknown): number | null {
  if (!element || typeof element !== "object") return null;
  const location = (element as { sourceCodeLocation?: { startLine?: number } }).sourceCodeLocation;
  return location?.startLine ?? null;
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

interface JsonLdBlock {
  line: number | null;
  valid: boolean;
  types: string[];
  hasContext: boolean;
}

interface JsonLdReport {
  valid: number;
  invalid: number;
  types: string[];
  blocks: JsonLdBlock[];
  firstValidLine: number | null;
  firstBlockLine: number | null;
}

function extractJsonLd($: cheerio.CheerioAPI): JsonLdReport {
  const blocks: JsonLdBlock[] = [];
  const types = new Set<string>();

  const collectTypes = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(collectTypes);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const type = record["@type"];
    if (typeof type === "string") types.add(type);
    if (Array.isArray(type)) {
      type.forEach((entry) => {
        if (typeof entry === "string") types.add(entry);
      });
    }
    if (Array.isArray(record["@graph"])) record["@graph"].forEach(collectTypes);
  };

  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).text().trim();
    const line = sourceLine(element);
    if (!raw) return;

    try {
      const parsed: unknown = JSON.parse(raw);
      const record =
        parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
      collectTypes(parsed);
      blocks.push({
        line,
        valid: true,
        types: record && typeof record["@type"] === "string" ? [record["@type"]] : [],
        hasContext: Boolean(record?.["@context"]),
      });
    } catch {
      blocks.push({ line, valid: false, types: [], hasContext: false });
    }
  });

  const validBlocks = blocks.filter((block) => block.valid);
  const invalid = blocks.length - validBlocks.length;

  return {
    valid: validBlocks.length,
    invalid,
    types: [...types],
    blocks,
    firstValidLine: validBlocks[0]?.line ?? null,
    firstBlockLine: blocks[0]?.line ?? null,
  };
}

function extractMetaRobots($: cheerio.CheerioAPI): { value: string; line: number | null } {
  const nodes = $('meta[name="robots"], meta[name="googlebot"]');
  const value = nodes
    .toArray()
    .map((element) => $(element).attr("content") ?? "")
    .filter((entry) => entry.trim())
    .join(", ")
    .toLowerCase();

  return { value, line: sourceLine(nodes.first()[0]) };
}

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

function buildPages(sitemapUrls: string[], links: string[], finalUrl: URL): AuditPage[] {
  const map = new Map<string, AuditPage>();

  const add = (value: string, source: AuditPage["source"]) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return;
    }

    if (url.origin !== finalUrl.origin) return;
    url.hash = "";

    const normalized = url.toString();
    if (map.has(normalized) || !isIndexablePage(normalized)) return;

    const isHome = url.pathname === "/" || url.pathname === "";
    map.set(normalized, {
      url: normalized,
      label: isHome ? "Home" : pathLabel(url.pathname),
      section: sectionForPath(isHome ? "/" : url.pathname),
      source,
    });
  };

  add(finalUrl.toString(), "home");
  for (const value of sitemapUrls) add(value, "sitemap");
  for (const value of links) add(value, "link");

  return [...map.values()]
    .sort((a, b) => {
      if (a.section === "Home") return -1;
      if (b.section === "Home") return 1;
      return a.url.localeCompare(b.url);
    })
    .slice(0, MAX_PAGES);
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
  metaRobots: { value: string; line: number | null };
  xRobotsTag: string | null;
}): AuditPillar {
  const { origin, robots, robotsResponse, metaRobots, xRobotsTag } = input;
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

  const metaVerdict = evaluateMetaRobots(metaRobots.value);
  checks.push(
    check({
      id: "meta-robots",
      label: "robots meta directives",
      status: metaVerdict.status,
      summary: metaVerdict.summary,
      detail: metaVerdict.detail,
      protocol: "HTML robots meta directives",
      evidence: evidenceAt("/", metaRobots.line ?? null),
      recommendation:
        metaVerdict.status === "pass"
          ? undefined
          : "Remove noindex/none from the robots meta tag on pages that should be discoverable.",
      fix:
        metaVerdict.status === "pass"
          ? undefined
          : fix("html", `<meta name="robots" content="index, follow" />`),
      weight: 1,
    }),
  );

  const headerVerdict = evaluateXRobotsTag(xRobotsTag);
  checks.push(
    check({
      id: "x-robots-tag",
      label: "X-Robots-Tag header",
      status: headerVerdict.status,
      summary: headerVerdict.summary,
      detail: headerVerdict.detail,
      protocol: "X-Robots-Tag · RFC 9309",
      evidence: {
        file: "HTTP response headers",
        line: null,
        snippet: xRobotsTag ? `X-Robots-Tag: ${xRobotsTag}` : null,
      },
      recommendation:
        headerVerdict.status === "pass"
          ? undefined
          : "Remove blocking X-Robots-Tag directives for public pages, or scope them to the paths that should stay private.",
      fix:
        headerVerdict.status === "pass"
          ? undefined
          : fix(
              "http",
              `# Allow indexing and AI grounding for public content
X-Robots-Tag: index, follow

# Keep private paths out
# X-Robots-Tag: noindex  (scoped to /internal/*)`,
            ),
      weight: 2,
    }),
  );

  return {
    id: "access",
    name: "Crawler Access Rules",
    shortName: "Access",
    description: "Are the user agents that power AI answers explicitly allowed in?",
    score: 0,
    checks,
  };
}

function buildParseabilityPillar(content: ContentModel): AuditPillar {
  const checks: AuditCheck[] = [];
  const { headings } = content;
  const h1Count = headings.filter((heading) => heading.level === 1).length;
  const firstH1 = headings.find((heading) => heading.level === 1) ?? headings[0] ?? null;

  checks.push(
    check({
      id: "h1",
      label: "Single H1",
      status: h1Count === 1 ? "pass" : h1Count === 0 ? "fail" : "warn",
      summary: h1Count === 0 ? "Missing" : `${h1Count} × H1`,
      detail:
        h1Count === 1
          ? "The content region has exactly one top-level heading."
          : h1Count === 0
            ? "No H1 heading was found in the content region."
            : "Multiple H1 headings make the page topic ambiguous.",
      protocol: "HTML heading outline",
      evidence: evidenceAt("/", firstH1?.line ?? null),
      recommendation:
        h1Count === 1
          ? undefined
          : "Give the page exactly one descriptive H1 that names the topic.",
      fix: h1Count === 1 ? undefined : fix("html", `<h1>Page topic in one clear sentence</h1>`),
      weight: 1.5,
    }),
  );

  let jumps = 0;
  let firstJumpLine: number | null = null;
  for (let index = 1; index < headings.length; index += 1) {
    if (headings[index].level - headings[index - 1].level > 1) {
      jumps += 1;
      if (firstJumpLine === null) firstJumpLine = headings[index].line;
    }
  }
  const startsDeep = headings.length > 0 && headings[0].level > 1;
  const outline = headings
    .slice(0, 14)
    .map((heading) => `H${heading.level}`)
    .join(" → ");

  checks.push(
    check({
      id: "heading-order",
      label: "Heading sequence",
      status: headings.length === 0 ? "fail" : jumps > 0 || startsDeep ? "warn" : "pass",
      summary:
        headings.length === 0
          ? "No headings"
          : jumps > 0
            ? `${jumps} level jump${jumps === 1 ? "" : "s"}`
            : startsDeep
              ? `Starts at H${headings[0].level}`
              : "H1 → H2 → H3",
      detail:
        headings.length === 0
          ? "The page contains no heading elements for a parser to build an outline from."
          : `Outline: ${outline}${headings.length > 14 ? " → …" : ""}. ${
              startsDeep ? "The outline starts deeper than H1. " : ""
            }${jumps > 0 ? `${jumps} jump${jumps === 1 ? "" : "s"} skip a level.` : "No levels are skipped."}`,
      protocol: "Semantic HTML heading hierarchy",
      evidence: evidenceAt("/", firstJumpLine ?? headings[0]?.line ?? null),
      recommendation:
        headings.length > 0 && jumps === 0 && !startsDeep
          ? undefined
          : "Keep heading levels sequential (H1 → H2 → H3) so the document outline is unambiguous.",
      fix:
        headings.length > 0 && jumps === 0 && !startsDeep
          ? undefined
          : fix(
              "html",
              `<h1>Page topic</h1>
  <h2>First section</h2>
    <h3>Supporting detail</h3>
  <h2>Second section</h2>`,
            ),
      weight: 2,
    }),
  );

  const snrPct = content.snr * 100;
  const snrStatus: CheckStatus =
    content.snr >= SNR_PASS ? "pass" : content.snr >= SNR_WARN ? "warn" : "fail";

  checks.push(
    check({
      id: "snr",
      label: "Static HTML signal-to-noise",
      status: snrStatus,
      summary: `${snrPct.toFixed(1)}% signal`,
      detail: `${formatNumber(content.snrSignalChars)} characters of content text against ${formatNumber(content.snrNoiseChars)} characters of navigation, footer, banner and widget text. V2 requires at least ${Math.round(SNR_PASS * 100)}% signal.`,
      protocol: "Static HTML SNR ≥ 65%",
      evidence: evidenceAt("/", content.scopeLine),
      recommendation:
        snrStatus === "pass"
          ? undefined
          : "Reduce repeated navigation and widget copy around the content region, and move primary prose into semantic main/article markup.",
      fix:
        snrStatus === "pass"
          ? undefined
          : fix(
              "html",
              `<main>
  <article>
    <h1>Primary topic</h1>
    <p>Substantive, server-rendered prose that an agent can quote.</p>
  </article>
  <nav aria-label="On this page">…short table of contents…</nav>
</main>`,
            ),
      weight: 2.5,
    }),
  );

  const ssrStatus: CheckStatus =
    content.textChars >= 600 ? "pass" : content.textChars >= 200 ? "warn" : "fail";

  checks.push(
    check({
      id: "ssr-content",
      label: "SSR payload readability",
      status: ssrStatus,
      summary: `${formatNumber(content.textChars)} chars in HTML`,
      detail:
        ssrStatus === "pass"
          ? "Substantial content is present in the initial HTML response, so crawlers do not need to execute JavaScript."
          : "The initial HTML response contains little readable content, which suggests client-side rendering or a JavaScript gate.",
      protocol: "No-JS initial response",
      evidence: evidenceAt("/", content.scopeLine),
      recommendation:
        ssrStatus === "pass"
          ? undefined
          : "Render primary content on the server (SSR/SSG) so it exists in the first HTML response.",
      fix:
        ssrStatus === "pass"
          ? undefined
          : fix(
              "html",
              `<!-- Server-render the primary content, not a client-only shell -->
<main>
  <h1>Page topic</h1>
  <p>At least 600 characters of readable content in the initial response.</p>
</main>`,
            ),
      weight: 2,
    }),
  );

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
  jsonLd: JsonLdReport;
  openApi: ProbeResult;
  wellKnown: ProbeResult & { entries: string[] };
  classification: SiteClassification;
}): AuditPillar {
  const { jsonLd, openApi, wellKnown, classification } = input;
  const checks: AuditCheck[] = [];
  const recommendedSchema = classification.compatibility.recommendedSchema;
  const profileLabel = classification.label;

  const jsonLdStatus: CheckStatus =
    jsonLd.valid > 0 ? "pass" : jsonLd.invalid > 0 ? "warn" : "fail";
  const types = jsonLd.types.slice(0, 6);

  checks.push(
    check({
      id: "json-ld",
      label: "JSON-LD presence & syntax",
      status: jsonLdStatus,
      summary:
        jsonLd.valid > 0
          ? `${plural(jsonLd.valid, "valid block")}`
          : jsonLd.invalid > 0
            ? "Invalid JSON"
            : "Missing",
      detail:
        jsonLd.valid > 0
          ? `Valid structured data${types.length > 0 ? `: ${types.join(", ")}` : ""}.`
          : jsonLd.invalid > 0
            ? `${plural(jsonLd.invalid, "JSON-LD block")} could not be parsed.`
            : "No JSON-LD structured data was found in the page head.",
      protocol: "schema.org JSON-LD",
      evidence: evidenceAt("/", jsonLd.firstBlockLine),
      recommendation:
        jsonLdStatus === "pass"
          ? undefined
          : "Add a JSON-LD block with @context and @type so the page can be classified without guessing.",
      fix:
        jsonLdStatus === "pass"
          ? undefined
          : fix(
              "json",
              JSON.stringify(
                {
                  "@context": "https://schema.org",
                  "@type": recommendedSchema[0] ?? "TechArticle",
                  headline: "Page topic",
                  description: "One-sentence summary of the page.",
                },
                null,
                2,
              ),
            ),
      weight: 2.5,
    }),
  );

  const present = recommendedSchema.filter((type) => jsonLd.types.includes(type));
  const schemaStatus: CheckStatus =
    present.length > 0 ? "pass" : jsonLd.valid > 0 ? "warn" : "fail";
  const expected =
    recommendedSchema.length > 2
      ? `${recommendedSchema.slice(0, -1).join(", ")} or ${recommendedSchema[recommendedSchema.length - 1]}`
      : recommendedSchema.join(" or ");

  checks.push(
    check({
      id: "schema-types",
      label: "Profile schema types",
      status: schemaStatus,
      summary: present.length > 0 ? present.join(", ") : `0 / ${recommendedSchema.length} found`,
      detail: `The ${profileLabel} profile expects ${expected}. Found: ${
        jsonLd.types.length > 0 ? jsonLd.types.join(", ") : "none"
      }.`,
      protocol: `schema.org · ${recommendedSchema.join(" / ")}`,
      evidence: evidenceAt("/", jsonLd.firstValidLine ?? jsonLd.firstBlockLine),
      recommendation:
        schemaStatus === "pass"
          ? undefined
          : `Add a ${recommendedSchema[0]} object (or an equivalent ${profileLabel.toLowerCase()} type) to the page's JSON-LD.`,
      fix:
        schemaStatus === "pass"
          ? undefined
          : fix(
              "json",
              JSON.stringify(
                {
                  "@context": "https://schema.org",
                  "@type": recommendedSchema[0] ?? "TechArticle",
                  name: "Your site or page",
                  description: "One-sentence summary matched to this profile.",
                  ...(classification.type === "local-business"
                    ? {
                        address: {
                          "@type": "PostalAddress",
                          streetAddress: "1 Main Street",
                          addressLocality: "Your city",
                          addressCountry: "US",
                        },
                      }
                    : {}),
                  ...(classification.type === "ecommerce"
                    ? {
                        offers: {
                          "@type": "Offer",
                          price: "0.00",
                          priceCurrency: "USD",
                          availability: "https://schema.org/InStock",
                        },
                      }
                    : {}),
                },
                null,
                2,
              ),
            ),
      weight: 1.5,
    }),
  );

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

  const cacheEnabled = options.cache !== false;
  const cacheKey = `${requested.toString()}::${options.siteType ?? "auto"}`;
  const cached = cacheEnabled ? readCache(cacheKey) : null;
  if (cached) return cached;

  const settings: FetchSettings = {
    timeoutMs: options.timeoutMs ?? STANDARD_TIMEOUT_MS,
    userAgent: options.userAgent,
  };
  const homeTimeoutMs = options.timeoutMs ?? 9_000;

  const homeResponse = await fetchText(requested, {
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.6",
    timeoutMs: homeTimeoutMs,
    userAgent: options.userAgent,
    maxBytes: 2_500_000,
  });

  if (homeResponse.unsafe) {
    throw new AuditError("blocked_url", homeResponse.error ?? "The URL is not allowed.", 400);
  }

  if (homeResponse.error) {
    throw new AuditError(
      "fetch_failed",
      homeResponse.error,
      502,
      "The site may be blocking automated requests, be offline, or be slow to respond.",
    );
  }

  if (!homeResponse.ok) {
    throw new AuditError(
      "http_error",
      `The page responded with HTTP ${homeResponse.status}.`,
      502,
      homeResponse.status === 403 || homeResponse.status === 401
        ? "Some sites block automated audits. Try again or audit a different URL."
        : undefined,
    );
  }

  const contentType = homeResponse.contentType.toLowerCase();
  const head = homeResponse.body.slice(0, 300).toLowerCase();
  if (
    !contentType.includes("html") &&
    !head.includes("<html") &&
    !head.includes("<!doctype html")
  ) {
    throw new AuditError("not_html", "That URL did not return an HTML page.", 415);
  }

  const finalUrl = new URL(homeResponse.finalUrl);
  const origin = finalUrl.origin;

  const [robotsResponse, llmsResponse, llmsFullResponse, openApi, wellKnown] = await Promise.all([
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
    probeOpenApi(origin, settings),
    probeWellKnown(origin, settings),
  ]);

  const robots =
    robotsResponse.ok && !looksLikeHtml(robotsResponse.body)
      ? parseRobots(robotsResponse.body)
      : emptyRobots();

  const primarySitemap = await fetchText(new URL("/sitemap.xml", origin), {
    accept: "application/xml,text/xml,application/xhtml+xml,*/*;q=0.5",
    timeoutMs: settings.timeoutMs,
    userAgent: settings.userAgent,
    maxBytes: 4_000_000,
  });

  const sitemap = await loadSitemap(origin, robots, primarySitemap, settings);

  const $ = cheerio.load(homeResponse.body, { sourceCodeLocationInfo: true });

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
  const metaRobots = extractMetaRobots($);
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

  const content = buildContentModel(homeResponse.body);
  const jsonLd = extractJsonLd($);
  const links = extractLinks($, finalUrl);
  const vision = buildVision({ html: homeResponse.body, title, content });
  const xRobotsTag = homeResponse.headers["x-robots-tag"]?.trim() || null;

  const classification = classifySite(
    {
      finalUrl: finalUrl.toString(),
      html: homeResponse.body,
      title,
      description,
      ogType,
      jsonLdTypes: jsonLd.types,
      sitemapUrls: sitemap.urls,
      navUrls: links,
      llmsTxt: llmsResponse.ok && !looksLikeHtml(llmsResponse.body) ? llmsResponse.body : null,
      hasOpenApi: openApi.found,
    },
    { override: options.siteType ?? null },
  );

  const pillars: AuditPillar[] = [
    buildDiscoveryPillar({
      origin,
      llms: llmsResponse,
      llmsFull: llmsFullResponse,
      sitemap,
      robots,
      robotsBody: robotsResponse.body,
    }),
    buildAccessPillar({
      origin,
      robots,
      robotsResponse,
      metaRobots,
      xRobotsTag,
    }),
    buildParseabilityPillar(content),
    buildStructuredPillar({ jsonLd, openApi, wellKnown, classification }),
  ].map((pillar) => ({ ...pillar, score: scorePillar(pillar) }));

  const score = scoreAudit(pillars);
  const grade = gradeFor(score);

  const fixes = pillars
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
        })),
    )
    .sort((a, b) => {
      const rank = (status: CheckStatus) => (status === "fail" ? 0 : status === "warn" ? 1 : 2);
      if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
      return b.weight - a.weight;
    })
    .slice(0, 8);

  const pages = buildPages(sitemap.urls, links, finalUrl);
  const files = buildFiles(
    origin,
    robotsResponse,
    llmsResponse,
    llmsFullResponse,
    sitemap,
    openApi,
    wellKnown,
  );

  const result: AuditResult = {
    url: requested.toString(),
    finalUrl: finalUrl.toString(),
    domain: profile.domain,
    score,
    grade: grade.grade,
    gradeLabel: grade.label,
    pillars,
    classification,
    profile,
    pages,
    files,
    vision,
    fixes,
    meta: {
      fetchMs: Date.now() - startedAt,
      pageCount: pages.length,
      crawledAt: new Date().toISOString(),
      cached: false,
    },
  };

  if (cacheEnabled) writeCache(cacheKey, result);
  return result;
}
