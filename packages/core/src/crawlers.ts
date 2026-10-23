import type { AiCrawler } from "./types";

/**
 * The crawler roster carries the intent behind each user agent. Everything
 * that needs the list (robots checks, the landing strip, the plain-language
 * catalog) reads it from here so the three surfaces cannot drift apart.
 */
export const AI_CRAWLERS: readonly AiCrawler[] = [
  {
    id: "gptbot",
    label: "GPTBot",
    vendor: "OpenAI",
    intent: "training",
    note: "Trains and refreshes OpenAI models.",
  },
  {
    id: "oai-searchbot",
    label: "OAI-SearchBot",
    vendor: "OpenAI",
    intent: "search",
    note: "Finds and cites pages for ChatGPT search.",
  },
  {
    id: "chatgpt-user",
    label: "ChatGPT-User",
    vendor: "OpenAI",
    intent: "fetch",
    note: "Fetches a page when a person asks ChatGPT to open it.",
  },
  {
    id: "claudebot",
    label: "ClaudeBot",
    vendor: "Anthropic",
    intent: "training",
    note: "Collects content for Claude.",
  },
  {
    id: "claude-searchbot",
    label: "Claude-SearchBot",
    vendor: "Anthropic",
    intent: "search",
    note: "Finds and cites pages for Claude search.",
  },
  {
    id: "claude-user",
    label: "Claude-User",
    vendor: "Anthropic",
    intent: "fetch",
    note: "Fetches a page when a person asks Claude to open it.",
  },
  {
    id: "google-extended",
    label: "Google-Extended",
    vendor: "Google",
    intent: "training",
    note: "Controls Gemini and Vertex AI grounding and training.",
  },
  {
    id: "googlebot",
    label: "Googlebot",
    vendor: "Google",
    intent: "search",
    note: "The retrieval layer behind Google Search and Gemini grounding.",
  },
  {
    id: "bingbot",
    label: "Bingbot",
    vendor: "Microsoft",
    intent: "search",
    note: "The retrieval layer behind Bing, Copilot and ChatGPT search.",
  },
  {
    id: "perplexitybot",
    label: "PerplexityBot",
    vendor: "Perplexity",
    intent: "search",
    note: "Powers Perplexity answers and citations.",
  },
  {
    id: "perplexity-user",
    label: "Perplexity-User",
    vendor: "Perplexity",
    intent: "fetch",
    note: "Fetches a page when a Perplexity user asks for it.",
  },
  {
    id: "applebot-extended",
    label: "Applebot-Extended",
    vendor: "Apple",
    intent: "training",
    note: "Controls Apple Intelligence training and grounding.",
  },
  {
    id: "meta-externalagent",
    label: "Meta-ExternalAgent",
    vendor: "Meta",
    intent: "training",
    note: "Collects content for Meta AI.",
  },
  {
    id: "amazonbot",
    label: "Amazonbot",
    vendor: "Amazon",
    intent: "search",
    note: "Feeds Amazon search and Alexa answers.",
  },
  {
    id: "ccbot",
    label: "CCBot",
    vendor: "Common Crawl",
    intent: "training",
    note: "Builds the Common Crawl corpus used to train many models.",
  },
  {
    id: "bytespider",
    label: "Bytespider",
    vendor: "ByteDance",
    intent: "training",
    note: "Feeds ByteDance and TikTok AI surfaces.",
  },
];

export function crawlersByIntent(intent: AiCrawler["intent"]): AiCrawler[] {
  return AI_CRAWLERS.filter((crawler) => crawler.intent === intent);
}

export function crawlerById(id: string): AiCrawler | undefined {
  return AI_CRAWLERS.find((crawler) => crawler.id === id);
}
