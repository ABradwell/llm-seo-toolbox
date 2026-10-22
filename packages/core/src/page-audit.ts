import * as cheerio from "cheerio";

import type {
  AuditCheck,
  AuditPage,
  CheckEvidence,
  CheckFix,
  CheckStatus,
  FixLanguage,
  PageAuditResult,
  PageOutcome,
  SiteType,
} from "./types";

import { buildContentModel, SNR_PASS, SNR_WARN, type ContentModel } from "./content";
import { evaluateMetaRobots, evaluateXRobotsTag } from "./directives";
import { gradeFor, scorePillar, scoreTone } from "./score";
import { formatNumber, normalizeWhitespace } from "./format";

interface JsonLdBlock {
  line: number | null;
  valid: boolean;
  types: string[];
  hasContext: boolean;
}

export interface JsonLdReport {
  valid: number;
  invalid: number;
  types: string[];
  blocks: JsonLdBlock[];
  firstValidLine: number | null;
  firstBlockLine: number | null;
}

export interface AnalyzePageInput {
  page: AuditPage;
  html: string;
  headers: Record<string, string>;
  finalUrl?: string;
  recommendedSchema: string[];
  profileLabel: string;
  profileType: SiteType;
  content?: ContentModel;
  source?: PageAuditResult["source"];
  fetchMs?: number;
}

export interface FailedPageInput {
  url: string;
  finalUrl?: string;
  label?: string;
  section?: string;
  source?: PageAuditResult["source"];
  outcome: PageOutcome;
  error: string;
  fetchMs?: number;
}

function check(input: Omit<AuditCheck, "weight" | "scope"> & { weight?: number }): AuditCheck {
  return { weight: input.weight ?? 1, scope: "page", ...input };
}

function fix(language: FixLanguage, code: string): CheckFix {
  return { language, code: code.trim() };
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${formatNumber(count)} ${count === 1 ? singular : pluralForm}`;
}

function sourceLine(element: unknown): number | null {
  if (!element || typeof element !== "object") return null;
  const location = (element as { sourceCodeLocation?: { startLine?: number } }).sourceCodeLocation;
  return location?.startLine ?? null;
}

function evidenceAt(file: string, line: number | null, source?: string): CheckEvidence {
  if (line === null) return { file, line: null, snippet: null };
  const snippet = source?.split(/\r?\n/)[line - 1]?.trim() ?? null;
  return { file, line, snippet: snippet ? snippet.slice(0, 240) : null };
}

function pathOf(value: string, fallback = "/"): string {
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}` || fallback;
  } catch {
    return fallback;
  }
}

export function extractJsonLd($: cheerio.CheerioAPI): JsonLdReport {
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

export function extractMetaRobots($: cheerio.CheerioAPI): { value: string; line: number | null } {
  const nodes = $('meta[name="robots"], meta[name="googlebot"]');
  const value = nodes
    .toArray()
    .map((element) => $(element).attr("content") ?? "")
    .filter((entry) => entry.trim())
    .join(", ")
    .toLowerCase();

  return { value, line: sourceLine(nodes.first()[0]) };
}

export function analyzePage(input: AnalyzePageInput): PageAuditResult {
  const finalUrl = input.finalUrl ?? input.page.url;
  const path = pathOf(finalUrl);
  const $ = cheerio.load(input.html, { sourceCodeLocationInfo: true });
  const content = input.content ?? buildContentModel(input.html);
  const jsonLd = extractJsonLd($);
  const metaRobots = extractMetaRobots($);
  const xRobotsTag = input.headers["x-robots-tag"]?.trim() || null;

  const title =
    normalizeWhitespace($("head title").first().text()) ||
    normalizeWhitespace($('meta[property="og:title"]').attr("content") ?? "") ||
    input.page.label;

  const checks: AuditCheck[] = [
    ...buildAccessChecks({ path, metaRobots, xRobotsTag }),
    ...buildParseabilityChecks({ path, html: input.html, content }),
    ...buildStructuredChecks({
      path,
      jsonLd,
      recommendedSchema: input.recommendedSchema,
      profileLabel: input.profileLabel,
      profileType: input.profileType,
    }),
  ];

  const score = scorePillar({ checks });
  const headings = content.headings;
  const h1Count = headings.filter((heading) => heading.level === 1).length;

  return {
    url: input.page.url,
    finalUrl,
    label: input.page.label,
    section: input.page.section,
    source: input.source ?? input.page.source,
    outcome: "analyzed",
    status: scoreTone(score),
    score,
    grade: gradeFor(score).grade,
    checks,
    title: title.slice(0, 300),
    textChars: content.textChars,
    snr: content.snr,
    h1Count,
    headingCount: headings.length,
    jsonLdTypes: jsonLd.types,
    metaRobots: metaRobots.value,
    xRobotsTag,
    fetchMs: input.fetchMs ?? 0,
  };
}

export function failedPage(input: FailedPageInput): PageAuditResult {
  return {
    url: input.url,
    finalUrl: input.finalUrl ?? input.url,
    label: input.label ?? input.url,
    section: input.section ?? "Pages",
    source: input.source ?? "focus",
    outcome: input.outcome,
    status: "info",
    score: null,
    grade: null,
    checks: [],
    title: "",
    textChars: 0,
    snr: 0,
    h1Count: 0,
    headingCount: 0,
    jsonLdTypes: [],
    metaRobots: "",
    xRobotsTag: null,
    error: input.error,
    fetchMs: input.fetchMs ?? 0,
  };
}

function buildAccessChecks(input: {
  path: string;
  metaRobots: { value: string; line: number | null };
  xRobotsTag: string | null;
}): AuditCheck[] {
  const { path, metaRobots, xRobotsTag } = input;
  const checks: AuditCheck[] = [];

  const metaVerdict = evaluateMetaRobots(metaRobots.value);
  checks.push(
    check({
      id: "meta-robots",
      label: "robots meta directives",
      status: metaVerdict.status,
      summary: metaVerdict.summary,
      detail: metaVerdict.detail,
      protocol: "HTML robots meta directives",
      evidence: evidenceAt(path, metaRobots.line),
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

  return checks;
}

function buildParseabilityChecks(input: {
  path: string;
  html: string;
  content: ContentModel;
}): AuditCheck[] {
  const { path, html, content } = input;
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
      evidence: evidenceAt(path, firstH1?.line ?? null, html),
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
      evidence: evidenceAt(path, firstJumpLine ?? headings[0]?.line ?? null, html),
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
      evidence: evidenceAt(path, content.scopeLine, html),
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
      evidence: evidenceAt(path, content.scopeLine, html),
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

  return checks;
}

function buildStructuredChecks(input: {
  path: string;
  jsonLd: JsonLdReport;
  recommendedSchema: string[];
  profileLabel: string;
  profileType: SiteType;
}): AuditCheck[] {
  const { path, jsonLd, recommendedSchema, profileLabel, profileType } = input;
  const checks: AuditCheck[] = [];

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
      evidence: evidenceAt(path, jsonLd.firstBlockLine),
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
      evidence: evidenceAt(path, jsonLd.firstValidLine ?? jsonLd.firstBlockLine),
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
                  ...(profileType === "local-business"
                    ? {
                        address: {
                          "@type": "PostalAddress",
                          streetAddress: "1 Main Street",
                          addressLocality: "Your city",
                          addressCountry: "US",
                        },
                      }
                    : {}),
                  ...(profileType === "ecommerce"
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

  return checks;
}
