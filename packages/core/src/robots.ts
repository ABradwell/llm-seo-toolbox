import { AI_CRAWLERS } from "./crawlers";

export { AI_CRAWLERS, crawlerById, crawlersByIntent } from "./crawlers";
export type { AiCrawler } from "./types";

export interface RobotsRule {
  type: "allow" | "disallow";
  path: string;
  /** 1-based line in robots.txt. */
  line: number;
}

export interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
  /** 1-based line of the first user-agent directive in the group. */
  line: number;
}

export interface ContentSignal {
  /** 1-based line of the Content-Signal directive. */
  line: number;
  search: string | null;
  aiInput: string | null;
  aiTrain: string | null;
}

export interface RobotsData {
  exists: boolean;
  groups: RobotsGroup[];
  sitemaps: string[];
  /** 1-based lines of the Sitemap: directives, parallel to `sitemaps`. */
  sitemapLines: number[];
  crawlDelay: number | null;
  /** Cloudflare Content-Signal directives, parsed into their three purposes. */
  contentSignals: ContentSignal[];
}

export function emptyRobots(): RobotsData {
  return {
    exists: false,
    groups: [],
    sitemaps: [],
    sitemapLines: [],
    crawlDelay: null,
    contentSignals: [],
  };
}

function parseContentSignal(value: string, line: number): ContentSignal {
  const signal: ContentSignal = { line, search: null, aiInput: null, aiTrain: null };
  for (const part of value.split(/[;,]/)) {
    const [rawKey, rawValue] = part.split("=");
    if (!rawKey || rawValue === undefined) continue;
    const key = rawKey.trim().toLowerCase();
    const entry = rawValue.trim().toLowerCase();
    if (key === "search") signal.search = entry;
    else if (key === "ai-input") signal.aiInput = entry;
    else if (key === "ai-train") signal.aiTrain = entry;
  }
  return signal;
}

export function parseRobots(text: string): RobotsData {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  const sitemapLines: number[] = [];
  let crawlDelay: number | null = null;
  const contentSignals: ContentSignal[] = [];
  let agents: string[] = [];
  let rules: RobotsRule[] = [];
  let groupLine = 1;

  const pushGroup = () => {
    if (agents.length > 0) {
      groups.push({ agents: [...agents], rules: [...rules], line: groupLine });
    }
    agents = [];
    rules = [];
  };

  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].replace(/#.*$/, "").trim();
    if (!line) continue;

    const separator = line.indexOf(":");
    if (separator === -1) continue;

    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    const lineNumber = index + 1;

    if (field === "user-agent") {
      if (rules.length > 0) pushGroup();
      if (agents.length === 0) groupLine = lineNumber;
      if (value) agents.push(value.toLowerCase());
      continue;
    }

    if (field === "allow" || field === "disallow") {
      if (agents.length === 0) continue;
      rules.push({ type: field, path: value, line: lineNumber });
      continue;
    }

    if (field === "sitemap" && value) {
      sitemaps.push(value);
      sitemapLines.push(lineNumber);
      continue;
    }

    if (field === "content-signal" && value) {
      contentSignals.push(parseContentSignal(value, lineNumber));
      continue;
    }

    if (field === "crawl-delay" && value) {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) crawlDelay = parsed;
    }
  }

  pushGroup();

  return { exists: true, groups, sitemaps, sitemapLines, crawlDelay, contentSignals };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesRule(rulePath: string, path: string): boolean {
  const anchoredAtEnd = rulePath.endsWith("$");
  let base = anchoredAtEnd ? rulePath.slice(0, -1) : rulePath;
  if (!base.startsWith("/") && !base.startsWith("*")) base = `/${base}`;

  const pattern = base
    .split("*")
    .map((part) => escapeRegExp(part))
    .join(".*");

  try {
    return new RegExp(`^${pattern}${anchoredAtEnd ? "$" : ""}`).test(path);
  } catch {
    return false;
  }
}

export function selectGroups(data: RobotsData, bot: string): RobotsGroup[] {
  const target = bot.toLowerCase();
  const specific = data.groups.filter((group) => group.agents.some((agent) => agent === target));
  if (specific.length > 0) return specific;
  return data.groups.filter((group) => group.agents.includes("*"));
}

export interface RobotsVerdict {
  allowed: boolean;
  matchedRule: RobotsRule | null;
}

export function evaluatePath(groups: RobotsGroup[], path: string): RobotsVerdict {
  const candidates: { rule: RobotsRule; index: number }[] = [];

  for (const group of groups) {
    for (const rule of group.rules) {
      if (rule.path === "") {
        candidates.push({ rule: { type: "allow", path: "", line: rule.line }, index: 0 });
        continue;
      }
      if (matchesRule(rule.path, path)) {
        candidates.push({ rule, index: rule.path.length });
      }
    }
  }

  if (candidates.length === 0) {
    return { allowed: true, matchedRule: null };
  }

  candidates.sort((a, b) => {
    if (b.index !== a.index) return b.index - a.index;
    if (a.rule.type === b.rule.type) return 0;
    return a.rule.type === "allow" ? -1 : 1;
  });

  return {
    allowed: candidates[0].rule.type === "allow",
    matchedRule: candidates[0].rule,
  };
}

