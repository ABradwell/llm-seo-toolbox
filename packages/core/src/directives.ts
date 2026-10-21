import type { CheckStatus } from "./types";

export interface DirectiveVerdict {
  status: CheckStatus;
  summary: string;
  detail: string;
  /** Directives that block indexing or AI ingestion. */
  blocking: string[];
  /** Soft directives that reduce what a crawler may quote. */
  restrictive: string[];
}

const BLOCKING = new Set(["noindex", "none", "noai", "noimageai"]);
const RESTRICTIVE = new Set(["nofollow", "noarchive", "nosnippet", "nocache"]);

function parseDirectives(value: string | null): { agents: string[]; directives: string[] } {
  if (!value) return { agents: [], directives: [] };

  const agents = new Set<string>();
  const directives = new Set<string>();

  for (const segment of value.split(",")) {
    const token = segment.trim().toLowerCase();
    if (!token) continue;

    const colon = token.indexOf(":");
    if (colon > 0) {
      const agent = token.slice(0, colon).trim();
      const directive = token.slice(colon + 1).trim();
      if (agent && directive) {
        agents.add(agent);
        directives.add(directive);
        continue;
      }
    }

    directives.add(token);
  }

  return { agents: [...agents], directives: [...directives] };
}

function judge(source: string, value: string | null): DirectiveVerdict {
  if (!value) {
    return {
      status: "pass",
      summary: "Not set",
      detail: `No ${source} directives were returned, so nothing blocks indexing or AI ingestion.`,
      blocking: [],
      restrictive: [],
    };
  }

  const { agents, directives } = parseDirectives(value);
  const blocking = directives.filter((directive) => BLOCKING.has(directive));
  const restrictive = directives.filter((directive) => RESTRICTIVE.has(directive));
  const scope = agents.length > 0 ? ` (scoped to ${agents.join(", ")})` : "";

  if (blocking.length > 0) {
    return {
      status: "fail",
      summary: blocking.join(", ") + scope,
      detail: `${source} declares ${blocking.join(", ")}${scope}, which removes the page from search and AI grounding surfaces.`,
      blocking,
      restrictive,
    };
  }

  if (restrictive.length > 0) {
    return {
      status: "warn",
      summary: restrictive.join(", ") + scope,
      detail: `${source} declares ${restrictive.join(", ")}${scope}. The page stays indexable, but crawlers may not quote or archive it.`,
      blocking,
      restrictive,
    };
  }

  return {
    status: "pass",
    summary: value,
    detail: `${source} contains only permissive directives.`,
    blocking,
    restrictive,
  };
}

/** Evaluates the `X-Robots-Tag` response header (RFC 9309 + search directives). */
export function evaluateXRobotsTag(value: string | null): DirectiveVerdict {
  return judge("X-Robots-Tag", value);
}

/** Evaluates `<meta name="robots">` and `<meta name="googlebot">` content. */
export function evaluateMetaRobots(value: string | null): DirectiveVerdict {
  return judge("The robots meta tag", value);
}
