import * as cheerio from "cheerio";

import { normalizeWhitespace } from "./format";

/**
 * Elements that carry no prose. They cost tokens and add nothing an LLM can
 * quote, so they are stripped before any measurement.
 */
export const NOISE_SELECTOR = "script, style, noscript, template, svg, canvas, form, iframe";

/**
 * Landmarks that repeat on every document. They are removed from the content
 * scope so headings and text reflect the page topic, not the site chrome.
 */
export const CHROME_SELECTOR =
  'nav, aside, [role="navigation"], [role="complementary"], [role="banner"], [role="contentinfo"]';

/**
 * Site chrome that only appears when the whole `<body>` had to be used as the
 * content scope — `<header>` and `<footer>` inside `<main>`/`<article>` are
 * usually part of the content (article titles, metadata, footnotes).
 */
export const BODY_CHROME_SELECTOR = "header, footer";

/** Consent banners, hidden nodes and other widgets that pollute extraction. */
export const WIDGET_SELECTOR = '[aria-hidden="true"], [class*="cookie" i], [id*="cookie" i]';

/** Content scopes in order of confidence. */
export const SCOPE_SELECTORS = ["main", '[role="main"]', "article"] as const;

/**
 * Below this many characters a content scope is treated as a teaser (a single
 * card, a hero) and the whole document is used instead.
 */
export const MIN_SCOPE_TEXT_CHARS = 500;

/** Static-HTML signal-to-noise thresholds, expressed as a share of visible text. */
export const SNR_PASS = 0.65;
export const SNR_WARN = 0.45;

type ScopeNode = ReturnType<cheerio.CheerioAPI>;
type SourceLocation = { startLine?: number; startOffset?: number };

export interface HeadingNode {
  level: number;
  text: string;
  /** 1-based line in the original HTML response. */
  line: number | null;
}

export interface ContentModel {
  /** Selector of the element the content was read from, e.g. `main`. */
  scopeSelector: string;
  /** 1-based line where the content scope starts in the HTML response. */
  scopeLine: number | null;
  /** Cleaned inner HTML of the scope, ready to be converted to markdown. */
  cleanHtml: string;
  /** Whitespace-normalised text of the cleaned scope. */
  text: string;
  textChars: number;
  textBytes: number;
  /** Size of the full document as served. */
  htmlBytes: number;
  /** Size of the cleaned scope markup, i.e. what a parser has to read. */
  scopeBytes: number;
  /** Readable text as a share of the cleaned scope markup. */
  textRatio: number;
  noiseBytes: number;
  noiseRatio: number;
  /**
   * Static-HTML signal-to-noise ratio: content text divided by content text
   * plus navigation, footer, banner and widget text. 1 means no chrome.
   */
  snr: number;
  /** Characters kept as signal for `snr`. */
  snrSignalChars: number;
  /** Characters discarded as chrome/widget noise for `snr`. */
  snrNoiseChars: number;
  headings: HeadingNode[];
  removed: {
    landmarks: number;
    widgets: number;
    nodes: number;
  };
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function outerByteLength($: cheerio.CheerioAPI, selector: string): number {
  let total = 0;
  $(selector).each((_, element) => {
    total += byteLength($.html(element) ?? "");
  });
  return total;
}

function sourceLine(element: unknown): number | null {
  if (!element || typeof element !== "object") return null;
  const location = (element as { sourceCodeLocation?: SourceLocation }).sourceCodeLocation;
  return location?.startLine ?? null;
}

function extractHeadings($: cheerio.CheerioAPI, scope: ScopeNode): HeadingNode[] {
  const headings: HeadingNode[] = [];

  scope.find("h1, h2, h3, h4, h5, h6").each((_, element) => {
    const tag = String($(element).prop("tagName") ?? "").toLowerCase();
    const level = Number.parseInt(tag.replace("h", ""), 10);
    if (!Number.isFinite(level)) return;
    headings.push({
      level,
      text: normalizeWhitespace($(element).text()).slice(0, 120),
      line: sourceLine(element),
    });
  });

  return headings;
}

/**
 * Picks the element that holds the page content. `main`/`[role="main"]` win
 * over `article`; among equals the region with the most text wins, and a region
 * that only holds a teaser falls back to the whole document.
 */
function pickScope($: cheerio.CheerioAPI): { scope: ScopeNode; selector: string } {
  let best: ScopeNode | null = null;
  let bestSelector = "body";
  let bestLength = -1;

  for (const selector of SCOPE_SELECTORS) {
    $(selector).each((_, element) => {
      const node = $(element);
      const length = normalizeWhitespace(node.text()).length;
      if (length > bestLength) {
        best = node;
        bestSelector = selector;
        bestLength = length;
      }
    });
  }

  if (best && bestLength >= MIN_SCOPE_TEXT_CHARS) {
    return { scope: best, selector: bestSelector };
  }

  return { scope: $("body").first(), selector: "body" };
}

/**
 * Text that belongs to repeated chrome rather than the page's content. Only
 * top-level matches are counted so nested navigation does not inflate noise.
 */
function documentNoiseText($: cheerio.CheerioAPI): string {
  const selector = `${CHROME_SELECTOR}, ${BODY_CHROME_SELECTOR}, ${WIDGET_SELECTOR}`;
  const nodes = $(selector)
    .toArray()
    .filter((element) => $(element).parents(selector).length === 0);

  return normalizeWhitespace(nodes.map((element) => $(element).text()).join(" "));
}

/**
 * Reads a single HTML document the way an LLM scraper would: pick the content
 * scope, strip page chrome and machine-only markup, then measure what is left.
 */
export function buildContentModel(html: string): ContentModel {
  const htmlBytes = byteLength(html);
  const $ = cheerio.load(html, { sourceCodeLocationInfo: true });
  const noiseBytes = outerByteLength($, NOISE_SELECTOR);
  const noiseText = documentNoiseText($);

  const { scope, selector: scopeSelector } = pickScope($);
  const scopeLine = sourceLine(scope[0]);

  const chromeSelector =
    scopeSelector === "body" ? `${CHROME_SELECTOR}, ${BODY_CHROME_SELECTOR}` : CHROME_SELECTOR;

  const chrome = scope.find(chromeSelector);
  const landmarks = chrome.length;
  chrome.remove();

  const widgets = scope.find(WIDGET_SELECTOR);
  const widgetCount = widgets.length;
  widgets.remove();

  const noise = scope.find(NOISE_SELECTOR);
  const nodeCount = noise.length;
  noise.remove();

  const cleanHtml = scope.html() ?? "";
  const text = normalizeWhitespace(scope.text());
  const textBytes = byteLength(text);
  const scopeBytes = byteLength(cleanHtml);

  const snrSignalChars = text.length;
  const snrNoiseChars = noiseText.length;
  const snrTotal = snrSignalChars + snrNoiseChars;

  return {
    scopeSelector,
    scopeLine,
    cleanHtml,
    text,
    textChars: text.length,
    textBytes,
    htmlBytes,
    scopeBytes,
    textRatio: scopeBytes > 0 ? textBytes / scopeBytes : 0,
    noiseBytes,
    noiseRatio: htmlBytes > 0 ? noiseBytes / htmlBytes : 0,
    snr: snrTotal > 0 ? snrSignalChars / snrTotal : 0,
    snrSignalChars,
    snrNoiseChars,
    headings: extractHeadings($, scope),
    removed: { landmarks, widgets: widgetCount, nodes: nodeCount },
  };
}
