import { describe, expect, it } from "vitest";

import { pullRequestContext, upsertPullRequestComment } from "./comment";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("pullRequestContext", () => {
  it("reads the pull request number and repository from the event", () => {
    const context = pullRequestContext(
      {
        GITHUB_EVENT_PATH: "/event.json",
        GITHUB_REPOSITORY: "ABradwell/llm-seo-toolbox",
        GITHUB_TOKEN: "token",
      },
      () => JSON.stringify({ pull_request: { number: 42 } }),
    );

    expect(context).toEqual({
      apiUrl: "https://api.github.com",
      owner: "ABradwell",
      repo: "llm-seo-toolbox",
      number: 42,
      token: "token",
    });
  });

  it("returns null for push events and missing tokens", () => {
    const push = pullRequestContext(
      { GITHUB_EVENT_PATH: "/event.json", GITHUB_REPOSITORY: "a/b", GITHUB_TOKEN: "t" },
      () => JSON.stringify({ ref: "refs/heads/main" }),
    );
    expect(push).toBeNull();

    const noToken = pullRequestContext(
      { GITHUB_EVENT_PATH: "/event.json", GITHUB_REPOSITORY: "a/b" },
      () => JSON.stringify({ pull_request: { number: 1 } }),
    );
    expect(noToken).toBeNull();
  });
});

describe("upsertPullRequestComment", () => {
  const context = {
    apiUrl: "https://api.github.com",
    owner: "ABradwell",
    repo: "llm-seo-toolbox",
    number: 7,
    token: "token",
  };

  it("updates the existing sticky comment", async () => {
    const calls: { url: string; method: string }[] = [];
    const fetchMock = (async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method ?? "GET" });
      if (calls.length === 1) {
        return jsonResponse([{ id: 11, body: "<!-- marker -->\nold report" }]);
      }
      return jsonResponse({ id: 11, html_url: "https://github.com/comment/11" });
    }) as typeof fetch;

    const result = await upsertPullRequestComment(context, "marker", "new report", fetchMock);
    expect(result.action).toBe("updated");
    expect(calls[1].method).toBe("PATCH");
    expect(calls[1].url).toContain("/issues/comments/11");
  });

  it("creates a comment when no marker is found", async () => {
    const calls: string[] = [];
    const fetchMock = (async (url: string | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(url)}`);
      if (calls.length === 1) return jsonResponse([{ id: 1, body: "unrelated" }]);
      return jsonResponse({ html_url: "https://github.com/comment/12" });
    }) as typeof fetch;

    const result = await upsertPullRequestComment(context, "marker", "new report", fetchMock);
    expect(result.action).toBe("created");
    expect(calls[1].startsWith("POST")).toBe(true);
    expect(calls[1]).not.toContain("/issues/comments/");
  });

  it("surfaces GitHub API failures", async () => {
    const fetchMock = (async () => jsonResponse({ message: "Forbidden" }, 403)) as typeof fetch;
    await expect(upsertPullRequestComment(context, "marker", "report", fetchMock)).rejects.toThrow(
      /403/,
    );
  });
});
