import { describe, expect, it } from "vitest";

import {
  crawlerAccess,
  crawlerAccessOnPaths,
  evaluatePath,
  hasExplicitAiPolicy,
  parseRobots,
  selectGroups,
} from "./robots";

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

  it("records 1-based source lines for groups, rules and sitemaps", () => {
    const data = parseRobots(ROBOTS);

    expect(data.groups[0].line).toBe(3);
    expect(data.groups[0].rules.map((rule) => rule.line)).toEqual([4, 5]);
    expect(data.groups[1].line).toBe(7);
    expect(data.groups[2].line).toBe(10);
    expect(data.groups[2].rules.map((rule) => rule.line)).toEqual([11, 12]);
    expect(data.sitemapLines).toEqual([14]);
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

  it("returns the matching rule line for blocked and allowed crawlers", () => {
    const data = parseRobots(ROBOTS);

    expect(crawlerAccess(data, "GPTBot").line).toBe(8);
    expect(crawlerAccess(data, "PerplexityBot").line).toBe(5);
    expect(crawlerAccess(data, "ClaudeBot").line).toBe(10);
  });

  it("marks crawler access as explicit only when the crawler is named", () => {
    const data = parseRobots(ROBOTS);

    expect(crawlerAccess(data, "ClaudeBot").explicit).toBe(true);
    expect(crawlerAccess(data, "PerplexityBot").explicit).toBe(false);
  });
});

describe("hasExplicitAiPolicy", () => {
  it("detects a named AI crawler group", () => {
    expect(hasExplicitAiPolicy(parseRobots(ROBOTS))).toBe(true);
  });

  it("is false for wildcard-only policies and missing robots.txt", () => {
    expect(hasExplicitAiPolicy(parseRobots("User-agent: *\nDisallow: /admin\n"))).toBe(false);
    expect(hasExplicitAiPolicy(parseRobots(""))).toBe(false);
  });
});

describe("Content-Signal", () => {
  it("parses search, ai-input and ai-train purposes", () => {
    const data = parseRobots(
      ["User-agent: *", "Content-Signal: search=yes, ai-input=yes, ai-train=no"].join("\n"),
    );

    expect(data.contentSignals).toEqual([
      { line: 2, search: "yes", aiInput: "yes", aiTrain: "no" },
    ]);
  });

  it("accepts semicolon separators and mixed case", () => {
    const data = parseRobots(
      ["User-agent: *", "content-signal: Search=YES; AI-Train=NO"].join("\n"),
    );

    expect(data.contentSignals[0]).toMatchObject({ search: "yes", aiTrain: "no" });
    expect(data.contentSignals[0].aiInput).toBeNull();
  });

  it("keeps multiple Content-Signal lines", () => {
    const data = parseRobots(
      ["User-agent: *", "Content-Signal: search=yes", "Content-Signal: ai-train=no"].join("\n"),
    );

    expect(data.contentSignals).toHaveLength(2);
    expect(data.contentSignals[1].aiTrain).toBe("no");
  });

  it("ignores a malformed Content-Signal line", () => {
    const data = parseRobots("User-agent: *\nContent-Signal:\n");

    expect(data.contentSignals).toEqual([]);
  });
});

describe("crawlerAccessOnPaths", () => {
  const data = parseRobots(
    ["User-agent: *", "Allow: /", "Disallow: /docs/", "", "User-agent: GPTBot", "Allow: /"].join(
      "\n",
    ),
  );

  it("fails a crawler when any sampled path is blocked", () => {
    const verdict = crawlerAccessOnPaths(data, "PerplexityBot", ["/", "/docs/start", "/blog/post"]);

    expect(verdict.status).toBe("fail");
    expect(verdict.blockedPaths).toEqual(["/docs/start"]);
    expect(verdict.allowedCount).toBe(2);
    expect(verdict.summary).toBe("Blocked · 1/3 paths");
    expect(verdict.line).toBe(3);
  });

  it("passes when every sampled path is allowed", () => {
    const verdict = crawlerAccessOnPaths(data, "GPTBot", ["/", "/docs/start"]);

    expect(verdict.status).toBe("pass");
    expect(verdict.blockedPaths).toEqual([]);
    expect(verdict.allowedCount).toBe(2);
    expect(verdict.summary).toContain("2/2 sampled paths");
  });

  it("deduplicates paths and defaults to the root", () => {
    expect(
      crawlerAccessOnPaths(data, "GPTBot", ["/", "/", "/blog"]).paths.map((entry) => entry.path),
    ).toEqual(["/", "/blog"]);
    expect(crawlerAccessOnPaths(data, "GPTBot", []).paths).toEqual([
      { path: "/", allowed: true, line: 6 },
    ]);
  });

  it("treats a missing robots.txt as allowed", () => {
    const verdict = crawlerAccessOnPaths(parseRobots(""), "ClaudeBot", ["/", "/docs/start"]);

    expect(verdict.status).toBe("pass");
    expect(verdict.allowedCount).toBe(2);
    expect(verdict.detail).toContain("all 2 sampled paths are allowed");
  });
});
