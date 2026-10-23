import { AI_CRAWLERS } from "./robots";
import type { AuditGrade, CheckStatus, PillarId } from "./types";

/**
 * Plain-language copy for every audit check, written for marketers and site
 * owners rather than engineers. The technical copy stays in the check
 * builders. This catalog only explains what a result means and what to ask
 * a developer for.
 *
 * Rules: titles and problems carry no jargon. Asks may name files and tags,
 * because a developer reads them.
 */

export type ActionableStatus = "warn" | "fail";
export type PlainOwner = "developer" | "content" | "either";

export interface PlainCheckCopy {
  /** Neutral name for what the check looks at, e.g. "A clear main heading on each page". */
  title: string;
  /** Why the check is red or amber, in plain words. Falls back to the other status. */
  problem: Partial<Record<ActionableStatus, string>>;
  /** "Tell me more": why this matters. */
  why: string;
  /** What a passing site looks like. */
  good: string;
  /** Who usually does the work. */
  owner: PlainOwner;
  /** Change-request bullets a marketer can pass to a developer. Falls back to the other status. */
  asks: Partial<Record<ActionableStatus, string[]>>;
}

export interface PlainCopyContext {
  /** Site origin, e.g. `https://example.com`. */
  origin: string;
  /** Site profile label, e.g. "Documentation". */
  profile: string;
  /** Schema.org types the profile expects. */
  schema: readonly string[];
}

export interface ResolvedPlainCopy {
  title: string;
  /** Empty for passing and informational checks. */
  problem: string;
  why: string;
  good: string;
  owner: PlainOwner;
  /** Empty for passing and informational checks. */
  asks: string[];
  /** False when the check id has no catalog entry and the copy fell back to the technical text. */
  known: boolean;
}

export const SITE_CHECK_IDS: readonly string[] = [
  "llms-txt",
  "llms-full-txt",
  "sitemap",
  "robots-reachable",
  "ai-policy",
  ...AI_CRAWLERS.map((crawler) => `bot-${crawler.id}`),
  "openapi",
  "well-known",
];

export const PAGE_CHECK_IDS: readonly string[] = [
  "meta-robots",
  "x-robots-tag",
  "h1",
  "heading-order",
  "snr",
  "ssr-content",
  "json-ld",
  "schema-types",
];

export const PLAIN_OWNER_LABELS: Record<PlainOwner, string> = {
  developer: "developer",
  content: "content team",
  either: "developer or content team",
};

export const PLAIN_PILLAR_NAMES: Record<PillarId, string> = {
  discovery: "Being found",
  access: "Being let in",
  parseability: "Being read",
  structured: "Being understood",
};

export const PLAIN_GRADE_LABELS: Record<AuditGrade, string> = {
  A: "Ready for AI",
  B: "Nearly ready",
  C: "Needs work",
  D: "At risk",
  F: "Hard for AI to see",
};

const GRADE_SENTENCES: Record<AuditGrade, string> = {
  A: "AI assistants can find and read your site well.",
  B: "AI assistants can read most of your site.",
  C: "AI assistants can read parts of your site, but some gaps get in the way.",
  D: "AI assistants struggle to find and read your site.",
  F: "AI assistants can barely see your site.",
};

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** One or two plain sentences that sum up the grade and what to do next. */
export function plainGradeSummary(
  grade: AuditGrade,
  counts: { mustFix: number; improve: number },
): string {
  const lead = GRADE_SENTENCES[grade];
  if (counts.mustFix > 0) {
    return `${lead} Start with the ${plural(counts.mustFix, "must-fix item")} below.`;
  }
  if (counts.improve > 0) {
    return `${lead} Nothing is broken. ${plural(counts.improve, "improvement")} would help.`;
  }
  return `${lead} Nothing needs changing right now.`;
}

/** The AI product each crawler feeds, in the words a marketer would use. */
const CRAWLER_ASSISTANTS: Record<string, string> = {
  gptbot: "ChatGPT",
  claudebot: "Claude",
  "google-extended": "Gemini",
  perplexitybot: "Perplexity",
  bytespider: "ByteDance's AI products",
};

