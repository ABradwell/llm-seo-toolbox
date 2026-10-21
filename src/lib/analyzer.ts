import "server-only";

import * as cheerio from "cheerio";
import { NodeHtmlMarkdown } from "node-html-markdown";

import type {
  AuditCheck,
  AuditPage,
  AuditPillar,
  AuditResult,
  CheckStatus,
  DiscoveryFile,
  RemovedNoise,
  SiteProfile,
  VisionPayload,
} from "@/types/audit";

import { buildContentModel, type ContentModel } from "./content";
import { fetchText, type FetchTextOutcome } from "./fetch-page";
import { sectionForPath } from "./llms";
import { AI_CRAWLERS, crawlerAccess, emptyRobots, parseRobots, type RobotsData } from "./robots";
import { gradeFor, scoreAudit, scorePillar } from "./score";
import { assertSafeUrl, UnsafeUrlError } from "./security";
import { isIndexablePage, looksLikeHtml, parseSitemap } from "./sitemap";
import { pathLabel, prettyDomain } from "./url";
import { formatBytes, formatNumber, normalizeWhitespace } from "./utils";

const RAW_PREVIEW_LIMIT = 22_000;
const MARKDOWN_LIMIT = 42_000;
const MAX_PAGES = 80;
const STANDARD_TIMEOUT_MS = 6_000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 30;

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

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function truncateForTransport(value: string, limit: number): { text: string; truncated: boolean } {
  if (value.length <= limit) return { text: value, truncated: false };
  return { text: `${value.slice(0, limit)}\n\n<!-- preview truncated -->`, truncated: true };
}

function probeErrorMessage(error: unknown): string {
  if (error instanceof UnsafeUrlError) return error.message;
  return "The site could not be fetched.";
}

interface SitemapBudget {
  remaining: number;
  fetched: number;
  childCount: number;
  lastStatus: number | null;
  foundXml: boolean;
}

