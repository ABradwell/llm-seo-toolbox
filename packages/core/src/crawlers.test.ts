import { describe, expect, it } from "vitest";

import { AI_CRAWLERS, crawlerById, crawlersByIntent } from "./crawlers";

describe("AI_CRAWLERS", () => {
  it("ships the 16-crawler roster", () => {
    expect(AI_CRAWLERS).toHaveLength(16);
  });

  it("keeps ids and labels unique", () => {
    const ids = new Set(AI_CRAWLERS.map((crawler) => crawler.id));
    const labels = new Set(AI_CRAWLERS.map((crawler) => crawler.label));

    expect(ids.size).toBe(AI_CRAWLERS.length);
    expect(labels.size).toBe(AI_CRAWLERS.length);
  });

  it("gives every crawler a vendor, intent and note", () => {
    for (const crawler of AI_CRAWLERS) {
      expect(crawler.vendor.trim()).not.toBe("");
      expect(crawler.note.trim()).not.toBe("");
      expect(["search", "fetch", "training"]).toContain(crawler.intent);
    }
  });
});

describe("crawlersByIntent", () => {
  it("groups the roster into search, fetch and training", () => {
    const search = crawlersByIntent("search");
    const fetch = crawlersByIntent("fetch");
    const training = crawlersByIntent("training");

    expect(search.length + fetch.length + training.length).toBe(AI_CRAWLERS.length);
    expect(search.map((crawler) => crawler.label)).toContain("OAI-SearchBot");
    expect(fetch.map((crawler) => crawler.label)).toContain("ChatGPT-User");
    expect(training.map((crawler) => crawler.label)).toContain("GPTBot");
  });

  it("keeps the intent definitions stable", () => {
    expect(crawlersByIntent("fetch").map((crawler) => crawler.label)).toEqual([
      "ChatGPT-User",
      "Claude-User",
      "Perplexity-User",
    ]);
    expect(crawlersByIntent("training").map((crawler) => crawler.label)).toEqual([
      "GPTBot",
      "ClaudeBot",
      "Google-Extended",
      "Applebot-Extended",
      "Meta-ExternalAgent",
      "CCBot",
      "Bytespider",
    ]);
  });
});

describe("crawlerById", () => {
  it("finds a crawler by its stable id", () => {
    expect(crawlerById("gptbot")?.label).toBe("GPTBot");
    expect(crawlerById("claude-searchbot")?.intent).toBe("search");
  });

  it("returns undefined for an unknown id", () => {
    expect(crawlerById("not-a-crawler")).toBeUndefined();
  });
});
