import type { IdentitySignal } from "./types";
import type { StructuredDataNode, StructuredDataReport } from "./structured-data";
import { isSchemaType } from "./schema-depth";

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function asStringList(value: unknown): string[] {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (Array.isArray(value)) {
    return value.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter(Boolean);
  }
  return [];
}

export function nodesOfType(
  report: StructuredDataReport,
  types: readonly string[],
): StructuredDataNode[] {
  return report.nodes.filter((node) =>
    node.types.some((type) => types.some((expected) => isSchemaType(type, expected))),
  );
}

/** Organization and Person nodes, flattened from JSON-LD graphs and microdata. */
export function identitySignals(report: StructuredDataReport): IdentitySignal[] {
  return nodesOfType(report, ["Organization", "Person"]).map((node) => ({
    type: node.types[0] ?? "Organization",
    format: node.format,
    name: asString(node.properties.name) ?? asString(node.properties.legalName),
    url: asString(node.properties.url) ?? asString(node.properties["@id"]),
    description: asString(node.properties.description),
    sameAs: asStringList(node.properties.sameAs),
    jobTitle: asString(node.properties.jobTitle),
    knowsAbout: asStringList(node.properties.knowsAbout),
    line: node.line,
  }));
}

export interface FaqSchemaPair {
  question: string;
  answer: string;
  line: number | null;
}

/** Question and answer strings from FAQPage nodes. */
export function faqSchemaPairs(report: StructuredDataReport): FaqSchemaPair[] {
  const pairs: FaqSchemaPair[] = [];
  for (const node of nodesOfType(report, ["FAQPage"])) {
    const entities = node.properties.mainEntity;
    if (!Array.isArray(entities)) continue;
    for (const entity of entities) {
      if (!entity || typeof entity !== "object") continue;
      const record = entity as Record<string, unknown>;
      const question = asString(record.name) ?? asString(record.text);
      const answerRecord =
        record.acceptedAnswer && typeof record.acceptedAnswer === "object"
          ? (record.acceptedAnswer as Record<string, unknown>)
          : null;
      const answer = answerRecord ? asString(answerRecord.text) : asString(record.acceptedAnswer);
      if (question && answer) pairs.push({ question, answer, line: node.line });
    }
  }
  return pairs;
}

export interface BreadcrumbItem {
  name: string;
  url: string | null;
}

export interface BreadcrumbList {
  items: BreadcrumbItem[];
  line: number | null;
  format: StructuredDataNode["format"];
}

function itemUrl(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return asString(record["@id"]) ?? asString(record.url);
  }
  return null;
}

export function breadcrumbLists(report: StructuredDataReport): BreadcrumbList[] {
  return nodesOfType(report, ["BreadcrumbList"]).map((node) => {
    const elements = Array.isArray(node.properties.itemListElement)
      ? node.properties.itemListElement
      : [];
    const items = elements
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const record = entry as Record<string, unknown>;
        return {
          name: asString(record.name) ?? "",
          url: itemUrl(record.item),
        };
      })
      .filter((entry): entry is BreadcrumbItem => Boolean(entry));

    return { items, line: node.line, format: node.format };
  });
}

export function hasFaqSchema(report: StructuredDataReport): boolean {
  return nodesOfType(report, ["FAQPage"]).some(
    (node) => Array.isArray(node.properties.mainEntity) && node.properties.mainEntity.length > 0,
  );
}

/** Normalises text for a token-overlap comparison between schema and visible copy. */
export function tokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2),
  );
}

export function tokenOverlap(left: string, right: string): number {
  const a = tokens(left);
  const b = tokens(right);
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) {
    if (b.has(token)) shared += 1;
  }
  return shared / Math.min(a.size, b.size);
}
