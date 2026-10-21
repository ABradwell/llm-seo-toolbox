import type { AuditPage } from "./types";

export interface LlmsBuildInput {
  siteName: string;
  description: string;
  notes: string;
  pages: AuditPage[];
  selectedSections: string[];
  capturedMarkdown: string;
}

export interface LlmsSection {
  name: string;
  pages: AuditPage[];
}

const SECTION_ORDER = [
  "Documentation",
  "Guides",
  "Developers",
  "Product",
  "Updates",
  "Company",
  "Pages",
  "Home",
];

export function sectionForPath(pathname: string): string {
  const lower = pathname.toLowerCase();
  if (/(^|\/)(api|sdk|developers?|integrations?|plugins?)(\/|$)/.test(lower)) {
    return "Developers";
  }
  if (/(^|\/)(docs?|documentation|reference|manual|handbook)(\/|$)/.test(lower)) {
    return "Documentation";
  }
  if (/(^|\/)(guides?|tutorials?|learn|examples?)(\/|$)/.test(lower)) return "Guides";
  if (/(^|\/)(pricing|product|features?|solutions?|platform)(\/|$)/.test(lower)) {
    return "Product";
  }
  if (/(^|\/)(blog|news|changelog|updates?|posts?|releases?)(\/|$)/.test(lower)) {
    return "Updates";
  }
  if (/(^|\/)(about|careers?|jobs?|contact|team|company)(\/|$)/.test(lower)) {
    return "Company";
  }
  if (lower === "/" || lower === "") return "Home";
  return "Pages";
}

export function groupPages(pages: AuditPage[]): LlmsSection[] {
  const map = new Map<string, AuditPage[]>();

  for (const page of pages) {
    const bucket = map.get(page.section) ?? [];
    bucket.push(page);
    map.set(page.section, bucket);
  }

  return [...map.entries()]
    .map(([name, items]) => ({
      name,
      pages: [...items].sort((a, b) => a.url.localeCompare(b.url)),
    }))
    .sort((a, b) => {
      const indexA = SECTION_ORDER.indexOf(a.name);
      const indexB = SECTION_ORDER.indexOf(b.name);
      return (indexA === -1 ? 99 : indexA) - (indexB === -1 ? 99 : indexB);
    });
}

function escapeLabel(label: string): string {
  return label.replace(/[[\]]/g, "").replace(/\s+/g, " ").trim() || "Untitled";
}

function resolveDescription(input: LlmsBuildInput): string {
  const description = input.description.replace(/\s+/g, " ").trim();
  if (description) return description;
  return `Key pages and documentation for ${input.siteName}.`;
}

function header(input: LlmsBuildInput): string[] {
  return [`# ${input.siteName.trim() || "Untitled site"}`, "", `> ${resolveDescription(input)}`];
}

export function buildLlmsTxt(input: LlmsBuildInput): string {
  const lines: string[] = header(input);

  if (input.notes.trim()) {
    lines.push("", input.notes.trim());
  }

  const selected = new Set(input.selectedSections);
  const sections = groupPages(input.pages).filter((section) => selected.has(section.name));

  for (const section of sections) {
    lines.push("", `## ${section.name}`, "");
    for (const page of section.pages.slice(0, 60)) {
      lines.push(`- [${escapeLabel(page.label)}](${page.url})`);
    }
  }

  if (sections.length === 0) {
    lines.push("", "## Pages", "", "- [Home](/): Start here.");
  }

  return `${lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()}\n`;
}

export function buildLlmsFullTxt(input: LlmsBuildInput): string {
  const lines: string[] = header(input);

  if (input.notes.trim()) {
    lines.push("", input.notes.trim());
  }

  const captured = input.capturedMarkdown.trim();
  if (captured) {
    lines.push("", "## Captured page content", "", captured);
  }

  const selected = new Set(input.selectedSections);
  const sections = groupPages(input.pages).filter((section) => selected.has(section.name));

  for (const section of sections) {
    lines.push("", `## ${section.name}`, "");
    for (const page of section.pages.slice(0, 60)) {
      lines.push(`- [${escapeLabel(page.label)}](${page.url})`);
    }
  }

  return `${lines
    .join("\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()}\n`;
}

export function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}
