export interface LlmsTxtIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  /** 1-based line in the manifest. */
  line: number | null;
}

export interface LlmsTxtSection {
  title: string;
  line: number;
  links: number;
}

export interface LlmsTxtValidation {
  /** 1-based line of the single H1, when present. */
  h1Line: number | null;
  h1: string | null;
  h1Count: number;
  summaryLine: number | null;
  hasSummary: boolean;
  sections: LlmsTxtSection[];
  linkCount: number;
  firstLinkLine: number | null;
  /** True when the file looks like a multi-page index rather than one bundle. */
  paginated: boolean;
  /** True when the H1 and markdown index requirements are met. */
  valid: boolean;
  lines: number;
  bytes: number;
  issues: LlmsTxtIssue[];
}

const LINK_PATTERN = /\[[^\]]+\]\([^)]+\)/g;
const PAGINATION_PATTERN = /(?:[?&](?:page|p|offset)=\d+|page\s+\d+\s+of\s+\d+)/i;

/**
 * Validates a `/llms.txt` manifest against the llmstxt.org structure: one H1,
 * an optional blockquote summary, H2 sections and markdown links.
 */
export function validateLlmsTxt(text: string): LlmsTxtValidation {
  const lines = text.split(/\r?\n/);
  const issues: LlmsTxtIssue[] = [];
  const sections: LlmsTxtSection[] = [];

  let h1Line: number | null = null;
  let h1: string | null = null;
  let h1Count = 0;
  let summaryLine: number | null = null;
  let linkCount = 0;
  let firstLinkLine: number | null = null;
  let paginated = false;
  let section: LlmsTxtSection | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const line = index + 1;
    const trimmed = raw.trim();
    if (!trimmed) continue;

    if (h1Count === 0 && h1Line === null) {
      const match = /^#\s+(.+?)\s*$/.exec(trimmed);
      if (match) {
        h1Line = line;
        h1 = match[1];
        h1Count = 1;
        continue;
      }
    } else if (summaryLine === null && trimmed.startsWith(">")) {
      summaryLine = line;
      continue;
    }

    if (/^#\s+/.test(trimmed)) {
      h1Count += 1;
      issues.push({
        severity: "warning",
        code: "multiple_h1",
        message: "A manifest should have exactly one H1 naming the site or project.",
        line,
      });
      continue;
    }

    const sectionMatch = /^##\s+(.+?)\s*$/.exec(trimmed);
    if (sectionMatch) {
      section = { title: sectionMatch[1], line, links: 0 };
      sections.push(section);
      continue;
    }

    const links = trimmed.match(LINK_PATTERN) ?? [];
    if (links.length > 0) {
      linkCount += links.length;
      if (firstLinkLine === null) firstLinkLine = line;
      if (section) section.links += links.length;
    }

    if (PAGINATION_PATTERN.test(trimmed)) paginated = true;
  }

  if (h1Line === null) {
    issues.push({
      severity: "error",
      code: "missing_h1",
      message: "The manifest has no H1 heading. Start the file with `# Site or project name`.",
      line: null,
    });
  }

  if (h1Count > 1) {
    // The per-line warning above already records each extra H1.
  }

  if (summaryLine === null && h1Line !== null) {
    issues.push({
      severity: "warning",
      code: "missing_summary",
      message:
        "Add a blockquote summary directly under the H1 so an agent knows what the site covers.",
      line: h1Line,
    });
  }

  if (linkCount === 0) {
    issues.push({
      severity: "error",
      code: "no_links",
      message: "No markdown links were found. The manifest should index the pages worth reading.",
      line: h1Line,
    });
  }

  if (sections.length === 0 && linkCount > 0) {
    issues.push({
      severity: "warning",
      code: "no_sections",
      message: "Group links under H2 sections so an agent can choose the right part of the site.",
      line: firstLinkLine,
    });
  }

  if (paginated) {
    issues.push({
      severity: "warning",
      code: "paginated",
      message:
        "Pagination markers were found. /llms.txt should be a stable, unpaginated index; put long-form content in /llms-full.txt.",
      line: null,
    });
  }

  const hasErrors = issues.some((issue) => issue.severity === "error");

  return {
    h1Line,
    h1,
    h1Count,
    summaryLine,
    hasSummary: summaryLine !== null,
    sections,
    linkCount,
    firstLinkLine,
    paginated,
    valid: !hasErrors && h1Line !== null && linkCount > 0,
    lines: lines.length,
    bytes: new TextEncoder().encode(text).length,
    issues,
  };
}
