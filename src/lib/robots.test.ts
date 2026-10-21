import { describe, expect, it } from "vitest";

import { crawlerAccess, evaluatePath, parseRobots, selectGroups } from "./robots";

const ROBOTS = `
# sample policy
User-agent: *
Disallow: /admin
Allow: /

User-agent: GPTBot
Disallow: /

User-agent: ClaudeBot
Disallow: /private
Allow: /private/public

Sitemap: https://example.com/sitemap.xml
Crawl-delay: 2
`;

describe("parseRobots", () => {
  it("parses groups, rules, sitemaps and crawl delay", () => {
    const data = parseRobots(ROBOTS);

    expect(data.exists).toBe(true);
    expect(data.groups).toHaveLength(3);
    expect(data.sitemaps).toEqual(["https://example.com/sitemap.xml"]);
    expect(data.crawlDelay).toBe(2);
    expect(data.groups[0].agents).toEqual(["*"]);
    expect(data.groups[1].agents).toEqual(["gptbot"]);
  });

  it("handles empty and malformed input", () => {
    const data = parseRobots("\n\n# nothing here\nnot a directive\n");
    expect(data.groups).toHaveLength(0);
    expect(data.sitemaps).toHaveLength(0);
  });
});

describe("evaluatePath", () => {
  const data = parseRobots(ROBOTS);

  it("uses the longest matching rule and lets allow win ties", () => {
    const claudeGroups = selectGroups(data, "ClaudeBot");
    expect(evaluatePath(claudeGroups, "/private/secret").allowed).toBe(false);
    expect(evaluatePath(claudeGroups, "/private/public/page").allowed).toBe(true);
  });

  it("understands wildcard and end-anchor syntax", () => {
    const wildcard = parseRobots(
      ["User-agent: *", "Disallow: /*.pdf$", "Disallow: /tmp/*/cache"].join("\n"),
    );
    const groups = selectGroups(wildcard, "AnyBot");
    expect(evaluatePath(groups, "/docs/report.pdf").allowed).toBe(false);
    expect(evaluatePath(groups, "/docs/report.pdf.html").allowed).toBe(true);
    expect(evaluatePath(groups, "/tmp/a/cache").allowed).toBe(false);
  });
});

describe("crawlerAccess", () => {
  const data = parseRobots(ROBOTS);

  it("fails a crawler explicitly blocked at the root", () => {
    const access = crawlerAccess(data, "GPTBot");
    expect(access.status).toBe("fail");
    expect(access.scope).toBe("specific");
  });

  it("passes a crawler allowed by the wildcard group", () => {
    const access = crawlerAccess(data, "PerplexityBot");
    expect(access.status).toBe("pass");
    expect(access.scope).toBe("wildcard");
  });

  it("fails crawlers when the wildcard group blocks the root", () => {
    const locked = parseRobots(["User-agent: *", "Disallow: /"].join("\n"));
    expect(crawlerAccess(locked, "ClaudeBot").status).toBe("fail");
  });

  it("treats a missing robots.txt as allowed", () => {
    const missing = parseRobots("");
    expect(crawlerAccess(missing, "GPTBot").status).toBe("pass");
  });
});
