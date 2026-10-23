import type { CheckStatus } from "./types";

export interface DirectiveVerdict {
  status: CheckStatus;
  summary: string;
  detail: string;
  /** Directives that block indexing or AI ingestion. */
  blocking: string[];
  /** Soft directives that reduce what a crawler may quote. */
  restrictive: string[];
  /** Directives that explicitly widen snippet or image previews. */
  permissive: string[];
}

const BLOCKING = new Set(["noindex", "none", "noai", "noimageai"]);
const RESTRICTIVE = new Set(["nofollow", "noarchive", "nosnippet", "nocache"]);

/** Values that explicitly widen what a crawler may quote or preview. */
const PERMISSIVE = new Set(["max-snippet:-1", "max-image-preview:large", "max-video-preview:-1"]);

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
        // Value-carrying directives such as max-snippet:0 and
        // max-image-preview:large are one directive, not an agent scope.
        if (/^(?:max-snippet|max-image-preview|max-video-preview|unavailable_after)$/.test(agent)) {
          directives.add(`${agent}:${directive}`);
        } else {
          agents.add(agent);
          directives.add(directive);
        }
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
      permissive: [],
    };
  }

  const { agents, directives } = parseDirectives(value);
  const blocking = directives.filter((directive) => BLOCKING.has(directive));
  const restrictive = directives.filter(
    (directive) =>
      RESTRICTIVE.has(directive) ||
      directive === "max-snippet:0" ||
      directive === "max-image-preview:none" ||
      directive === "max-video-preview:0",
  );
  const permissive = directives.filter((directive) => PERMISSIVE.has(directive));
  const scope = agents.length > 0 ? ` (scoped to ${agents.join(", ")})` : "";
  const permissiveNote =
    permissive.length > 0 ? ` Permissive signals: ${permissive.join(", ")}.` : "";

  if (blocking.length > 0) {
    return {
      status: "fail",
      summary: blocking.join(", ") + scope,
      detail: `${source} declares ${blocking.join(", ")}${scope}, which removes the page from search and AI grounding surfaces.${permissiveNote}`,
      blocking,
      restrictive,
      permissive,
    };
  }

  if (restrictive.length > 0) {
    return {
      status: "warn",
      summary: restrictive.join(", ") + scope,
      detail: `${source} declares ${restrictive.join(", ")}${scope}. The page stays indexable, but crawlers may not quote or archive it.${permissiveNote}`,
      blocking,
      restrictive,
      permissive,
    };
  }

  return {
    status: "pass",
    summary: value,
    detail:
      permissive.length > 0
        ? `${source} contains permissive directives.${permissiveNote}`
        : `${source} contains only permissive directives.`,
    blocking,
    restrictive,
    permissive,
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
