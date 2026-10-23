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
  StructuredDataFormat,
} from "./types";

import { buildContentModel, SNR_PASS, SNR_WARN, type ContentModel } from "./content";
import { collectDateSignals } from "./dates";
import {
  breadcrumbLists,
  faqSchemaPairs,
  hasFaqSchema as hasFaqSchemaNode,
  identitySignals,
  tokenOverlap,
} from "./entities";
import { detectFaqPairs } from "./faq";
import { evaluateMetaRobots, evaluateXRobotsTag } from "./directives";
import { gradeFor, scorePillar, scoreTone } from "./score";
import { formatNumber, normalizeWhitespace } from "./format";
import { extractMetadata, type PageMetadata } from "./metadata";
import {
  extractJsonLd,
  extractStructuredData,
  type JsonLdReport,
  type StructuredDataNode,
  type StructuredDataReport,
} from "./structured-data";
import { isSchemaType, matchesAnyType, placeholderFor, scoreSchemaDepth } from "./schema-depth";

export { extractJsonLd, extractStructuredData };
export type { JsonLdReport, StructuredDataReport };

export interface AnalyzePageInput {
  page: AuditPage;
  html: string;
  headers: Record<string, string>;
  finalUrl?: string;
  recommendedSchema: string[];
  requiredSchema?: string[];
  profileLabel: string;
  profileType: SiteType;
  faqExpected?: boolean;
  siteName?: string;
  sitemapLastmod?: string | null;
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

function words(value: string): number {
  const trimmed = normalizeWhitespace(value);
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

function contentScope($: cheerio.CheerioAPI, content: ContentModel) {
  const scoped = content.scopeSelector === "body" ? null : $(content.scopeSelector).first();
  return scoped && scoped.length > 0 ? scoped : $("body").first();
}

function firstNodeLine(nodes: readonly StructuredDataNode[]): number | null {
  return nodes.find((node) => node.line !== null)?.line ?? null;
}

function formatsIn(report: StructuredDataReport): StructuredDataFormat[] {
  return (Object.entries(report.formats) as [StructuredDataFormat, number][])
    .filter(([, count]) => count > 0)
    .map(([format]) => format);
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split(".");
  let current = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (!current[segment] || typeof current[segment] !== "object") current[segment] = {};
    current = current[segment] as Record<string, unknown>;
  }
  current[segments[segments.length - 1]] = value;
}

function schemaDepthFix(
  result: ReturnType<typeof scoreSchemaDepth>,
  requiredSchema: string[],
): string {
  const type = result.type ?? requiredSchema[0] ?? "Thing";
  const payload: Record<string, unknown> = { "@context": "https://schema.org", "@type": type };
  for (const path of [...result.present, ...result.missing]) {
    const key = path === "proficiencyLevel|about" ? "about" : path;
    setPath(payload, key, placeholderFor(key));
  }
  if (result.missing.length === 0 && Object.keys(payload).length === 2) {
    payload.name = placeholderFor("name");
  }
  return JSON.stringify(payload, null, 2);
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
  const metadata = extractMetadata($, finalUrl);
  const structured = extractStructuredData($);
  const metaRobots = extractMetaRobots($);
  const xRobotsTag = input.headers["x-robots-tag"]?.trim() || null;
  const faqExpected = input.faqExpected ?? false;
  const requiredSchema =
    input.requiredSchema && input.requiredSchema.length > 0
      ? input.requiredSchema
      : input.recommendedSchema;
  const dates = collectDateSignals({
    metadata,
    structured,
    html: input.html,
    headers: input.headers,
    sitemapLastmod: input.sitemapLastmod ?? null,
  });

  const title =
    metadata.title ||
    normalizeWhitespace($('meta[property="og:title"]').attr("content") ?? "") ||
    input.page.label;

  const checks: AuditCheck[] = [
    ...buildAccessChecks({ path, metaRobots, xRobotsTag, html: input.html }),
    ...buildParseabilityChecks({
      path,
      html: input.html,
      content,
      metadata,
      structured,
      faqExpected,
      profileType: input.profileType,
      siteName: input.siteName ?? "",
      finalUrl,
    }),
    ...buildStructuredChecks({
      path,
      structured,
      requiredSchema,
      recommendedSchema: input.recommendedSchema,
      profileLabel: input.profileLabel,
      profileType: input.profileType,
      faqExpected,
      finalUrl,
    }),
    ...buildDiscoveryChecks({
      path,
      metadata,
      dates,
      profileType: input.profileType,
      finalUrl,
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
    jsonLdTypes: structured.types,
    structuredFormats: formatsIn(structured),
    metaRobots: metaRobots.value,
    xRobotsTag,
    freshness: dates.modified ?? dates.published ?? dates.sitemap,
    faqPairs: detectFaqPairs(input.html).pairs.length,
    hasFaqSchema: hasFaqSchemaNode(structured),
    identity: identitySignals(structured),
    descriptionChars: metadata.description.length,
    canonical: metadata.canonical?.href ?? null,
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
    structuredFormats: [],
    metaRobots: "",
    xRobotsTag: null,
    freshness: null,
    faqPairs: 0,
    hasFaqSchema: false,
    identity: [],
    descriptionChars: 0,
    canonical: null,
    error: input.error,
    fetchMs: input.fetchMs ?? 0,
  };
}

function buildAccessChecks(input: {
  path: string;
  metaRobots: { value: string; line: number | null };
  xRobotsTag: string | null;
  html: string;
}): AuditCheck[] {
  const { path, metaRobots, xRobotsTag, html } = input;
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
      evidence: evidenceAt(path, metaRobots.line, html),
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
  metadata: PageMetadata;
  structured: StructuredDataReport;
  faqExpected: boolean;
  profileType: SiteType;
  siteName: string;
  finalUrl: string;
}): AuditCheck[] {
  const {
    path,
    html,
    content,
    metadata,
    structured,
    faqExpected,
    profileType,
    siteName,
    finalUrl,
  } = input;
  const checks: AuditCheck[] = [];
  const { headings } = content;
  const h1Count = headings.filter((heading) => heading.level === 1).length;
  const firstH1 = headings.find((heading) => heading.level === 1) ?? headings[0] ?? null;
  const $ = cheerio.load(html, { sourceCodeLocationInfo: true });
  const scope = contentScope($, content);

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

  checks.push(
    ...buildAnswerabilityChecks({
      path,
      html,
      content,
      scope,
      $,
      structured,
      faqExpected,
    }),
  );

  checks.push(buildPageMetadataCheck({ path, html, metadata, siteName }));
  checks.push(buildImageAltCheck({ path, html, scope, profileType }));
  checks.push(buildCitableEvidenceCheck({ path, content, scope, profileType, finalUrl }));

  return checks;
}

function buildAnswerabilityChecks(input: {
  path: string;
  html: string;
  content: ContentModel;
  scope: ReturnType<typeof contentScope>;
  $: cheerio.CheerioAPI;
  structured: StructuredDataReport;
  faqExpected: boolean;
}): AuditCheck[] {
  const { path, html, content, scope, $, structured, faqExpected } = input;
  const checks: AuditCheck[] = [];

  // faq-content
  const visible = detectFaqPairs(html);
  const schemaPairs = faqSchemaPairs(structured);
  const schemaMatched =
    schemaPairs.length > 0 &&
    schemaPairs.every((pair) => tokenOverlap(pair.answer, content.text) >= 0.8);
  const faqSchemaLine =
    structured.nodes.find((node) => node.types.includes("FAQPage"))?.line ?? null;

  let faqStatus: CheckStatus;
  if (visible.pairs.length >= 3 || (schemaPairs.length >= 3 && schemaMatched)) {
    faqStatus = "pass";
  } else if (visible.pairs.length > 0 || schemaPairs.length > 0) {
    faqStatus = "warn";
  } else {
    faqStatus = faqExpected ? "fail" : "info";
  }

  const faqSummary =
    visible.pairs.length > 0
      ? plural(visible.pairs.length, "visible Q&A pair")
      : schemaPairs.length > 0
        ? plural(schemaPairs.length, "schema Q&A pair")
        : "None found";
  const faqDetail =
    faqStatus === "pass"
      ? `${visible.pairs.length >= 3 ? `${plural(visible.pairs.length, "visible question-and-answer pair")} were found` : `${plural(schemaPairs.length, "FAQPage answer")} match the visible page text`}.`
      : faqStatus === "info"
        ? "No visible FAQ was found. FAQ content is not weighted for this profile."
        : visible.pairs.length > 0
          ? `Only ${plural(visible.pairs.length, "question-and-answer pair")} were found. Three or more give a model enough to quote.`
          : schemaPairs.length > 0
            ? "A FAQPage block exists, but its answers do not match the visible page text closely enough to be quotable."
            : "No visible question-and-answer content was found on the page.";

  checks.push(
    check({
      id: "faq-content",
      label: "Visible FAQ content",
      status: faqStatus,
      summary: faqSummary,
      detail: faqDetail,
      protocol: "Visible Q&A · FAQPage mainEntity",
      evidence: evidenceAt(
        path,
        visible.pairs[0]?.line ?? faqSchemaLine ?? firstNodeLine(structured.nodes),
        html,
      ),
      recommendation:
        faqStatus === "pass" || faqStatus === "info"
          ? undefined
          : "Add a short FAQ to the pages people ask about most: three questions with one-paragraph answers in the HTML.",
      fix:
        faqStatus === "pass" || faqStatus === "info"
          ? undefined
          : fix(
              "html",
              `<section aria-labelledby="faq">
  <h2 id="faq">Frequently asked questions</h2>
  <h3>What does it cost?</h3>
  <p>A direct answer in one paragraph, visible without JavaScript.</p>
  <h3>How long does setup take?</h3>
  <p>A direct answer in one paragraph, visible without JavaScript.</p>
  <h3>Can I cancel at any time?</h3>
  <p>A direct answer in one paragraph, visible without JavaScript.</p>
</section>

<script type="application/ld+json">
${JSON.stringify(
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "What does it cost?",
        acceptedAnswer: { "@type": "Answer", text: "A direct answer in one paragraph." },
      },
    ],
  },
  null,
  2,
)}
</script>`,
            ),
      weight: faqExpected ? 2 : 0.5,
    }),
  );

  // answer-first
  const ordered = scope.find("h1, h2, p").toArray();
  const h1Index = ordered.findIndex(
    (element) => $(element).prop("tagName")?.toLowerCase() === "h1",
  );
  const afterH1 = h1Index === -1 ? ordered : ordered.slice(h1Index + 1);
  const firstHeadingAfter = afterH1.findIndex(
    (element) => $(element).prop("tagName")?.toLowerCase() === "h2",
  );
  const beforeH2 = firstHeadingAfter === -1 ? afterH1 : afterH1.slice(0, firstHeadingAfter);
  const firstParagraph = beforeH2.find(
    (element) => $(element).prop("tagName")?.toLowerCase() === "p",
  );
  const summaryWords = firstParagraph ? words($(firstParagraph).text()) : 0;

  let answerStatus: CheckStatus;
  if (summaryWords >= 40 && summaryWords <= 160) answerStatus = "pass";
  else if (firstParagraph) answerStatus = "warn";
  else answerStatus = "fail";

  checks.push(
    check({
      id: "answer-first",
      label: "Answer-first summary",
      status: answerStatus,
      summary: firstParagraph ? `${summaryWords} word summary` : "No summary before H2",
      detail:
        answerStatus === "pass"
          ? `A ${summaryWords}-word summary paragraph follows the H1 before the first section heading.`
          : answerStatus === "warn"
            ? `The first paragraph has ${summaryWords} words. A 40–160 word summary is easier for a model to quote.`
            : "No prose paragraph appears between the H1 and the first H2, so the page opens with structure instead of an answer.",
      protocol: "Answer-first content structure",
      evidence: evidenceAt(
        path,
        firstParagraph ? sourceLine(firstParagraph) : content.scopeLine,
        html,
      ),
      recommendation:
        answerStatus === "pass"
          ? undefined
          : "Put one plain-language summary paragraph of 40–160 words directly under the H1.",
      fix:
        answerStatus === "pass"
          ? undefined
          : fix(
              "html",
              `<h1>Page topic</h1>
<p>One paragraph of 40–160 words that answers the main question directly, before the first section heading.</p>
<h2>Supporting detail</h2>`,
            ),
      weight: 1.5,
    }),
  );

  // section-chunks
  const nodes = scope.find("h2, h3").toArray();
  const sections = nodes.map((heading, index) => {
    const level = Number(String($(heading).prop("tagName") ?? "h2").replace(/\D/g, ""));
    const parts: string[] = [];
    let sibling = $(heading).next();
    while (sibling.length > 0) {
      const tag = String(sibling.prop("tagName") ?? "").toLowerCase();
      const match = /^h([2-6])$/.exec(tag);
      if (match && Number(match[1]) <= level) break;
      parts.push(sibling.text());
      sibling = sibling.next();
    }
    return {
      words: words(parts.join(" ")),
      line: sourceLine(heading),
      index,
    };
  });
  const sectionCount = nodes.length;
  const medianWords = median(sections.map((section) => section.words));
  const longest = sections.reduce(
    (best, section) => (section.words > best.words ? section : best),
    sections[0] ?? { words: 0, line: null, index: -1 },
  );
  const totalWords = words(content.text);

  let chunkStatus: CheckStatus;
  let chunkSummary: string;
  let chunkDetail: string;
  if (sectionCount === 0 && totalWords >= 1500) {
    chunkStatus = "fail";
    chunkSummary = "No H2 sections";
    chunkDetail = `${formatNumber(totalWords)} words of prose have no H2 section headings, so an agent cannot split the page into quotable chunks.`;
  } else if (sectionCount === 1 && totalWords >= 1500) {
    chunkStatus = "warn";
    chunkSummary = "One section only";
    chunkDetail = `${formatNumber(totalWords)} words sit under one heading. Split the page into shorter sections.`;
  } else if (longest.words > 1200) {
    chunkStatus = "warn";
    chunkSummary = `${formatNumber(longest.words)} word section`;
    chunkDetail = `The longest section holds ${formatNumber(longest.words)} words. Sections over 1,200 words are harder for a model to quote precisely.`;
  } else if (sectionCount >= 2 && (medianWords < 80 || medianWords > 500)) {
    chunkStatus = "warn";
    chunkSummary = `Median ${medianWords} words`;
    chunkDetail = `The median section holds ${medianWords} words. A target of 80–500 words keeps sections chunk-friendly.`;
  } else {
    chunkStatus = "pass";
    chunkSummary =
      sectionCount === 0
        ? "Short page, no sections"
        : `${sectionCount} sections · median ${medianWords} words`;
    chunkDetail =
      sectionCount === 0
        ? "The page is short enough that section splitting does not change how it is quoted."
        : `Median section ${medianWords} words, longest ${formatNumber(longest.words)} words. Both sit inside the chunk-friendly range.`;
  }

  checks.push(
    check({
      id: "section-chunks",
      label: "Chunk-friendly sections",
      status: chunkStatus,
      summary: chunkSummary,
      detail: chunkDetail,
      protocol: "Section length · 80–500 word median",
      evidence: evidenceAt(
        path,
        chunkStatus === "pass"
          ? nodes[0]
            ? sourceLine(nodes[0])
            : content.scopeLine
          : (longest.line ?? content.scopeLine),
        html,
      ),
      recommendation:
        chunkStatus === "pass"
          ? undefined
          : "Split long prose under descriptive H2/H3 headings, aiming for 80–500 words per section.",
      fix:
        chunkStatus === "pass"
          ? undefined
          : fix(
              "html",
              `<h1>Page topic</h1>
<p>Answer-first summary.</p>
<h2>What it does</h2>
<p>One focused section of 80–500 words.</p>
<h2>How it works</h2>
<p>One focused section of 80–500 words.</p>
<h2>What it costs</h2>
<p>One focused section of 80–500 words.</p>`,
            ),
      weight: 1,
    }),
  );

  return checks;
}

function buildPageMetadataCheck(input: {
  path: string;
  html: string;
  metadata: PageMetadata;
  siteName: string;
}): AuditCheck {
  const { path, html, metadata, siteName } = input;
  const titleLength = metadata.title.length;
  const descriptionLength = metadata.description.length;
  const titleOk = titleLength >= 15 && titleLength <= 70;
  const descriptionOk = descriptionLength >= 50 && descriptionLength <= 160;
  const langOk = Boolean(metadata.lang);
  const titleDistinct =
    !siteName ||
    normalizeWhitespace(metadata.title).toLowerCase() !==
      normalizeWhitespace(siteName).toLowerCase();

  let status: CheckStatus;
  let summary: string;
  if (!metadata.title || !metadata.description) {
    status = "fail";
    summary = !metadata.title ? "Title missing" : "Description missing";
  } else if (!titleOk || !descriptionOk || !langOk || !titleDistinct) {
    status = "warn";
    summary = `${titleLength} char title · ${descriptionLength} char description`;
  } else {
    status = "pass";
    summary = `${titleLength} char title · ${descriptionLength} char description`;
  }

  const offendingLine = !metadata.title
    ? null
    : !titleOk || !titleDistinct
      ? metadata.titleLine
      : !metadata.description || !descriptionOk
        ? metadata.descriptionLine
        : !langOk
          ? metadata.langLine
          : metadata.titleLine;

  return check({
    id: "page-metadata",
    label: "Page title and description",
    status,
    summary,
    detail:
      status === "pass"
        ? `Title (${titleLength} chars), description (${descriptionLength} chars) and language (${metadata.lang}) are all present and in range.`
        : `Title ${titleLength} chars (target 15–70${metadata.title ? "" : ", missing"}), description ${descriptionLength} chars (target 50–160${metadata.description ? "" : ", missing"}), language ${metadata.lang ?? "missing"}.`,
    protocol: "HTML title, meta description, html lang",
    evidence: evidenceAt(path, offendingLine, html),
    recommendation:
      status === "pass"
        ? undefined
        : "Give each page a unique 15–70 character title, a 50–160 character meta description and a lang attribute on <html>.",
    fix:
      status === "pass"
        ? undefined
        : fix(
            "html",
            `<html lang="en">
<head>
  <title>A specific page title under 70 characters</title>
  <meta name="description" content="A 50–160 character summary that reads as a sentence and says what the page covers." />
</head>`,
          ),
    weight: 1.5,
  });
}

function buildImageAltCheck(input: {
  path: string;
  html: string;
  scope: ReturnType<typeof contentScope>;
  profileType: SiteType;
}): AuditCheck {
  const { path, html, scope, profileType } = input;
  const images = scope
    .find("img")
    .toArray()
    .filter((element) => {
      const node = scope.find(element);
      if ((node.attr("role") ?? "").toLowerCase() === "presentation") return false;
      if ((node.attr("aria-hidden") ?? "").toLowerCase() === "true") return false;
      const width = Number.parseInt(node.attr("width") ?? "", 10);
      const height = Number.parseInt(node.attr("height") ?? "", 10);
      if (width === 1 && height === 1) return false;
      return true;
    });

  const described = images.filter((element) => {
    const alt = scope.find(element).attr("alt")?.trim() ?? "";
    return alt.length >= 4;
  });
  const coverage = images.length === 0 ? 100 : Math.round((described.length / images.length) * 100);

  let status: CheckStatus;
  if (images.length < 3) status = "pass";
  else if (coverage >= 90) status = "pass";
  else if (coverage >= 50) status = "warn";
  else status = "fail";

  const missing = images.find((element) => {
    const alt = scope.find(element).attr("alt")?.trim() ?? "";
    return alt.length < 4;
  });

  return check({
    id: "image-alt",
    label: "Image alt text",
    status,
    summary: images.length === 0 ? "No content images" : `${coverage}% described`,
    detail:
      images.length === 0
        ? "The content region contains no images that need alt text."
        : `${described.length} of ${plural(images.length, "content image")} have alt text of at least four characters. Decorative and tracking images are excluded.`,
    protocol: "HTML img alt attribute",
    evidence: evidenceAt(path, missing ? sourceLine(missing) : null, html),
    recommendation:
      status === "pass"
        ? undefined
        : "Give every meaningful image alt text that describes what it shows, not the file name.",
    fix:
      status === "pass"
        ? undefined
        : fix(
            "html",
            `<img src="/dashboard.png" alt="Dashboard showing answer coverage by crawler intent" width="1200" height="630" />`,
          ),
    weight: profileType === "portfolio" || profileType === "ecommerce" ? 1.5 : 0.5,
  });
}

function buildCitableEvidenceCheck(input: {
  path: string;
  content: ContentModel;
  scope: ReturnType<typeof contentScope>;
  profileType: SiteType;
  finalUrl: string;
}): AuditCheck {
  const { path, content, scope, profileType, finalUrl } = input;
  const weighted = profileType === "blog-media" || profileType === "saas";

  if (!weighted) {
    return check({
      id: "citable-evidence",
      label: "Statistics and references",
      status: "info",
      summary: "Not scored",
      detail:
        "Numeric claims and outbound references are editorial signals scored for blogs and SaaS content only.",
      protocol: "Editorial evidence heuristic",
      weight: 0.5,
    });
  }

  const claims = (
    content.text.match(
      /(?:\b\d[\d,.]*\s*(?:%|percent|million|billion|thousand|ms|s|kb|mb|gb|users|customers|countries|hours?|days?|years?)\b|[$€£]\s?\d[\d,.]*)/gi,
    ) ?? []
  ).length;
  let origin = "";
  try {
    origin = new URL(finalUrl).origin;
  } catch {
    origin = "";
  }
  const outbound = scope
    .find("a[href]")
    .toArray()
    .filter((element) => {
      const href = scope.find(element).attr("href") ?? "";
      if (!/^https?:\/\//i.test(href)) return false;
      try {
        return new URL(href).origin !== origin;
      } catch {
        return false;
      }
    }).length;
  const totalWords = words(content.text);
  const rate = totalWords === 0 ? 0 : claims / (totalWords / 500);

  const status: CheckStatus = rate >= 2 && outbound >= 1 ? "pass" : "warn";

  return check({
    id: "citable-evidence",
    label: "Statistics and references",
    status,
    summary: `${claims} numeric claims · ${outbound} outbound`,
    detail: `${plural(claims, "numeric claim")} across ${formatNumber(totalWords)} words (${rate.toFixed(1)} per 500 words) and ${plural(outbound, "outbound reference")}. This is a heuristic, not a correctness score.`,
    protocol: "Editorial evidence heuristic",
    evidence: evidenceAt(path, content.scopeLine),
    recommendation:
      status === "pass"
        ? undefined
        : "Add concrete numbers, dates or measurements and link to the sources behind them. Editorial work, not a template change.",
    weight: 0.5,
  });
}

function buildStructuredChecks(input: {
  path: string;
  structured: StructuredDataReport;
  requiredSchema: string[];
  recommendedSchema: string[];
  profileLabel: string;
  profileType: SiteType;
  faqExpected: boolean;
  finalUrl: string;
}): AuditCheck[] {
  const {
    path,
    structured,
    requiredSchema,
    recommendedSchema,
    profileLabel,
    profileType,
    faqExpected,
    finalUrl,
  } = input;
  const checks: AuditCheck[] = [];
  const formats = formatsIn(structured);

  const jsonLdStatus: CheckStatus =
    structured.valid > 0
      ? "pass"
      : structured.nodes.length > 0
        ? "warn"
        : structured.invalid > 0
          ? "warn"
          : "fail";
  const typeLabels = structured.types.slice(0, 6);

  checks.push(
    check({
      id: "json-ld",
      label: "Structured data presence & syntax",
      status: jsonLdStatus,
      summary:
        structured.valid > 0
          ? plural(structured.valid, "valid block")
          : formats.length > 0
            ? `${formats.join(" + ")} only`
            : structured.invalid > 0
              ? "Invalid JSON"
              : "Missing",
      detail:
        structured.valid > 0
          ? `Valid JSON-LD${typeLabels.length > 0 ? `: ${typeLabels.join(", ")}` : ""}.`
          : formats.length > 0
            ? `Structured data was found as ${formats.join(" and ")}. It is readable, but JSON-LD is the format AI crawlers and search engines handle most consistently.`
            : structured.invalid > 0
              ? `${plural(structured.invalid, "structured data block")} could not be parsed.`
              : "No JSON-LD, microdata or RDFa structured data was found in the page.",
      protocol: "schema.org · JSON-LD, microdata, RDFa",
      evidence: evidenceAt(path, structured.firstBlockLine ?? firstNodeLine(structured.nodes)),
      recommendation:
        jsonLdStatus === "pass"
          ? undefined
          : structured.nodes.length > 0
            ? "Keep the microdata or RDFa, and add an equivalent JSON-LD block so parsers get the same facts in the preferred format."
            : "Add a JSON-LD block with @context and @type so the page can be classified without guessing.",
      fix:
        jsonLdStatus === "pass"
          ? undefined
          : fix(
              "json",
              JSON.stringify(
                {
                  "@context": "https://schema.org",
                  "@type": requiredSchema[0] ?? recommendedSchema[0] ?? "TechArticle",
                  name: "Your site or page",
                  description: "One-sentence summary of the page.",
                },
                null,
                2,
              ),
            ),
      weight: 2.5,
    }),
  );

  const requiredMatch = matchesAnyType(structured.types, requiredSchema);
  const recommendedPresent = recommendedSchema.filter((type) =>
    structured.types.some((candidate) => isSchemaType(candidate, type)),
  );
  const hasRequired = requiredMatch !== null;
  const needsDepth = faqExpected && recommendedPresent.length < 2;

  let schemaStatus: CheckStatus;
  if (hasRequired && !needsDepth) schemaStatus = "pass";
  else if (hasRequired || recommendedPresent.length > 0) schemaStatus = "warn";
  else schemaStatus = "fail";

  const expected = requiredSchema.join(" or ");
  const schemaSummary = hasRequired
    ? requiredMatch
    : recommendedPresent.length > 0
      ? `${recommendedPresent.join(", ")} only`
      : `0 / ${requiredSchema.length} required`;

  checks.push(
    check({
      id: "schema-types",
      label: "Profile schema types",
      status: schemaStatus,
      summary: schemaSummary,
      detail: `The ${profileLabel} profile requires ${expected}. Found: ${
        structured.types.length > 0 ? structured.types.join(", ") : "none"
      }.${needsDepth ? ` Recommended depth types are ${recommendedSchema.join(", ")}.` : ""}`,
      protocol: `schema.org · ${requiredSchema.join(" / ")}`,
      evidence: evidenceAt(path, structured.firstValidLine ?? firstNodeLine(structured.nodes)),
      recommendation:
        schemaStatus === "pass"
          ? undefined
          : `Add a ${requiredSchema[0]} object (or an equivalent ${profileLabel.toLowerCase()} type) to the page's JSON-LD.`,
      fix:
        schemaStatus === "pass"
          ? undefined
          : fix(
              "json",
              JSON.stringify(
                {
                  "@context": "https://schema.org",
                  "@type": requiredSchema[0] ?? "TechArticle",
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

  const depth = scoreSchemaDepth(structured, requiredSchema);
  const depthStatus: CheckStatus =
    depth.percentage >= 80 ? "pass" : depth.percentage >= 40 ? "warn" : "fail";
  checks.push(
    check({
      id: "schema-depth",
      label: "Schema property depth",
      status: depthStatus,
      summary:
        depth.required.length === 0
          ? "No matching type"
          : `${depth.percentage}% · ${depth.missing.length} missing`,
      detail:
        depth.required.length === 0
          ? "No structured data type with a required-property table was found on the page."
          : `${depth.present.length} of ${plural(depth.required.length, "required property", "required properties")} are present on the primary ${depth.type} node.${depth.missing.length > 0 ? ` Missing: ${depth.missing.join(", ")}.` : ""}`,
      protocol: `schema.org · ${depth.type ?? requiredSchema[0] ?? "required properties"}`,
      evidence: evidenceAt(path, depth.node?.line ?? firstNodeLine(structured.nodes)),
      recommendation:
        depthStatus === "pass"
          ? undefined
          : "Fill in the missing properties on the primary structured data node so an agent can answer factual questions without guessing.",
      fix: depthStatus === "pass" ? undefined : fix("json", schemaDepthFix(depth, requiredSchema)),
      weight: 1.5,
    }),
  );

  const lists = breadcrumbLists(structured);
  const segments = path.split("/").filter(Boolean).length;
  const pageUrl = finalUrl.replace(/\/$/, "");
  const lastItem = lists[0]?.items[lists[0].items.length - 1] ?? null;
  const lastItemMatches =
    lastItem?.url !== null &&
    lastItem?.url !== undefined &&
    lastItem.url.replace(/\/$/, "") === pageUrl;

  let breadcrumbStatus: CheckStatus;
  let breadcrumbSummary: string;
  let breadcrumbDetail: string;
  if (lists.length === 0) {
    if (segments === 0) {
      breadcrumbStatus = "info";
      breadcrumbSummary = "Homepage";
      breadcrumbDetail = "The homepage does not need a breadcrumb trail.";
    } else if (segments >= 2) {
      breadcrumbStatus = "warn";
      breadcrumbSummary = "Missing";
      breadcrumbDetail = `This page is ${segments} levels deep and has no BreadcrumbList, so an agent cannot see where it sits in the site.`;
    } else {
      breadcrumbStatus = "info";
      breadcrumbSummary = "Not needed";
      breadcrumbDetail = "A top-level page does not need a breadcrumb trail.";
    }
  } else if (lastItemMatches) {
    breadcrumbStatus = "pass";
    breadcrumbSummary = plural(lists[0].items.length, "breadcrumb");
    breadcrumbDetail = "The BreadcrumbList ends at this page URL.";
  } else {
    breadcrumbStatus = "warn";
    breadcrumbSummary = "Mismatched trail";
    breadcrumbDetail =
      "A BreadcrumbList exists, but its last item does not point at this page URL.";
  }

  checks.push(
    check({
      id: "breadcrumbs",
      label: "Breadcrumb trail",
      status: breadcrumbStatus,
      summary: breadcrumbSummary,
      detail: breadcrumbDetail,
      protocol: "schema.org · BreadcrumbList",
      evidence: evidenceAt(path, lists[0]?.line ?? null),
      recommendation:
        breadcrumbStatus === "warn"
          ? "Add a BreadcrumbList whose last item points at the page URL."
          : undefined,
      fix:
        breadcrumbStatus === "warn"
          ? fix(
              "json",
              JSON.stringify(
                {
                  "@context": "https://schema.org",
                  "@type": "BreadcrumbList",
                  itemListElement: [
                    {
                      "@type": "ListItem",
                      position: 1,
                      name: "Home",
                      item: new URL("/", finalUrl).toString(),
                    },
                    {
                      "@type": "ListItem",
                      position: 2,
                      name: "Current page",
                      item: finalUrl,
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

  return checks;
}

function buildDiscoveryChecks(input: {
  path: string;
  metadata: PageMetadata;
  dates: ReturnType<typeof collectDateSignals>;
  profileType: SiteType;
  finalUrl: string;
}): AuditCheck[] {
  const { path, metadata, dates, profileType, finalUrl } = input;
  const checks: AuditCheck[] = [];
  const freshnessWeight = profileType === "blog-media" || profileType === "docs" ? 2.5 : 1.5;
  const freshnessExpected = profileType === "blog-media" || profileType === "docs";
  const freshest = dates.modified ?? dates.published ?? dates.sitemap;
  const modified = dates.modified;
  const sitemap = dates.sitemap;
  const daysFromSitemap =
    modified && sitemap
      ? Math.abs(new Date(modified.iso).getTime() - new Date(sitemap.iso).getTime()) / 86_400_000
      : null;
  const monthsOld = freshest
    ? (Date.now() - new Date(freshest.iso).getTime()) / (1000 * 60 * 60 * 24 * 30.44)
    : null;

  let freshnessStatus: CheckStatus;
  let freshnessSummary: string;
  let freshnessDetail: string;
  if (!freshest) {
    freshnessStatus = freshnessExpected ? "fail" : "info";
    freshnessSummary = "No date signal";
    freshnessDetail = freshnessExpected
      ? "No machine-readable published or modified date was found, and this profile relies on dated content."
      : "No machine-readable date was found. Dates are optional for this profile.";
  } else if (!modified) {
    freshnessStatus = "warn";
    freshnessSummary = `Published ${Math.max(0, Math.round(monthsOld ?? 0))} months ago`;
    freshnessDetail =
      "Only a published date is present. A dateModified signal tells an agent the page is current.";
  } else if (monthsOld !== null && monthsOld > 18) {
    freshnessStatus = "warn";
    freshnessSummary = `Modified ${Math.round(monthsOld)} months ago`;
    freshnessDetail =
      "The freshest modified date is older than 18 months, so the page may look stale to an agent.";
  } else if (daysFromSitemap !== null && daysFromSitemap > 7) {
    freshnessStatus = "warn";
    freshnessSummary = `Sitemap differs by ${Math.round(daysFromSitemap)} days`;
    freshnessDetail = `The page says it was modified ${modified.iso.slice(0, 10)}, while the sitemap lastmod says ${sitemap?.iso.slice(0, 10)}. Keep the two signals in step.`;
  } else {
    freshnessStatus = "pass";
    freshnessSummary =
      monthsOld === null ? "Dated" : `Modified ${Math.max(0, Math.round(monthsOld))} months ago`;
    freshnessDetail =
      daysFromSitemap === null
        ? "A machine-readable modified date is present and recent."
        : `A machine-readable modified date is present and the sitemap lastmod agrees within ${Math.max(0, Math.round(daysFromSitemap))} days.`;
  }

  checks.push(
    check({
      id: "freshness",
      label: "Freshness signals",
      status: freshnessStatus,
      summary: freshnessSummary,
      detail: freshnessDetail,
      protocol: "schema.org dateModified · article:modified_time · sitemap lastmod",
      evidence: evidenceAt(path, freshest?.line ?? null),
      recommendation:
        freshnessStatus === "pass" || freshnessStatus === "info"
          ? undefined
          : "Publish a machine-readable dateModified on each page, keep it close to the sitemap lastmod, and refresh the page when the facts change.",
      fix:
        freshnessStatus === "pass" || freshnessStatus === "info"
          ? undefined
          : fix(
              "json",
              JSON.stringify(
                {
                  "@context": "https://schema.org",
                  "@type": profileType === "blog-media" ? "Article" : "WebPage",
                  dateModified: new Date().toISOString(),
                },
                null,
                2,
              ),
            ),
      weight: freshnessWeight,
    }),
  );

  const canonical = metadata.canonical;
  let canonicalStatus: CheckStatus;
  let canonicalSummary: string;
  let canonicalDetail: string;
  if (!canonical) {
    canonicalStatus = "warn";
    canonicalSummary = "Missing";
    canonicalDetail =
      "No canonical link was found, so an agent has to infer which URL is authoritative.";
  } else if (!canonical.absolute) {
    canonicalStatus = "warn";
    canonicalSummary = `Relative · ${canonical.href}`;
    canonicalDetail = "The canonical link is relative. Publish an absolute same-origin URL.";
  } else {
    let sameOrigin = false;
    try {
      sameOrigin = new URL(canonical.href).origin === new URL(finalUrl).origin;
    } catch {
      sameOrigin = false;
    }
    if (sameOrigin) {
      canonicalStatus = "pass";
      canonicalSummary = pathOf(canonical.href);
      canonicalDetail =
        "The canonical URL is absolute, same-origin and authoritative for this page.";
    } else {
      canonicalStatus = "fail";
      canonicalSummary = "Off-origin";
      canonicalDetail = `The canonical points at ${canonical.href}, which is outside the audited origin.`;
    }
  }

  checks.push(
    check({
      id: "canonical",
      label: "Canonical URL",
      status: canonicalStatus,
      summary: canonicalSummary,
      detail: canonicalDetail,
      protocol: "HTML link rel=canonical",
      evidence: evidenceAt(path, metadata.canonicalLine),
      recommendation:
        canonicalStatus === "pass"
          ? undefined
          : "Add an absolute, same-origin canonical link to each page and point it at the authoritative URL.",
      fix:
        canonicalStatus === "pass"
          ? undefined
          : fix("html", `<link rel="canonical" href="${finalUrl.replace(/\/$/, "")}" />`),
      weight: 1,
    }),
  );

  return checks;
}
