import { describe, expect, it } from "vitest";

import { compareAgentFetch, crawlerUserAgent, detectChallenge } from "./agent-fetch";
import type { FetchTextOutcome } from "./fetch-page";

function outcome(overrides: Partial<FetchTextOutcome> = {}): FetchTextOutcome {
  return {
    ok: true,
    status: 200,
    finalUrl: "https://example.com/",
    contentType: "text/html",
    headers: {},
    bytes: 10_000,
    body: "<html>Hello</html>",
    truncated: false,
    error: null,
    unsafe: false,
    ...overrides,
  };
}

describe("detectChallenge", () => {
  it("detects Cloudflare challenges from headers and body", () => {
    expect(detectChallenge({ "cf-mitigated": "challenge" }, "")).toBe("cloudflare");
    expect(detectChallenge({}, '<div id="cf-chl-widget"></div>')).toBe("cloudflare");
    expect(detectChallenge({}, "see /cdn-cgi/challenge-platform/h/b")).toBe("cloudflare");
  });

  it("detects Akamai challenges", () => {
    expect(detectChallenge({ "set-cookie": "_abck=abc" }, "")).toBe("akamai");
    expect(detectChallenge({}, "Akamai Bot Manager says access denied")).toBe("akamai");
  });

  it("detects generic bot walls", () => {
    expect(detectChallenge({}, "Please verify you are human")).toBe("generic");
    expect(detectChallenge({}, "Checking your browser before accessing")).toBe("generic");
    expect(detectChallenge({}, "Complete the CAPTCHA to continue")).toBe("generic");
  });

  it("returns null for a normal page", () => {
    expect(detectChallenge({}, "<html><p>Documentation</p></html>")).toBeNull();
  });

  it("only scans the first 8 KB of the body", () => {
    const body = `${"x".repeat(9_000)}verify you are human`;
    expect(detectChallenge({}, body)).toBeNull();
  });
});

describe("compareAgentFetch", () => {
  it("passes when the agent gets the same response", () => {
    const result = compareAgentFetch({
      userAgent: "GPTBot",
      baseline: outcome(),
      response: outcome(),
    });

    expect(result.blocked).toBe(false);
    expect(result.challenge).toBeNull();
    expect(result.status).toBe(200);
    expect(result.bytes).toBe(10_000);
    expect(result.detail).toContain("GPTBot returned HTTP 200");
    expect(result.detail).toContain("against the default HTTP 200");
  });

  it("blocks on a different status", () => {
    const result = compareAgentFetch({
      userAgent: "ClaudeBot",
      baseline: outcome(),
      response: outcome({ status: 403 }),
    });

    expect(result.blocked).toBe(true);
    expect(result.detail).toContain("the status differs from the default fetch");
  });

  it("blocks when the body shrinks below 20% of the baseline", () => {
    const result = compareAgentFetch({
      userAgent: "PerplexityBot",
      baseline: outcome({ bytes: 10_000 }),
      response: outcome({ bytes: 1_999 }),
    });

    expect(result.blocked).toBe(true);
    expect(result.detail).toContain("under 20% of the default size");
  });

  it("does not block a smaller but substantial body", () => {
    const result = compareAgentFetch({
      userAgent: "PerplexityBot",
      baseline: outcome({ bytes: 10_000 }),
      response: outcome({ bytes: 2_000 }),
    });

    expect(result.blocked).toBe(false);
  });

  it("blocks when a challenge page is detected even at the same size", () => {
    const result = compareAgentFetch({
      userAgent: "OAI-SearchBot",
      baseline: outcome(),
      response: outcome({ body: "Please verify you are human" }),
    });

    expect(result.blocked).toBe(true);
    expect(result.challenge).toBe("generic");
    expect(result.detail).toContain("generic challenge page");
  });

  it("handles a missing baseline size", () => {
    const result = compareAgentFetch({
      userAgent: "GPTBot",
      baseline: outcome({ bytes: 0 }),
      response: outcome({ bytes: 0 }),
    });

    expect(result.blocked).toBe(false);
  });
});

describe("crawlerUserAgent", () => {
  it("builds a descriptive user agent for a crawler label", () => {
    expect(crawlerUserAgent("GPTBot")).toBe(
      "GPTBot/1.0 (+https://example.com/bot; automated audit)",
    );
  });
});
