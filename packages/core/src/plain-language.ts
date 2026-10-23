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
  "feed",
  "markdown-mirror",
  "robots-reachable",
  "ai-policy",
  "access-search",
  "access-fetch",
  "access-training",
  "agent-fetch",
  "content-signal",
  "entity-identity",
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
  "faq-content",
  "answer-first",
  "section-chunks",
  "page-metadata",
  "image-alt",
  "citable-evidence",
  "json-ld",
  "schema-types",
  "schema-depth",
  "breadcrumbs",
  "freshness",
  "canonical",
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
  "oai-searchbot": "ChatGPT search",
  "chatgpt-user": "ChatGPT",
  claudebot: "Claude",
  "claude-searchbot": "Claude search",
  "claude-user": "Claude",
  "google-extended": "Gemini",
  googlebot: "Google Search and Gemini",
  bingbot: "Bing and Copilot",
  perplexitybot: "Perplexity",
  "perplexity-user": "Perplexity",
  "applebot-extended": "Apple Intelligence",
  "meta-externalagent": "Meta AI",
  amazonbot: "Amazon search and Alexa",
  ccbot: "Common Crawl and the models trained on it",
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
    why: "Sites can publish small standard files in a folder called /.well-known/. An API catalog describes where your API documentation lives, and security.txt says who to contact about security issues. Automated tools and AI agents check this folder for policies like these.",
    good: "An API catalog at /.well-known/api-catalog, plus a security.txt contact file.",
    owner: "developer",
    asks: {
      warn: [
        "Publish {origin}/.well-known/api-catalog so agents can find the API description.",
        "Publish {origin}/.well-known/security.txt with a security contact and an expiry date.",
      ],
    },
  },
  feed: {
    title: "A news feed other tools can follow",
    problem: {
      fail: "Your site has no news feed, so tools that follow new content have nothing to subscribe to.",
      warn: "Your site links to a news feed, but the feed could not be read or is empty.",
    },
    why: "A feed is a simple list of your newest pages. News readers, search engines and AI tools use it to notice new work without checking every page. It costs little to publish and keeps discovery automatic.",
    good: "An RSS or Atom feed at a stable address, linked from the homepage.",
    owner: "developer",
    asks: {
      fail: [
        "Publish an RSS or Atom feed at {origin}/feed.xml.",
        "Link it from every page with a feed link in the page head.",
      ],
      warn: [
        "Make sure {origin}/feed.xml loads as a feed, not a web page or an error page.",
        "Check that it contains at least one recent item.",
      ],
    },
  },
  "markdown-mirror": {
    title: "A plain-text version of your pages",
    problem: {
      fail: "Your site doesn't offer a plain-text version of its pages, so AI tools have to strip the design away themselves.",
      warn: "A plain-text version was found, but it doesn't match the page, so an AI tool could quote the wrong content.",
    },
    why: "A plain-text version of a page removes menus, styling and scripts, leaving only the words. AI tools can read it faster and with fewer mistakes. Documentation and product sites benefit most.",
    good: "The page returns a matching plain-text version when an AI tool asks for one.",
    owner: "developer",
    asks: {
      fail: [
        "Serve a plain-text version of each page when a request asks for text instead of a web page.",
        "Alternatively, publish a matching .md file beside each page and link to it.",
      ],
      warn: [
        "Make the plain-text version start with the same heading as the page.",
        "Keep it in sync when the page changes.",
      ],
    },
  },
  "access-search": {
    title: "AI search and citation crawlers let in",
    problem: {
      fail: "Your crawler rules block one or more AI search crawlers on pages you want cited, so those assistants cannot quote them.",
      warn: "Some AI search crawlers can reach the homepage but not every page you want cited.",
    },
    why: "Search and citation crawlers find pages for AI answers and link back to the source. If they are blocked on the pages that matter, those pages cannot appear in the answer.",
    good: "Every AI search and citation crawler is allowed on the public pages you want quoted.",
    owner: "developer",
    asks: {
      fail: [
        "Allow OAI-SearchBot, Claude-SearchBot, PerplexityBot, Googlebot and Bingbot on the public pages we want cited.",
        "Check firewall rules as well as robots.txt, because a firewall can block them before the rules file is read.",
      ],
      warn: ["Review the paths blocked for AI search crawlers and allow the public content pages."],
    },
  },
  "access-fetch": {
    title: "On-demand AI fetch agents let in",
    problem: {
      fail: "Your crawler rules block the agents that open a page when a person asks an AI assistant to read it.",
      warn: "Some on-demand fetch agents are blocked on pages people may ask an assistant to open.",
    },
    why: "Fetch agents visit a page only when someone asks an assistant about it. Blocking them means the assistant cannot read the page in that moment, even if search crawlers can index it.",
    good: "ChatGPT-User, Claude-User and Perplexity-User can open the public pages people share with them.",
    owner: "developer",
    asks: {
      fail: [
        "Allow ChatGPT-User, Claude-User and Perplexity-User on public pages.",
        "Check the firewall as well as robots.txt.",
      ],
      warn: ["Review which public paths are blocked for on-demand fetch agents."],
    },
  },
  "access-training": {
    title: "A written decision about AI training",
    problem: {
      fail: "Your site does not say whether AI companies may use its content for training.",
      warn: "Some AI training crawlers follow a general rule rather than a named one, so your choice is not written down.",
    },
    why: "Training crawlers collect content for future models. Allowing or blocking them is a business decision, and both are valid. Naming them makes the decision visible and easy to review later.",
    good: "Each AI training crawler is named in the crawler rules and allowed or blocked on purpose.",
    owner: "either",
    asks: {
      warn: [
        "Add named entries for GPTBot, ClaudeBot, Google-Extended, Applebot-Extended, Meta-ExternalAgent, CCBot and Bytespider.",
        "For each one, state whether we allow or block training, and keep the choice consistent with our policy.",
      ],
    },
  },
  "agent-fetch": {
    title: "Your firewall lets AI agents in",
    problem: {
      fail: "Your firewall turns AI agents away before they can read your crawler rules, so they never see the page.",
      warn: "Your firewall blocks training crawlers but lets search agents through. That may be intentional, but it should be checked.",
    },
    why: "A firewall or bot-protection service can block a request before robots.txt matters. If it challenges AI agents, your rules file never gets a chance to allow them. This check compares a normal request with requests from AI agents.",
    good: "AI search and fetch agents receive the same page as a normal visitor.",
    owner: "developer",
    asks: {
      fail: [
        "Allow the AI search and fetch agents through the firewall, not only in robots.txt.",
        "In Cloudflare, check the AI bots setting. In Akamai, check Bot Manager. In a custom firewall, allow the named agents.",
      ],
      warn: [
        "Confirm that blocking training crawlers at the firewall is intentional.",
        "Make sure search and fetch agents still get the full page.",
      ],
    },
  },
  "content-signal": {
    title: "A clear AI usage preference",
    problem: {
      fail: "Your crawler rules do not state a preference for search, AI input or AI training.",
      warn: "Your stated AI usage preference conflicts with the crawler rules, so tools may follow the wrong one.",
    },
    why: "A content signal is an optional line in robots.txt that states whether content may be used for search, AI answers or training. It makes the policy readable in one place and avoids contradictions with individual crawler rules.",
    good: "A content signal that agrees with the named crawler rules.",
    owner: "developer",
    asks: {
      warn: [
        "Make the content signal agree with the crawler rules in robots.txt.",
        "For example, if search crawlers are allowed, do not set search to no.",
      ],
    },
  },
  "entity-identity": {
    title: "A clear identity for your organization or you",
    problem: {
      fail: "Your site does not describe who is behind it in a way AI tools can read, so answers about you may not point back here.",
      warn: "Your site describes who is behind it, but some details or links to other profiles are missing.",
    },
    why: "When a site names its organization or author and links to the same identity on other sites, AI tools can connect the facts. That makes answers about you more accurate and more likely to cite this site.",
    good: "An organization or person description with a name, address, summary and links to at least two other authoritative profiles.",
    owner: "either",
    asks: {
      fail: [
        "Add an organization or person description to the homepage or About page.",
        "Include the name, website address, a one-sentence description and links to profiles such as LinkedIn, Wikidata, GitHub or Crunchbase.",
      ],
      warn: [
        "Complete the identity description with any missing name, address, summary or profile links.",
        "Use at least two links to other sites that describe the same organization or person.",
      ],
    },
  },
  "faq-content": {
    title: "Questions and answers on the page",
    problem: {
      fail: "The pages people ask about most have no question-and-answer content, so AI tools have no short answers to quote.",
      warn: "Some question-and-answer content was found, but there is not enough of it to quote reliably.",
    },
    why: "Models answer questions by quoting a short answer under a question. A page with three clear questions and one-paragraph answers gives a model something direct to use, instead of making it infer an answer from marketing copy.",
    good: "Three or more real questions, each followed by a one-paragraph answer in the page text.",
    owner: "content",
    asks: {
      fail: [
        "Add a short FAQ to the pages people ask about most, with at least three questions.",
        "Write a direct one-paragraph answer under each question.",
        "Keep the answers visible on the page, not hidden in a script or a collapsed widget.",
      ],
      warn: [
        "Add a few more questions to the existing FAQ, aiming for at least three.",
        "Make sure each answer is a full paragraph and appears in the page text.",
      ],
    },
  },
  "answer-first": {
    title: "A short answer under the main heading",
    problem: {
      fail: "Pages jump straight into sections without a summary, so an AI tool has to piece the answer together.",
      warn: "The opening paragraph is too short or too long to quote cleanly.",
    },
    why: "A summary paragraph directly under the main heading tells a reader, and an AI tool, what the page answers before the detail starts. It is the paragraph most likely to be quoted in an answer.",
    good: "A 40 to 160 word summary under the main heading, before the first section.",
    owner: "content",
    asks: {
      fail: [
        "Add one plain-language paragraph of 40 to 160 words directly under the main heading.",
        "Make it answer the main question of the page, not describe the page.",
      ],
      warn: [
        "Edit the opening paragraph to 40 to 160 words.",
        "Keep it directly under the main heading and before the first section heading.",
      ],
    },
  },
  "section-chunks": {
    title: "Content split into readable sections",
    problem: {
      fail: "A long page has no section headings, so an AI tool cannot split it into quotable pieces.",
      warn: "Some sections are much longer or shorter than a comfortable reading chunk.",
    },
    why: "AI tools quote a section at a time. When a page is split under descriptive headings, the right passage is easier to find and quote. Very long sections bury the answer, and very short ones lose context.",
    good: "Long pages are split under headings, with most sections between 80 and 500 words.",
    owner: "content",
    asks: {
      fail: [
        "Split the long page under descriptive section headings.",
        "Aim for sections of 80 to 500 words, each covering one idea.",
      ],
      warn: [
        "Review the longest sections and split any that run past about 500 words.",
        "Group very short sections under a clearer heading so they keep their context.",
      ],
    },
  },
  "page-metadata": {
    title: "A clear page title and summary",
    problem: {
      fail: "Some pages are missing a title or a summary, so AI tools have little to describe them with.",
      warn: "Some page titles or summaries are missing, too short, too long or repeat the site name.",
    },
    why: "The page title and summary are the first description an AI tool sees. A specific title and a sentence-long summary help it tell pages apart and choose the right one for an answer.",
    good: "Every page has a unique title of 15 to 70 characters, a summary of 50 to 160 characters and a language set.",
    owner: "content",
    asks: {
      fail: [
        "Give every page a unique title and a one-sentence summary.",
        "Set the page language in the page code.",
      ],
      warn: [
        "Bring page titles to 15 to 70 characters and summaries to 50 to 160 characters.",
        "Make each title specific to the page instead of repeating the site name.",
      ],
    },
  },
  "image-alt": {
    title: "Descriptions for images",
    problem: {
      fail: "Many content images have no description, so AI tools cannot tell what they show.",
      warn: "Some content images have no useful description.",
    },
    why: "AI tools cannot see images the way people do. A short description tells them what an image shows and lets them use it accurately. Decorative images can be left undescribed on purpose.",
    good: "At least nine in ten content images have a short, specific description.",
    owner: "content",
    asks: {
      fail: [
        "Add a short description to every meaningful image, saying what it shows rather than its file name.",
        "Mark purely decorative images so they are skipped.",
      ],
      warn: ["Review the images without descriptions and add one where the image carries meaning."],
    },
  },
  "citable-evidence": {
    title: "Numbers and sources that make claims quotable",
    problem: {
      fail: "The page makes few concrete claims or links to no sources, so an AI tool has little to cite.",
      warn: "The page has some evidence, but not enough numbers or sources to stand out as quotable.",
    },
    why: "Answers that include a specific number or a source are easier to trust and easier to attribute. Pages with concrete figures and outbound references are more likely to be chosen as the source.",
    good: "At least two concrete figures per 500 words and at least one link to an outside source.",
    owner: "content",
    asks: {
      warn: [
        "Add specific numbers, dates or measurements to the main claims.",
        "Link to the source behind each important figure.",
      ],
    },
  },
  "schema-depth": {
    title: "Complete details in your page labels",
    problem: {
      fail: "The labels that describe the page are missing most of the details AI tools need.",
      warn: "The labels that describe the page are missing some key details.",
    },
    why: "A label such as Article or Product has expected fields, such as an author or a price. When those fields are missing, an AI tool has to guess or leave the detail out of its answer.",
    good: "The main label for each page includes every expected field.",
    owner: "developer",
    asks: {
      warn: [
        "Fill in the missing fields on the main page label, such as author, date, price or address.",
        "Keep the values in step with the visible page content.",
      ],
    },
  },
  breadcrumbs: {
    title: "A trail showing where a page sits",
    problem: {
      fail: "Deep pages do not show where they sit in the site, so AI tools cannot place them in context.",
      warn: "The page trail does not end at the current page, so it may point readers to the wrong place.",
    },
    why: "A breadcrumb trail shows the path from the homepage to the current page. AI tools use it to understand hierarchy and to describe a page as part of a larger section.",
    good: "Deep pages include a trail whose last step is the page itself.",
    owner: "developer",
    asks: {
      warn: [
        "Add a breadcrumb trail to pages that sit two or more levels deep.",
        "Make the last step point at the current page address.",
      ],
    },
  },
  freshness: {
    title: "A visible last-updated date",
    problem: {
      fail: "Pages have no machine-readable date, so AI tools cannot tell whether the content is current.",
      warn: "The last-updated date is missing, old or out of step with the sitemap.",
    },
    why: "AI tools prefer current sources. A machine-readable date on the page, kept close to the sitemap date, tells them the content is maintained and worth quoting.",
    good: "Every page carries a recent last-updated date, and the sitemap agrees with it.",
    owner: "developer",
    asks: {
      fail: [
        "Add a last-updated date to each page in the page code.",
        "Update it when the content changes.",
      ],
      warn: [
        "Refresh the last-updated date when the page changes.",
        "Keep the page date and the sitemap date within a week of each other.",
      ],
    },
  },
  canonical: {
    title: "One authoritative address per page",
    problem: {
      fail: "Some pages point at an address outside your site as the official version.",
      warn: "Some pages do not say which address is the official one, or use a relative address.",
    },
    why: "The same page can often be reached at several addresses. Naming one official address prevents AI tools from splitting the page into duplicates or citing the wrong link.",
    good: "Every page names one absolute address on your own site as the official version.",
    owner: "developer",
    asks: {
      warn: [
        "Add an official address to each page using an absolute link on our own domain.",
        "Point it at the page itself, not at a different page.",
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
