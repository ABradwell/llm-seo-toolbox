export interface RobotsRule {
  type: "allow" | "disallow";
  path: string;
}

export interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
}

export interface RobotsData {
  exists: boolean;
  groups: RobotsGroup[];
  sitemaps: string[];
  crawlDelay: number | null;
}

export const AI_CRAWLERS = [
  {
    id: "gptbot",
    label: "GPTBot",
    vendor: "OpenAI",
    note: "Trains and refreshes OpenAI models.",
  },
  {
    id: "claudebot",
    label: "ClaudeBot",
    vendor: "Anthropic",
    note: "Collects content for Claude.",
  },
  {
    id: "google-extended",
    label: "Google-Extended",
    vendor: "Google",
    note: "Controls Gemini and Vertex AI grounding.",
  },
  {
    id: "perplexitybot",
    label: "PerplexityBot",
    vendor: "Perplexity",
    note: "Powers Perplexity answers and citations.",
  },
  {
    id: "bytespider",
    label: "Bytespider",
    vendor: "ByteDance",
    note: "Feeds ByteDance and TikTok search.",
  },
] as const;

export type AiCrawler = (typeof AI_CRAWLERS)[number];

export function emptyRobots(): RobotsData {
  return { exists: false, groups: [], sitemaps: [], crawlDelay: null };
}

export function parseRobots(text: string): RobotsData {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let crawlDelay: number | null = null;
  let agents: string[] = [];
  let rules: RobotsRule[] = [];

  const pushGroup = () => {
    if (agents.length > 0) {
      groups.push({ agents: [...agents], rules: [...rules] });
    }
    agents = [];
    rules = [];
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;

    const separator = line.indexOf(":");
    if (separator === -1) continue;

    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === "user-agent") {
      if (rules.length > 0) pushGroup();
      if (value) agents.push(value.toLowerCase());
      continue;
    }

    if (field === "allow" || field === "disallow") {
      if (agents.length === 0) continue;
      rules.push({ type: field, path: value });
      continue;
    }

    if (field === "sitemap" && value) {
      sitemaps.push(value);
      continue;
    }

    if (field === "crawl-delay" && value) {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) crawlDelay = parsed;
    }
  }

  pushGroup();

  return { exists: true, groups, sitemaps, crawlDelay };
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
        candidates.push({ rule: { type: "allow", path: "" }, index: 0 });
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
}

export function crawlerAccess(data: RobotsData, bot: string, path = "/"): CrawlerAccess {
  if (!data.exists) {
    return {
      status: "pass",
      scope: "missing",
      summary: "Allowed by default",
      detail: "No robots.txt was found, so crawlers are not restricted.",
    };
  }

  const target = bot.toLowerCase();
  const hasSpecific = data.groups.some((group) => group.agents.some((agent) => agent === target));
  const groups = selectGroups(data, bot);
  const verdict = evaluatePath(groups, path);

  if (!hasSpecific && groups.length === 0) {
    return {
      status: "pass",
      scope: "none",
      summary: "Allowed by default",
      detail: "robots.txt has no rule for this crawler, so access is unrestricted.",
    };
  }

  const scope = hasSpecific ? "specific" : "wildcard";

  if (!verdict.allowed && verdict.matchedRule) {
    return {
      status: "fail",
      scope,
      summary: "Blocked",
      detail: hasSpecific
        ? `A rule targeting this crawler blocks ${path}: Disallow: ${verdict.matchedRule.path || "/"}.`
        : `The wildcard group blocks ${path}: Disallow: ${verdict.matchedRule.path || "/"}.`,
    };
  }

  return {
    status: "pass",
    scope,
    summary: hasSpecific ? "Explicitly allowed" : "Allowed by wildcard",
    detail: hasSpecific
      ? "A rule targeting this crawler explicitly allows it."
      : "No crawler-specific rule exists, and the wildcard group allows it.",
  };
}

export function isPathBlocked(data: RobotsData, path = "/"): boolean {
  const groups = data.groups.filter((group) => group.agents.includes("*"));
  if (groups.length === 0) return false;
  return !evaluatePath(groups, path).allowed;
}
