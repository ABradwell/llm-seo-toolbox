import * as cheerio from "cheerio";

import { normalizeWhitespace } from "./format";

export interface VisibleFaqPair {
  question: string;
  answer: string;
  line: number | null;
}

export interface FaqDetection {
  pairs: VisibleFaqPair[];
  firstLine: number | null;
}

const INTERROGATIVE =
  /^(?:what|why|how|when|where|who|whom|whose|which|can|could|do|does|did|is|are|was|were|should|would|will|may|might)\b/i;

function sourceLine(element: unknown): number | null {
  if (!element || typeof element !== "object") return null;
  const location = (element as { sourceCodeLocation?: { startLine?: number } }).sourceCodeLocation;
  return location?.startLine ?? null;
}

function isQuestion(value: string): boolean {
  const text = normalizeWhitespace(value);
  if (!text) return false;
  return text.endsWith("?") || INTERROGATIVE.test(text);
}

type CheerioElement = Parameters<cheerio.CheerioAPI>[0];

function answerAfterHeading($: cheerio.CheerioAPI, heading: unknown): string {
  const element = $(heading as CheerioElement);
  const level = Number.parseInt(String(element.prop("tagName") ?? "h2").replace(/\D/g, ""), 10);
  const parts: string[] = [];

  let sibling = element.next();
  while (sibling.length > 0) {
    const tag = String(sibling.prop("tagName") ?? "").toLowerCase();
    const match = /^h([1-6])$/.exec(tag);
    if (match && Number(match[1]) <= level) break;
    const text = normalizeWhitespace(sibling.text());
    if (text) parts.push(text);
    if (normalizeWhitespace(parts.join(" ")).length >= 1_200) break;
    sibling = sibling.next();
  }

  return normalizeWhitespace(parts.join(" "));
}

/**
 * Finds visible question-and-answer pairs: a heading, `<dt>` or `<summary>`
 * that reads as a question, followed by at least 40 characters of prose before
 * the next heading at the same or a higher level.
 */
export function detectFaqPairs(html: string): FaqDetection {
  const $ = cheerio.load(html, { sourceCodeLocationInfo: true });
  $("script, style, nav, header, footer, aside").remove();

  const scope = $("main").length > 0 ? $("main").first() : $("article").first();
  const root = scope.length > 0 ? scope : $("body").first();
  const pairs: VisibleFaqPair[] = [];
  const seen = new Set<string>();

  const add = (question: string, answer: string, element: unknown) => {
    const cleanQuestion = normalizeWhitespace(question);
    const cleanAnswer = normalizeWhitespace(answer);
    if (!cleanQuestion || cleanAnswer.length < 40) return;
    const key = cleanQuestion.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push({ question: cleanQuestion, answer: cleanAnswer, line: sourceLine(element) });
  };

  root.find("dt").each((_, element) => {
    const question = $(element).text();
    if (!isQuestion(question)) return;
    const definition = $(element).nextAll("dd").first();
    if (definition.length === 0) return;
    add(question, definition.text(), element);
  });

  root.find("summary").each((_, element) => {
    const question = $(element).text();
    if (!isQuestion(question)) return;
    const details = $(element).parent("details");
    if (details.length === 0) return;
    const answer = details.clone().find("summary").remove().end().text();
    add(question, answer, element);
  });

  root.find("h2, h3, h4, h5, h6").each((_, element) => {
    const question = $(element).text();
    if (!isQuestion(question)) return;
    add(question, answerAfterHeading($, element), element);
  });

  return {
    pairs,
    firstLine: pairs[0]?.line ?? null,
  };
}