const CRAWLER_COPY: PlainCheckCopy = {
  title: "Access for {assistant} ({crawler})",
  problem: {
    fail: "Your crawler rules block {vendor}'s crawler ({crawler}), so {assistant} can't read or cite your pages.",
  },
  why: "{vendor} uses the name {crawler} to decide whether {assistant} may read your pages. If it is blocked, your pages can't be read or used as a source in its answers. Some sites block AI crawlers on purpose. If that was a deliberate decision, you can ignore this item.",
  good: "Your crawler rules name {crawler} and allow it on the pages you want cited.",
  owner: "developer",
  asks: {
    fail: [
      "Update robots.txt so {crawler} is allowed on the public pages we want {assistant} to cite.",
      "Check that firewall, CDN or bot-protection rules don't block {crawler} either.",
    ],
  },
};

export const PLAIN_CHECK_COPY: Record<string, PlainCheckCopy> = {
  "llms-txt": {
    title: "A guide file for AI assistants",
    problem: {
      fail: "Your site doesn't publish an AI guide file (llms.txt), so AI assistants have to work out on their own which pages matter most.",
      warn: "Your site has an AI guide file (llms.txt), but it isn't set up correctly, so AI assistants may ignore it.",
    },
    why: "llms.txt is a short text file at the root of your site. It tells AI assistants what the site is about and links to the pages they should read first. It is a new, lightweight standard and costs little to add.",
    good: "A plain-text file at /llms.txt with the site name, a one-sentence summary and grouped links to your most important pages.",
    owner: "either",
    asks: {
      fail: [
        "Publish an llms.txt file at {origin}/llms.txt, served as plain text.",
        "Start it with the site name as a heading and a one-sentence summary.",
        "List the pages AI assistants should read first, grouped under short section headings. We can supply the list.",
      ],
      warn: [
        "Fix {origin}/llms.txt so it follows the llms.txt format: one top-level heading, a short summary and markdown links to key pages.",
        "Make sure /llms.txt returns the plain-text file itself, not a web page or an error page.",
      ],
    },
  },
  "llms-full-txt": {
    title: "A full-text copy of your content for AI",
    problem: {
      warn: "Your site doesn't offer a single full-text file (llms-full.txt), so AI assistants have to visit page by page to read your content.",
    },
    why: "llms-full.txt is an optional companion to llms.txt. It holds your key content in one long file, so an assistant can read everything in a single request. It matters most for documentation and knowledge-heavy sites.",
    good: "One file at /llms-full.txt with your core content in plain text, not split into pages.",
    owner: "developer",
    asks: {
      warn: [
        "Publish {origin}/llms-full.txt as one plain-text (markdown) file holding the content we want AI assistants to read.",
        "Keep it as a single file, not split across multiple pages.",
        "Regenerate it automatically when the content changes.",
      ],
    },
  },
  sitemap: {
    title: "A complete map of your pages",
    problem: {
      fail: "Your site has no sitemap, so search engines and AI crawlers can miss pages.",
      warn: "Your sitemap is empty, unreadable or not linked from your crawler rules, so some crawlers may not find every page.",
    },
    why: "A sitemap is a list of every page you want found. Crawlers use it to discover new and updated pages quickly. Linking to it from robots.txt, your crawler rules file, means every crawler knows where to look.",
    good: "An up-to-date sitemap at /sitemap.xml, linked from robots.txt.",
    owner: "developer",
    asks: {
      fail: [
        "Publish an XML sitemap at {origin}/sitemap.xml that lists every public page.",
        "Generate it automatically so new pages appear without manual work.",
        "Add this line to robots.txt: Sitemap: {origin}/sitemap.xml",
      ],
      warn: [
        "Make sure {origin}/sitemap.xml lists our public pages and updates automatically.",
        "Add this line to robots.txt if it is missing: Sitemap: {origin}/sitemap.xml",
      ],
    },
  },
  "robots-reachable": {
    title: "A crawler rules file",
    problem: {
      fail: "Your crawler rules file (robots.txt) couldn't be read, so it is unclear which crawlers are allowed in.",
      warn: "Your site has no crawler rules file (robots.txt). Crawlers are let in by default, but nothing states your policy on purpose.",
    },
    why: "robots.txt is a small file that tells search engines and AI crawlers which parts of the site they may visit. Without one, you can't state, review or change your policy for any crawler.",
    good: "A robots.txt at the root of the site that loads reliably and states your policy for search and AI crawlers.",
    owner: "developer",
    asks: {
      fail: [
        "Make sure {origin}/robots.txt loads for everyone, including crawlers, without errors, login redirects or firewall challenges.",
        "Keep our policy for search and AI crawlers in it, plus a link to the sitemap.",
      ],
      warn: [
        "Publish a robots.txt at {origin}/robots.txt.",
        "Include our policy for AI crawlers (GPTBot, ClaudeBot, Google-Extended, PerplexityBot) and a link to the sitemap.",
      ],
    },
  },
  "ai-policy": {
    title: "A clear policy for AI crawlers",
    problem: {
      warn: "Your crawler rules don't mention AI crawlers by name, so your stance on AI assistants isn't written down anywhere.",
    },
    why: "AI companies run their own crawlers, such as GPTBot for ChatGPT and ClaudeBot for Claude. Naming them in robots.txt makes your choice explicit and easy to review. Without names, they follow your general rules, which may not reflect what you want.",
    good: "Your crawler rules name the main AI crawlers and say, for each one, whether it is allowed.",
    owner: "developer",
    asks: {
      warn: [
        "Add named entries to robots.txt for GPTBot, ClaudeBot, Google-Extended and PerplexityBot.",
        "Allow each one on the public site, unless we have agreed to block a specific crawler.",
      ],
    },
  },
  "meta-robots": {
    title: "Pages allowed in search and AI answers",
    problem: {
      fail: 'Some pages carry a "do not index" instruction in their code, so search engines and AI assistants are told to leave them out.',
      warn: "Some pages ask crawlers not to quote or keep a copy of them. They can still be found, but AI assistants may not use their text.",
    },
    why: "Pages can carry instructions for crawlers in their code. noindex removes a page from search results and AI answers. Others, such as nosnippet or noarchive, stop crawlers from quoting or keeping a copy. These are often left behind by a staging site, a template or a CMS setting.",
    good: 'Public pages carry no blocking instructions, or carry "index, follow".',
    owner: "either",
    asks: {
      fail: [
        "Remove noindex (or none) from the robots meta tag on public pages we want found.",
        "Check page templates and CMS SEO settings, where this is usually set.",
        "Keep noindex only on pages that should stay private, such as account or thank-you pages.",
      ],
      warn: [
        "Review nosnippet, noarchive and similar robots meta directives on public pages, and remove the ones we don't need.",
        "Check page templates and CMS SEO settings, where these are usually set.",
      ],
    },
  },
  "x-robots-tag": {
    title: "Server settings that allow indexing",
    problem: {
      fail: 'Your server sends a "do not index" instruction with some pages, so search engines and AI assistants are told to leave them out.',
      warn: "Your server tells crawlers not to quote or keep a copy of some pages. They can still be found, but AI assistants may not use their text.",
    },
    why: "This instruction is sent by the server rather than written in the page, so you can't see it by viewing the page. It works like the page-level version and is a common leftover from staging or preview environments.",
    good: "Public pages are served without blocking instructions.",
    owner: "developer",
    asks: {
      fail: [
        "Remove the noindex X-Robots-Tag response header from public pages.",
        "If some areas must stay private, limit the header to those paths only.",
        "Check the CDN, hosting platform and server config, where this header is usually added.",
      ],
      warn: [
        "Review restrictive X-Robots-Tag values (such as nosnippet or noarchive) on public pages, and remove the ones we don't need.",
        "Check the CDN, hosting platform and server config, where this header is usually added.",
      ],
    },
  },
  h1: {
    title: "A clear main heading on each page",
    problem: {
      fail: "Some pages have no main heading, so AI assistants have to guess what the page is about.",
      warn: "Some pages have more than one main heading, so the topic of the page is unclear.",
    },
    why: "The main heading is the title of the page's content. AI assistants treat it as the clearest signal of what the page covers. With none, they have to guess. With several, they can't tell which one is the topic.",
    good: "Every page has exactly one main heading that names its topic.",
    owner: "either",
    asks: {
      fail: [
        "Give every page exactly one main heading (an H1) that names its topic.",
        "Check the page templates, not just individual pages.",
      ],
      warn: [
        "Keep exactly one main heading (H1) per page, and turn the extras into subheadings (H2).",
        "Check the page templates, not just individual pages. Logos and banners are often marked up as an H1.",
      ],
    },
  },
  "heading-order": {
    title: "Headings in a logical order",
    problem: {
      fail: "Some pages have no headings at all, so AI assistants can't tell how the content is organized.",
      warn: "Some pages skip heading levels, which makes their structure harder for AI assistants to follow.",
    },
    why: "Headings work like a table of contents. AI assistants use them to see which parts of a page belong together and to pull out the right section when answering a question. Skipping levels, such as jumping from the main heading straight to a sub-subheading, blurs that outline.",
    good: "Each page has one main heading, then section headings, then subsections, in order.",
    owner: "either",
    asks: {
      fail: [
        "Use real heading tags (H1, H2, H3) for page and section titles, not bold or enlarged text.",
        "Keep heading levels in order: H1, then H2, then H3.",
      ],
      warn: [
        "Keep heading levels in order on each page (H1, then H2, then H3) without skipping a level.",
        "Choose heading levels for structure, and set size and style in CSS instead.",
      ],
    },
  },
  snr: {
    title: "Main content that stands out from the clutter",
    problem: {
      fail: "Most of the text on some pages is menus, footers and pop-ups, so AI assistants struggle to find the actual content.",
      warn: "On some pages, menus, footers and widgets crowd out the main content, which makes it harder for AI assistants to pick out.",
    },
    why: "When an AI assistant reads a page, it has to separate the content from everything around it. If repeated menus, cookie banners and widgets outweigh the content itself, the assistant may quote the wrong text or skip the page.",
    good: "Most of the text on each page is the content itself, clearly marked as the main section.",
    owner: "either",
    asks: {
      fail: [
        "Wrap the main content of each page in <main> and <article> elements.",
        "Trim repeated navigation, footer links and widget text around the content.",
        "Load non-essential widgets, such as chat and promotions, after the main content.",
      ],
      warn: [
        "Wrap the main content of each page in <main> and <article> elements.",
        "Trim repeated navigation, footer links and widget text around the content.",
      ],
    },
  },
  "ssr-content": {
    title: "Content that loads without JavaScript",
    problem: {
      fail: "Some pages show almost no text until JavaScript runs. Many AI crawlers don't run JavaScript, so to them the page looks empty.",
      warn: "Some pages show only a little text before JavaScript runs, so AI crawlers may see an incomplete page.",
    },
    why: "Browsers run JavaScript to build a page, but most AI crawlers only read the first version the server sends. If the content is added later by JavaScript, those crawlers see a blank or nearly blank page.",
    good: "The main text of every page is in the first response from the server.",
    owner: "developer",
    asks: {
      fail: [
        "Render the main content on the server (server-side rendering or static generation), so it is in the first HTML response.",
        "Test by loading the page with JavaScript turned off. The main text should still be there.",
      ],
    },
  },
  "json-ld": {
    title: "Labels that describe each page",
    problem: {
      fail: "Pages don't include structured data, so AI assistants have to guess what each page is, such as a product, an article or a business.",
      warn: "Pages include structured data, but it has errors, so AI assistants can't read it.",
    },
    why: "Structured data is a small block of labels in the page code. It says plainly what the page is and lists key facts, such as a product's price or an article's author. Search engines and AI assistants use it to understand and present your content accurately.",
    good: "Each page has a valid structured data block that describes its type and main details.",
    owner: "developer",
    asks: {
      fail: [
        "Add a JSON-LD structured data block to each page template, with @context and @type set.",
        "Validate it with Google's Rich Results Test or the Schema.org validator.",
      ],
      warn: [
        "Fix the JSON-LD blocks that don't parse. A stray comma or an unescaped quote is the usual cause.",
        "Validate them with Google's Rich Results Test or the Schema.org validator.",
      ],
    },
  },
  "schema-types": {
    title: "The right labels for your type of site",
    problem: {
      fail: "Pages have no structured data for your type of site ({profile}), so AI assistants may misread what you offer.",
      warn: "Pages have structured data, but not the kinds expected for your type of site ({profile}), so AI assistants may misread what you offer.",
    },
    why: "Structured data comes in types, such as Product for a shop or Article for a blog. Using the types that fit your site helps AI assistants describe you correctly and show the right details.",
    good: "Pages use the types expected for your type of site, such as {schema}.",
    owner: "developer",
    asks: {
      fail: [
        "Add {schemaFirst} structured data (or another type that fits: {schema}) to the relevant page templates.",
        "Fill in the key fields for that type, such as name and description.",
      ],
    },
  },
  openapi: {
    title: "A machine-readable description of your API",
    problem: {
      warn: "Your site doesn't publish a description of its API, so AI agents can't learn how to use it.",
    },
    why: "If your product has an API, an OpenAPI file describes what it can do and how to call it. AI agents and developer tools read this file to use your API correctly. If you don't offer an API, you can ignore this item.",
    good: "An OpenAPI file at /openapi.json, or linked from your developer docs.",
    owner: "developer",
    asks: {
      warn: [
        "If we offer a public API, publish its OpenAPI description at {origin}/openapi.json.",
        "Generate it from the API code so it stays current.",
      ],
    },
  },
  "well-known": {
    title: "Standard contact and policy files",
    problem: {
      warn: "Your site doesn't publish the standard files that tell automated tools how to contact you or what you allow.",
    },
    why: "Sites can publish small standard files in a folder called /.well-known/. The most common is security.txt, which says who to contact about security issues. Automated tools and AI agents check this folder for policies like these.",
    good: "At least a security.txt file at /.well-known/security.txt.",
    owner: "developer",
    asks: {
      warn: [
        "Publish {origin}/.well-known/security.txt with a security contact and an expiry date.",
        "Add any other .well-known files that apply to us.",
      ],
    },
  },
};

