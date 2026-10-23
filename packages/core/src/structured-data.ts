import * as cheerio from "cheerio";

import type { StructuredDataFormat } from "./types";

export interface JsonLdBlock {
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

export interface StructuredDataNode {
  format: StructuredDataFormat;
  types: string[];
  properties: Record<string, unknown>;
  line: number | null;
}

export interface StructuredDataReport extends JsonLdReport {
  nodes: StructuredDataNode[];
  formats: Record<StructuredDataFormat, number>;
}

function sourceLine(element: unknown): number | null {
  if (!element || typeof element !== "object") return null;
  const location = (element as { sourceCodeLocation?: { startLine?: number } }).sourceCodeLocation;
  return location?.startLine ?? null;
}

export function typeList(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function collectJsonLdNodes(
  value: unknown,
  line: number | null,
  nodes: StructuredDataNode[],
): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectJsonLdNodes(entry, line, nodes));
    return;
  }
  if (!isRecord(value)) return;

  const types = typeList(value["@type"]);
  if (types.length > 0) {
    nodes.push({ format: "json-ld", types, properties: value, line });
  }

  if (Array.isArray(value["@graph"])) {
    value["@graph"].forEach((entry) => collectJsonLdNodes(entry, line, nodes));
  }
}

type CheerioElement = Parameters<cheerio.CheerioAPI>[0];

function propertyValue($: cheerio.CheerioAPI, element: unknown): unknown {
  const node = $(element as CheerioElement);
  const nestedScope = node.is("[itemscope]") ? node : node.find("[itemscope]").first();
  if (nestedScope.length > 0 && node.is("[itemscope]")) {
    return microdataProperties($, node);
  }

  const content = node.attr("content") ?? node.attr("datetime");
  if (content !== undefined) return content;
  const href = node.attr("href") ?? node.attr("src");
  if (href !== undefined) return href;
  return node.text().trim();
}

function microdataProperties(
  $: cheerio.CheerioAPI,
  scope: ReturnType<cheerio.CheerioAPI>,
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const nodes = scope.find("[itemprop]").toArray();
  for (const element of nodes) {
    const node = $(element);
    const closestScope = node.parents("[itemscope]").first()[0];
    if (closestScope && closestScope !== scope[0]) continue;
    const names = (node.attr("itemprop") ?? "").trim().split(/\s+/).filter(Boolean);
    if (names.length === 0) continue;
    const value = propertyValue($, element);
    for (const name of names) {
      const existing = properties[name];
      if (existing === undefined) properties[name] = value;
      else if (Array.isArray(existing)) existing.push(value);
      else properties[name] = [existing, value];
    }
  }
  return properties;
}

function collectMicrodata($: cheerio.CheerioAPI): StructuredDataNode[] {
  const nodes: StructuredDataNode[] = [];
  $("[itemscope][itemtype]").each((_, element) => {
    const node = $(element);
    const types = (node.attr("itemtype") ?? "")
      .trim()
      .split(/\s+/)
      .map((value) => value.replace(/\/$/, "").split("/").pop() ?? value)
      .filter(Boolean);
    if (types.length === 0) return;
    nodes.push({
      format: "microdata",
      types,
      properties: microdataProperties($, node),
      line: sourceLine(element),
    });
  });
  return nodes;
}

function collectRdfa($: cheerio.CheerioAPI): StructuredDataNode[] {
  const nodes: StructuredDataNode[] = [];
  $("[typeof]").each((_, element) => {
    const node = $(element);
    const types = (node.attr("typeof") ?? "")
      .trim()
      .split(/\s+/)
      .map((value) => value.replace(/\/$/, "").split(/[:/]/).pop() ?? value)
      .filter(Boolean);
    if (types.length === 0) return;

    const properties: Record<string, unknown> = {};
    node.find("[property]").each((__, propertyElement) => {
      const propertyNode = $(propertyElement);
      const names = (propertyNode.attr("property") ?? "").trim().split(/\s+/).filter(Boolean);
      const value =
        propertyNode.attr("content") ??
        propertyNode.attr("datetime") ??
        propertyNode.attr("href") ??
        propertyNode.attr("src") ??
        propertyNode.text().trim();
      for (const name of names) {
        if (properties[name] === undefined) properties[name] = value;
      }
    });

    nodes.push({ format: "rdfa", types, properties, line: sourceLine(element) });
  });
  return nodes;
}

function jsonLdBlocks($: cheerio.CheerioAPI): {
  blocks: JsonLdBlock[];
  nodes: StructuredDataNode[];
  types: string[];
} {
  const blocks: JsonLdBlock[] = [];
  const nodes: StructuredDataNode[] = [];
  const types = new Set<string>();

  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).text().trim();
    const line = sourceLine(element);
    if (!raw) return;

    try {
      const parsed: unknown = JSON.parse(raw);
      const record = isRecord(parsed) ? parsed : null;
      const previous = nodes.length;
      collectJsonLdNodes(parsed, line, nodes);
      const blockTypes = nodes.slice(previous).flatMap((node) => node.types);
      blockTypes.forEach((type) => types.add(type));
      blocks.push({
        line,
        valid: true,
        types: [...new Set(blockTypes)],
        hasContext: Boolean(record?.["@context"]),
      });
    } catch {
      blocks.push({ line, valid: false, types: [], hasContext: false });
    }
  });

  return { blocks, nodes, types: [...types] };
}

/**
 * Extracts JSON-LD, microdata and RDFa in one pass. `json-ld` keeps its own
 * counters for compatibility; the combined report also carries every node so
 * identity, FAQ and schema-depth checks can read the same structures.
 */
export function extractStructuredData($: cheerio.CheerioAPI): StructuredDataReport {
  const jsonLd = jsonLdBlocks($);
  const microdata = collectMicrodata($);
  const rdfa = collectRdfa($);
  const nodes = [...jsonLd.nodes, ...microdata, ...rdfa];
  const allTypes = new Set(jsonLd.types);
  microdata.forEach((node) => node.types.forEach((type) => allTypes.add(type)));
  rdfa.forEach((node) => node.types.forEach((type) => allTypes.add(type)));

  const validBlocks = jsonLd.blocks.filter((block) => block.valid);

  return {
    valid: validBlocks.length,
    invalid: jsonLd.blocks.length - validBlocks.length,
    types: [...allTypes],
    blocks: jsonLd.blocks,
    firstValidLine: validBlocks[0]?.line ?? null,
    firstBlockLine: jsonLd.blocks[0]?.line ?? null,
    nodes,
    formats: {
      "json-ld": jsonLd.nodes.length,
      microdata: microdata.length,
      rdfa: rdfa.length,
    },
  };
}

/** JSON-LD-only view, kept for callers that only need the original report. */
export function extractJsonLd($: cheerio.CheerioAPI): JsonLdReport {
  const report = extractStructuredData($);
  const types = [
    ...new Set(
      report.nodes.filter((node) => node.format === "json-ld").flatMap((node) => node.types),
    ),
  ];
  return {
    valid: report.valid,
    invalid: report.invalid,
    types,
    blocks: report.blocks,
    firstValidLine: report.firstValidLine,
    firstBlockLine: report.firstBlockLine,
  };
}
