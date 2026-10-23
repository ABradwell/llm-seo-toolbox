import { headUrl } from "./fetch-page";

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
  /** HEAD-request results when link resolution ran. */
  resolved?: LlmsResolvedLink[];
  /** Manifest coverage against the sampled pages and the sitemap. */
  coverage?: LlmsTxtCoverage;
}

export interface LlmsTxtLink {
  url: string;
  label: string;
  section: string | null;
  /** 1-based line in the manifest. */
  line: number;
}

export interface LlmsResolvedLink {
  url: string;
  finalUrl: string;
  status: number;
  ok: boolean;
  /** True when the link left the audited origin without being marked external. */
  offOrigin: boolean;
  declaredExternal: boolean;
  section: string | null;
  error: string | null;
}

export interface LlmsTxtCoverage {
  /** Percentage of sampled pages referenced by the manifest. */
  sampled: number;
  /** Percentage of manifest links that appear in the sitemap. */
  sitemap: number;
}

const LINK_PATTERN = /\[[^\]]+\]\([^)]+\)/g;
const LINK_PARTS = /\[([^\]]+)\]\(([^)]+)\)/g;
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

/** Every markdown link in the manifest with its section and source line. */
export function extractLlmsTxtLinks(text: string, baseUrl: string): LlmsTxtLink[] {
  const lines = text.split(/\r?\n/);
  const links: LlmsTxtLink[] = [];
  let section: string | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    const sectionMatch = /^##\s+(.+?)\s*$/.exec(trimmed);
    if (sectionMatch) {
      section = sectionMatch[1];
      continue;
    }

    LINK_PARTS.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = LINK_PARTS.exec(trimmed)) !== null) {
      const href = match[2].trim();
      if (/^(?:mailto:|tel:|javascript:|data:|#)/i.test(href)) continue;
      let url: string;
      try {
        url = new URL(href, baseUrl).toString();
      } catch {
        continue;
      }
      links.push({ url, label: match[1].trim(), section, line: index + 1 });
    }
  }

  return links;
}

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.replace(/\/$/, "");
  }
}

export function llmsTxtCoverage(
  links: readonly LlmsTxtLink[],
  sampledUrls: readonly string[],
  sitemapUrls: readonly string[],
): LlmsTxtCoverage {
  const linked = new Set(links.map((link) => normalizeUrl(link.url)));
  const sampled = new Set(sampledUrls.map(normalizeUrl));
  const sitemap = new Set(sitemapUrls.map(normalizeUrl));

  const sampledHits = [...sampled].filter((url) =>
    [...linked].some((candidate) => candidate === url),
  ).length;
  const sitemapHits = [...linked].filter((url) => sitemap.has(url)).length;

  return {
    sampled: sampled.size === 0 ? 0 : Math.round((sampledHits / sampled.size) * 100),
    sitemap: linked.size === 0 ? 0 : Math.round((sitemapHits / linked.size) * 100),
  };
}

function declaredExternal(link: LlmsTxtLink): boolean {
  return /external|off-?site|third[- ]party/i.test(`${link.section ?? ""} ${link.label}`);
}

/**
 * HEAD-checks up to six manifest links (the first two per section) under a
 * four-second budget. Broken links and undeclared off-origin links downgrade
 * the manifest to a warning instead of failing the whole audit on timeout.
 */
export async function resolveLlmsTxtLinks(
  links: readonly LlmsTxtLink[],
  input: {
    origin: string;
    timeoutMs?: number;
    headers?: Record<string, string>;
    head?: typeof headUrl;
  },
): Promise<LlmsResolvedLink[]> {
  const perSection = new Map<string, number>();
  const selected: LlmsTxtLink[] = [];
  for (const link of links) {
    const key = link.section ?? "";
    const count = perSection.get(key) ?? 0;
    if (count >= 2) continue;
    perSection.set(key, count + 1);
    selected.push(link);
    if (selected.length >= 6) break;
  }

  const started = Date.now();
  const deadline = started + 4_000;
  const head = input.head ?? headUrl;
  const results: LlmsResolvedLink[] = [];

  for (let index = 0; index < selected.length; index += 3) {
    const batch = selected.slice(index, index + 3);
    if (Date.now() >= deadline) break;
    const settled = await Promise.all(
      batch.map(async (link) => {
        const remaining = Math.max(300, Math.min(1_500, deadline - Date.now()));
        const response = await head(link.url, {
          timeoutMs: Math.min(input.timeoutMs ?? remaining, remaining),
          headers: input.headers,
        });
        const external = declaredExternal(link);
        let offOrigin = false;
        try {
          offOrigin = new URL(response.finalUrl).origin !== input.origin && !external;
        } catch {
          offOrigin = false;
        }
        return {
          url: link.url,
          finalUrl: response.finalUrl,
          status: response.status,
          ok: response.ok && !offOrigin,
          offOrigin,
          declaredExternal: external,
          section: link.section,
          error: response.error,
        } satisfies LlmsResolvedLink;
      }),
    );
    results.push(...settled);
  }

  return results;
}