export interface CrawlerAccess {
  status: "pass" | "warn" | "fail";
  summary: string;
  detail: string;
  scope: "specific" | "wildcard" | "none" | "missing";
  /** Whether a group explicitly names this crawler. */
  explicit: boolean;
  /** 1-based line of the matching rule or group, when robots.txt exists. */
  line: number | null;
}

export function crawlerAccess(data: RobotsData, bot: string, path = "/"): CrawlerAccess {
  if (!data.exists) {
    return {
      status: "pass",
      scope: "missing",
      explicit: false,
      line: null,
      summary: "Allowed by default",
      detail: "No robots.txt was found, so crawlers are not restricted.",
    };
  }

  const target = bot.toLowerCase();
  const specificGroup = data.groups.find((group) => group.agents.some((agent) => agent === target));
  const hasSpecific = Boolean(specificGroup);
  const groups = selectGroups(data, bot);
  const verdict = evaluatePath(groups, path);

  if (!hasSpecific && groups.length === 0) {
    return {
      status: "pass",
      scope: "none",
      explicit: false,
      line: null,
      summary: "Allowed by default",
      detail: "robots.txt has no rule for this crawler, so access is unrestricted.",
    };
  }

  const scope = hasSpecific ? "specific" : "wildcard";
  const line = hasSpecific
    ? (verdict.matchedRule?.line ?? specificGroup?.line ?? null)
    : (verdict.matchedRule?.line ?? null);

  if (!verdict.allowed && verdict.matchedRule) {
    return {
      status: "fail",
      scope,
      explicit: hasSpecific,
      line,
      summary: "Blocked",
      detail: hasSpecific
        ? `A rule targeting this crawler blocks ${path}: Disallow: ${verdict.matchedRule.path || "/"}.`
        : `The wildcard group blocks ${path}: Disallow: ${verdict.matchedRule.path || "/"}.`,
    };
  }

  return {
    status: "pass",
    scope,
    explicit: hasSpecific,
    line,
    summary: hasSpecific ? "Explicitly allowed" : "Allowed by wildcard",
    detail: hasSpecific
      ? "A rule targeting this crawler explicitly allows it."
      : "No crawler-specific rule exists, and the wildcard group allows it.",
  };
}

/** True when robots.txt contains a group that names an AI crawler explicitly. */
export function hasExplicitAiPolicy(data: RobotsData): boolean {
  const agents = new Set(AI_CRAWLERS.map((crawler) => crawler.label.toLowerCase()));
  return data.groups.some((group) => group.agents.some((agent) => agents.has(agent)));
}

export function isPathBlocked(data: RobotsData, path = "/"): boolean {
  const groups = data.groups.filter((group) => group.agents.includes("*"));
  if (groups.length === 0) return false;
  return !evaluatePath(groups, path).allowed;
}

export interface CrawlerPathAccess {
  path: string;
  allowed: boolean;
  line: number | null;
}

export interface CrawlerPathVerdict extends CrawlerAccess {
  paths: CrawlerPathAccess[];
  blockedPaths: string[];
  /** Allowed path count, useful for the "8/8 sampled paths" summary. */
  allowedCount: number;
}

/**
 * Evaluates one crawler against the root and every sampled page path. The
 * worst outcome wins, so a site that allows `/` and disallows `/docs/` no
 * longer passes a named crawler check.
 */
export function crawlerAccessOnPaths(
  data: RobotsData,
  bot: string,
  paths: readonly string[],
): CrawlerPathVerdict {
  const unique = [...new Set(paths.length > 0 ? paths : ["/"])];
  const results = unique.map((path) => {
    const access = crawlerAccess(data, bot, path);
    return { path, allowed: access.status === "pass", line: access.line };
  });
  const blockedPaths = results.filter((entry) => !entry.allowed).map((entry) => entry.path);
  const base = crawlerAccess(data, bot, unique[0]);
  const allowedCount = results.length - blockedPaths.length;

  if (blockedPaths.length === 0) {
    return {
      ...base,
      status: "pass",
      summary:
        base.scope === "missing" || base.scope === "none"
          ? `Allowed · ${allowedCount}/${results.length} sampled paths`
          : `Allowed · ${allowedCount}/${results.length} sampled paths`,
      detail:
        base.scope === "specific"
          ? `A rule targeting this crawler allows all ${results.length} sampled paths.`
          : `No crawler-specific block applies, and all ${results.length} sampled paths are allowed.`,
      paths: results,
      blockedPaths,
      allowedCount,
    };
  }

  return {
    ...base,
    status: "fail",
    line: results.find((entry) => !entry.allowed)?.line ?? base.line,
    summary: `Blocked · ${blockedPaths.length}/${results.length} paths`,
    detail: `Blocked on ${blockedPaths.join(", ")}. The worst path decides this check, even when the root is allowed.`,
    paths: results,
    blockedPaths,
    allowedCount,
  };
}