function crawlerFor(id: string) {
  if (!id.startsWith("bot-")) return undefined;
  return AI_CRAWLERS.find((crawler) => `bot-${crawler.id}` === id);
}

/** Catalog entry for a check id, with the crawler template expanded for `bot-*` ids. */
export function plainCatalogEntry(id: string): PlainCheckCopy | undefined {
  if (crawlerFor(id)) return CRAWLER_COPY;
  return PLAIN_CHECK_COPY[id];
}

function fill(template: string, tokens: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => tokens[key] ?? match);
}

function listOf(values: readonly string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} or ${values[1]}`;
  return `${values.slice(0, -1).join(", ")} or ${values[values.length - 1]}`;
}

function isActionable(status: CheckStatus): status is ActionableStatus {
  return status === "warn" || status === "fail";
}

/** Plain copy for one check result, with every token filled in. */
export function plainCopyFor(
  check: { id: string; label: string; status: CheckStatus; recommendation?: string },
  context: PlainCopyContext,
): ResolvedPlainCopy {
  const entry = plainCatalogEntry(check.id);
  const actionable = isActionable(check.status);

  if (!entry) {
    return {
      title: check.label,
      problem: actionable ? (check.recommendation ?? "This check needs attention.") : "",
      why: "",
      good: "",
      owner: "developer",
      asks: actionable && check.recommendation ? [check.recommendation] : [],
      known: false,
    };
  }

  const crawler = crawlerFor(check.id);
  const tokens: Record<string, string> = {
    origin: context.origin,
    profile: context.profile,
    schema: listOf(context.schema),
    schemaFirst: context.schema[0] ?? "a fitting",
    crawler: crawler?.label ?? "",
    vendor: crawler?.vendor ?? "",
    assistant: crawler ? (CRAWLER_ASSISTANTS[crawler.id] ?? crawler.vendor) : "",
  };

  const status = isActionable(check.status) ? check.status : null;
  const problem = status
    ? (entry.problem[status] ?? entry.problem.fail ?? entry.problem.warn ?? "")
    : "";
  const asks = status ? (entry.asks[status] ?? entry.asks.fail ?? entry.asks.warn ?? []) : [];

  return {
    title: fill(entry.title, tokens),
    problem: fill(problem, tokens),
    why: fill(entry.why, tokens),
    good: fill(entry.good, tokens),
    owner: entry.owner,
    asks: asks.map((ask) => fill(ask, tokens)),
    known: true,
  };
}