async function expandSitemap(url: string, budget: SitemapBudget, depth = 0): Promise<string[]> {
  if (budget.remaining <= 0 || depth > 1) return [];

  budget.remaining -= 1;
  budget.fetched += 1;

  const response = await fetchText(url, {
    accept: "application/xml,text/xml,application/xhtml+xml,*/*;q=0.5",
    timeoutMs: STANDARD_TIMEOUT_MS,
    maxBytes: 4_000_000,
  });

  if (response.status) budget.lastStatus = response.status;
  if (!response.ok || looksLikeHtml(response.body)) return [];

  const parsed = parseSitemap(response.body);
  if (parsed.kind === "unknown") return [];

  budget.foundXml = true;

  if (parsed.kind === "urlset") return parsed.urls;

  budget.childCount = Math.max(budget.childCount, parsed.sitemaps.length);
  const children = parsed.sitemaps.slice(0, 3);
  const results = await Promise.all(
    children.map((child) => expandSitemap(child, budget, depth + 1)),
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
}

async function loadSitemap(
  origin: string,
  robots: RobotsData,
  primary: FetchTextOutcome,
): Promise<SitemapOutcome> {
  const budget: SitemapBudget = {
    remaining: 5,
    fetched: 0,
    childCount: 0,
    lastStatus: primary.status || null,
    foundXml: false,
  };

  const primaryUrl = new URL("/sitemap.xml", origin).toString();
  let urls = await expandSitemap(primaryUrl, budget);
  let primaryUrlUsed = primaryUrl;
  const bytes = primary.bytes;

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
      const parsed = await expandSitemap(directive, budget);
      if (parsed.length > 0) {
        urls = parsed;
        primaryUrlUsed = directive;
        break;
      }
    }
  }

  if (urls.length === 0) {
    const fallback = `${origin}/sitemap_index.xml`;
    const parsed = await expandSitemap(fallback, budget);
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
    bytes,
    primaryUrl: primaryUrlUsed,
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

async function probeOpenApi(origin: string): Promise<ProbeResult> {
  const candidates = ["/openapi.json", "/.well-known/openapi.json", "/openapi.yaml"];

  const results = await Promise.all(
    candidates.map(async (path) => {
      const response = await fetchText(new URL(path, origin), {
        accept: "application/json,application/yaml,text/yaml,*/*;q=0.5",
        timeoutMs: STANDARD_TIMEOUT_MS,
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
      detail: "No OpenAPI description found at the usual locations.",
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

async function probeWellKnown(origin: string): Promise<ProbeResult & { entries: string[] }> {
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
        timeoutMs: STANDARD_TIMEOUT_MS,
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

interface JsonLdReport {
  valid: number;
  invalid: number;
  types: string[];
}

function extractJsonLd($: cheerio.CheerioAPI): JsonLdReport {
  let valid = 0;
  let invalid = 0;
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
    if (!raw) return;
    try {
      collectTypes(JSON.parse(raw));
      valid += 1;
    } catch {
      invalid += 1;
    }
  });

  return { valid, invalid, types: [...types] };
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
  llms: FetchTextOutcome;
  llmsFull: FetchTextOutcome;
  sitemap: SitemapOutcome;
}): AuditPillar {
  const { llms, llmsFull, sitemap } = input;
  const checks: AuditCheck[] = [];

  const llmsIsText = llms.ok && !looksLikeHtml(llms.body);
  const llmsLooksValid = llmsIsText && /^\s*#\s+\S/m.test(llms.body.slice(0, 1_000));
  const llmsLinkCount = (llms.body.match(/\]\(/g) ?? []).length;
  const llmsIsManifest = llmsLooksValid && llmsLinkCount > 0;

  let llmsStatus: CheckStatus = "fail";
  if (llmsIsManifest) llmsStatus = "pass";
  else if (llms.status !== 404 && llms.status !== 0) llmsStatus = "warn";

  const llmsSummary = llmsIsManifest
    ? `Found · ${formatBytes(llms.bytes)}`
    : llms.ok
      ? `Not usable · ${formatBytes(llms.bytes)}`
      : llms.status === 404
        ? "Missing"
        : llms.status === 0
          ? "Unreachable"
          : `HTTP ${llms.status}`;

  const llmsDetail = llmsIsManifest
    ? `A top-level heading and ${formatNumber(llmsLinkCount)} markdown link${llmsLinkCount === 1 ? "" : "s"} were found.`
    : !llms.ok
      ? llms.status === 404
        ? "No /llms.txt file was found at the site root."
        : `The manifest could not be verified (HTTP ${llms.status || "no response"}).`
      : !llmsIsText
        ? "The URL responds with an HTML page instead of a text manifest, which usually means the host serves a catch-all page for unknown paths."
        : "The file exists but is missing the required H1 heading or markdown links.";

  checks.push(
    check({
      id: "llms-txt",
      label: "llms.txt manifest",
      status: llmsStatus,
      summary: llmsSummary,
      detail: llmsDetail,
      recommendation:
        llmsStatus === "pass"
          ? undefined
          : "Publish /llms.txt with a single H1, a blockquote summary, and links to the pages LLMs should read first. See llmstxt.org.",
      weight: 3,
    }),
  );

  const llmsFullUsable = llmsFull.ok && !looksLikeHtml(llmsFull.body) && llmsFull.bytes > 50;

  checks.push(
    check({
      id: "llms-full-txt",
      label: "llms-full.txt expansion",
      status: llmsFullUsable ? "pass" : "warn",
      summary: llmsFullUsable
        ? `Found · ${formatBytes(llmsFull.bytes)}`
        : llmsFull.status === 404
          ? "Not published"
          : "Not usable",
      detail: llmsFullUsable
        ? "An expanded manifest is available for single-request ingestion."
        : llmsFull.status === 404
          ? "The optional expanded manifest is not published."
          : "The optional expanded manifest could not be verified as a plain-text manifest.",
      recommendation:
        "Optionally publish /llms-full.txt with the full text of your documentation so agents can ingest it in one request.",
      weight: 1,
    }),
  );

  const sitemapStatus: CheckStatus =
    sitemap.urls.length > 0
      ? "pass"
      : sitemap.found
        ? "warn"
        : sitemap.lastStatus === 404
          ? "fail"
          : "warn";

  checks.push(
    check({
      id: "sitemap",
      label: "XML sitemap",
      status: sitemapStatus,
      summary:
        sitemap.urls.length > 0
          ? `${formatNumber(sitemap.urls.length)} URLs`
          : sitemap.found
            ? "Empty"
            : sitemap.lastStatus === 404
              ? "Missing"
              : "Unverified",
      detail:
        sitemap.urls.length > 0
          ? `Discovered ${formatNumber(sitemap.urls.length)} indexable URLs from ${sitemap.primaryUrl}.`
          : sitemap.found
            ? "A sitemap was found but did not contain any usable URLs."
            : "No usable XML sitemap was found at /sitemap.xml or the locations referenced in robots.txt.",
      recommendation:
        sitemapStatus === "pass"
          ? undefined
          : "Publish an XML sitemap at /sitemap.xml, keep it fresh, and reference it from robots.txt with a Sitemap: directive.",
      weight: 2,
    }),
  );

  return {
    id: "discovery",
    name: "Discovery & Manifests",
    shortName: "Discovery",
    description: "Can agents find a clean, curated index of your best content?",
    score: 0,
    checks,
  };
}

function buildAccessPillar(input: {
  robots: RobotsData;
  robotsResponse: FetchTextOutcome;
  metaRobots: string;
}): AuditPillar {
  const { robots, robotsResponse, metaRobots } = input;
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
        ? `Parsed ${robots.groups.length} user-agent group${robots.groups.length === 1 ? "" : "s"} and ${robots.sitemaps.length} sitemap directive${robots.sitemaps.length === 1 ? "" : "s"}.`
        : robotsResponse.status === 404
          ? "No robots.txt exists, so crawler access is implicit rather than explicit."
          : "robots.txt could not be read, so crawler access cannot be verified.",
      recommendation:
        robotsStatus === "pass"
          ? undefined
          : "Publish a robots.txt that states your crawler policy explicitly, including any AI user-agent groups.",
      weight: 1,
    }),
  );

  let metaStatus: CheckStatus = "pass";
  if (/\b(noindex|none)\b/i.test(metaRobots)) metaStatus = "fail";
  else if (/nofollow/i.test(metaRobots)) metaStatus = "warn";

  checks.push(
    check({
      id: "meta-robots",
      label: "Indexability signals",
      status: metaStatus,
      summary: metaRobots ? `meta robots: ${metaRobots}` : "No blocking directives",
      detail:
        metaStatus === "pass"
          ? "No noindex or nofollow directives were found in the page head."
          : `The page declares: ${metaRobots}.`,
      recommendation:
        metaStatus === "pass"
          ? undefined
          : "Remove noindex/none from the robots meta tag on pages that should be discoverable.",
      weight: 1,
    }),
  );

  for (const crawler of AI_CRAWLERS) {
    const access = crawlerAccess(robots, crawler.label);
    checks.push(
      check({
        id: `bot-${crawler.id}`,
        label: `${crawler.label} access`,
        status: access.status,
        summary: access.summary,
        detail: `${crawler.vendor}: ${access.detail}`,
        recommendation:
          access.status === "fail"
            ? `Update the ${crawler.label} group in robots.txt so the paths you want cited are crawlable.`
            : undefined,
        weight: 2,
      }),
    );
  }

  return {
    id: "access",
    name: "Crawler Access Rules",
    shortName: "Access",
    description: "Are the user agents that power AI answers allowed in?",
    score: 0,
    checks,
  };
}

const TEXT_RATIO_PASS = 0.08;
const TEXT_RATIO_WARN = 0.04;
const NOISE_RATIO_PASS = 0.55;
const NOISE_RATIO_WARN = 0.75;

function buildSemanticPillar(content: ContentModel): AuditPillar {
  const checks: AuditCheck[] = [];
  const { headings } = content;
  const h1Count = headings.filter((heading) => heading.level === 1).length;

  checks.push(
    check({
      id: "h1",
      label: "Single H1",
      status: h1Count === 1 ? "pass" : h1Count === 0 ? "fail" : "warn",
      summary: h1Count === 0 ? "Missing" : `${h1Count} × H1`,
      detail:
        h1Count === 1
          ? "The page has exactly one top-level heading."
          : h1Count === 0
            ? "No H1 heading was found."
            : "Multiple H1 headings make the page topic ambiguous.",
      recommendation:
        h1Count === 1
          ? undefined
          : "Give the page exactly one descriptive H1 that names the topic.",
      weight: 2,
    }),
  );

  const sequence = headings.map((heading) => `H${heading.level}`);
  let jumps = 0;
  for (let index = 1; index < headings.length; index += 1) {
    if (headings[index].level - headings[index - 1].level > 1) jumps += 1;
  }
  const startsDeep = headings.length > 0 && headings[0].level > 1;

  checks.push(
    check({
      id: "heading-order",
      label: "Heading hierarchy",
      status: headings.length === 0 ? "fail" : jumps > 0 || startsDeep ? "warn" : "pass",
      summary:
        headings.length === 0
          ? "No headings"
          : jumps > 0
            ? `${jumps} level jump${jumps === 1 ? "" : "s"}`
            : startsDeep
              ? `Starts at H${headings[0].level}`
              : "Sequential",
      detail:
        headings.length === 0
          ? "The page contains no heading elements for a parser to build an outline from."
          : `Outline: ${sequence.slice(0, 14).join(" → ")}${sequence.length > 14 ? " → …" : ""}`,
      recommendation:
        headings.length > 0 && jumps === 0 && !startsDeep
          ? undefined
          : "Keep heading levels sequential (H1 → H2 → H3) so the document outline is unambiguous.",
      weight: 1.5,
    }),
  );

  const ratioPct = content.textRatio * 100;
  const ratioStatus: CheckStatus =
    content.textRatio >= TEXT_RATIO_PASS
      ? "pass"
      : content.textRatio >= TEXT_RATIO_WARN
        ? "warn"
        : "fail";

  checks.push(
    check({
      id: "text-ratio",
      label: "Text-to-DOM ratio",
      status: ratioStatus,
      summary: `${ratioPct.toFixed(1)}% readable text`,
      detail: `${formatNumber(content.textChars)} characters of readable text against ${formatBytes(content.scopeBytes)} of content markup inside the ${content.scopeSelector} element (navigation, chrome and scripts excluded).`,
      recommendation:
        ratioStatus === "pass"
          ? undefined
          : "Wrap content in semantic elements and trim layout scaffolding so readable text makes up more of the markup a parser has to read.",
      weight: 2,
    }),
  );

  const ssrStatus: CheckStatus =
    content.textChars >= 600 ? "pass" : content.textChars >= 200 ? "warn" : "fail";

  checks.push(
    check({
      id: "ssr-content",
      label: "Server-rendered content",
      status: ssrStatus,
      summary: `${formatNumber(content.textChars)} chars in HTML`,
      detail:
        ssrStatus === "pass"
          ? "Substantial content is present in the initial HTML response, so crawlers do not need to execute JavaScript."
          : "The initial HTML response contains little readable content, which suggests client-side rendering.",
      recommendation:
        ssrStatus === "pass"
          ? undefined
          : "Render primary content on the server so it exists in the first HTML response.",
      weight: 2,
    }),
  );

  const noisePct = content.noiseRatio * 100;
  const noiseStatus: CheckStatus =
    content.noiseRatio <= NOISE_RATIO_PASS
      ? "pass"
      : content.noiseRatio <= NOISE_RATIO_WARN
        ? "warn"
        : "fail";

  checks.push(
    check({
      id: "noise-budget",
      label: "Non-content budget",
      status: noiseStatus,
      summary: `${noisePct.toFixed(0)}% scripts & styles`,
      detail: `${formatBytes(content.noiseBytes)} of script, style, SVG and frame markup in a ${formatBytes(content.htmlBytes)} document.`,
      recommendation:
        noiseStatus === "pass"
          ? undefined
          : "Defer or externalize scripts and styles, and remove third-party widgets from content pages.",
      weight: 1.5,
    }),
  );

  return {
    id: "semantic",
    name: "Semantic Signal-to-Noise",
    shortName: "Signal",
    description: "How much of the document is meaningful content rather than chrome?",
    score: 0,
    checks,
  };
}

function buildStructuredPillar(input: {
  jsonLd: JsonLdReport;
  openApi: ProbeResult;
  wellKnown: ProbeResult & { entries: string[] };
}): AuditPillar {
  const { jsonLd, openApi, wellKnown } = input;
  const checks: AuditCheck[] = [];

  const jsonLdStatus: CheckStatus =
    jsonLd.valid > 0 ? "pass" : jsonLd.invalid > 0 ? "warn" : "fail";
  const types = jsonLd.types.slice(0, 4);

  checks.push(
    check({
      id: "json-ld",
      label: "JSON-LD schema",
      status: jsonLdStatus,
      summary:
        jsonLd.valid > 0
          ? `${jsonLd.valid} valid block${jsonLd.valid === 1 ? "" : "s"}`
          : jsonLd.invalid > 0
            ? "Invalid"
            : "Missing",
      detail:
        jsonLd.valid > 0
          ? `Valid structured data${types.length > 0 ? `: ${types.join(", ")}` : ""}.`
          : jsonLd.invalid > 0
            ? `${jsonLd.invalid} JSON-LD block${jsonLd.invalid === 1 ? "" : "s"} could not be parsed.`
            : "No JSON-LD structured data was found in the page head.",
      recommendation:
        jsonLdStatus === "pass"
          ? undefined
          : "Add JSON-LD with @context and @type (Organization, WebSite, Article, Product, or FAQPage).",
      weight: 2.5,
    }),
  );

  checks.push(
    check({
      id: "openapi",
      label: "OpenAPI description",
      status: openApi.found ? "pass" : "warn",
      summary: openApi.found ? (openApi.path ?? "Found") : "Not found",
      detail: openApi.detail,
      recommendation: openApi.found
        ? undefined
        : "If the site exposes an API, publish an OpenAPI description at /openapi.json so agents can call it correctly.",
      weight: 1.5,
    }),
  );

  checks.push(
    check({
      id: "well-known",
      label: ".well-known discovery",
      status: wellKnown.found ? "pass" : "warn",
      summary: wellKnown.found
        ? `${wellKnown.entries.length} document${wellKnown.entries.length === 1 ? "" : "s"}`
        : "Nothing found",
      detail: wellKnown.detail,
      recommendation: wellKnown.found
        ? undefined
        : "Add /.well-known/security.txt (and ai-plugin.json if you expose tools) so agents can discover machine-readable policies.",
      weight: 1,
    }),
  );

  return {
    id: "structured",
    name: "Structured Machine Interfaces",
    shortName: "Structure",
    description: "Can agents read your schemas and act on them without guessing?",
    score: 0,
    checks,
  };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export async function analyzeSite(rawInput: string): Promise<AuditResult> {
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

  const cacheKey = requested.toString();
  const cached = readCache(cacheKey);
  if (cached) return cached;

  const homeResponse = await fetchText(requested, {
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.6",
    timeoutMs: 9_000,
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
      timeoutMs: STANDARD_TIMEOUT_MS,
      maxBytes: 300_000,
    }),
    fetchText(new URL("/llms.txt", origin), {
      accept: "text/plain,text/markdown,*/*;q=0.5",
      timeoutMs: STANDARD_TIMEOUT_MS,
      maxBytes: 400_000,
    }),
    fetchText(new URL("/llms-full.txt", origin), {
      accept: "text/plain,text/markdown,*/*;q=0.5",
      timeoutMs: STANDARD_TIMEOUT_MS,
      maxBytes: 2_000_000,
    }),
    probeOpenApi(origin),
    probeWellKnown(origin),
  ]);

  const robots =
    robotsResponse.ok && !looksLikeHtml(robotsResponse.body)
      ? parseRobots(robotsResponse.body)
      : emptyRobots();

  const primarySitemap = await fetchText(new URL("/sitemap.xml", origin), {
    accept: "application/xml,text/xml,application/xhtml+xml,*/*;q=0.5",
    timeoutMs: STANDARD_TIMEOUT_MS,
    maxBytes: 4_000_000,
  });

  const sitemap = await loadSitemap(origin, robots, primarySitemap);

  const $ = cheerio.load(homeResponse.body);

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

  const metaRobots = [
    $('meta[name="robots"]').attr("content"),
    $('meta[name="googlebot"]').attr("content"),
  ]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(", ")
    .toLowerCase();

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

  const pillars: AuditPillar[] = [
    buildDiscoveryPillar({ llms: llmsResponse, llmsFull: llmsFullResponse, sitemap }),
    buildAccessPillar({ robots, robotsResponse: robotsResponse, metaRobots }),
    buildSemanticPillar(content),
    buildStructuredPillar({ jsonLd, openApi, wellKnown }),
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
          weight: entry.weight,
        })),
    )
    .sort((a, b) => {
      const rank = (status: CheckStatus) => (status === "fail" ? 0 : status === "warn" ? 1 : 2);
      if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
      return b.weight - a.weight;
    })
    .slice(0, 6);

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

  writeCache(cacheKey, result);
  return result;
}
