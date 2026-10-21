import { describe, expect, it } from "vitest";

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { AI_CRAWLERS } from "@/lib/robots";
import { siteUrl } from "@/lib/site";

function robotRules() {
  const data = robots();
  return Array.isArray(data.rules) ? data.rules : [data.rules];
}

function userAgents(): string[] {
  return robotRules()
    .flatMap((rule) => {
      const value = rule.userAgent;
      if (Array.isArray(value)) return value;
      return value ? [value] : [];
    })
    .map((agent) => agent.toLowerCase());
}

describe("discovery metadata routes", () => {
  it("keeps a wildcard default group", () => {
    expect(userAgents()).toContain("*");
  });

  it("names every audited AI crawler explicitly", () => {
    const agents = userAgents();
    for (const crawler of AI_CRAWLERS) {
      expect(agents).toContain(crawler.label.toLowerCase());
    }
  });

  it("points robots.txt at the canonical sitemap", () => {
    expect(robots().sitemap).toBe(`${siteUrl}/sitemap.xml`);
  });

  it("lists the public pages in the sitemap", () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toEqual([`${siteUrl}/`, `${siteUrl}/app`]);
  });
});
