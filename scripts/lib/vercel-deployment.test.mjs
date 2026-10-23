import { describe, expect, it, vi } from "vitest";

import { buildDeploymentsUrl, pickDeployment, resolveDeployment } from "./vercel-deployment.mjs";

function ready(overrides = {}) {
  return {
    uid: "dpl_ready",
    url: "llm-seo-toolbox-abc-bradwell-applications.vercel.app",
    state: "READY",
    readyState: "READY",
    target: null,
    created: 1_000,
    meta: {
      githubCommitRepo: "llm-seo-toolbox",
      githubCommitRef: "feat/preview",
      githubCommitSha: "abc1234",
      branchAlias: "llm-seo-toolbox-git-feat-preview-bradwell-applications.vercel.app",
    },
    ...overrides,
  };
}

function production(overrides = {}) {
  return ready({
    uid: "dpl_production",
    url: "llm-seo-toolbox-prod-bradwell-applications.vercel.app",
    target: "production",
    meta: {
      ...ready().meta,
      githubCommitRef: "main",
    },
    ...overrides,
  });
}

function jsonResponse(body, { ok = true, status = 200, statusText = "OK" } = {}) {
  return {
    ok,
    status,
    statusText,
    json: async () => body,
  };
}

function harness(sequence) {
  let index = 0;
  const fetchImpl = vi.fn(async () => {
    const item = sequence[Math.min(index, sequence.length - 1)];
    index += 1;
    return typeof item === "function" ? item() : item;
  });
  return { fetchImpl };
}

function clocked() {
  let time = 0;
  return {
    now: () => time,
    sleep: async (ms) => {
      time += ms;
    },
  };
}

const baseOptions = {
  token: "tok",
  repoName: "llm-seo-toolbox",
  branch: "feat/preview",
  headSha: "abc1234",
  timeoutMs: 1_000,
  intervalMs: 10,
  log: () => {},
};

describe("buildDeploymentsUrl", () => {
  it("adds the project, team, branch and limit filters", () => {
    const url = new URL(
      buildDeploymentsUrl({
        projectId: "prj_123",
        teamId: "team_123",
        branch: "feat/preview",
        limit: 5,
      }),
    );

    expect(url.origin).toBe("https://api.vercel.com");
    expect(url.pathname).toBe("/v7/deployments");
    expect(url.searchParams.get("projectId")).toBe("prj_123");
    expect(url.searchParams.get("teamId")).toBe("team_123");
    expect(url.searchParams.get("branch")).toBe("feat/preview");
    expect(url.searchParams.get("limit")).toBe("5");
  });

  it("uses the team slug when no team id is provided", () => {
    const url = new URL(
      buildDeploymentsUrl({ teamSlug: "bradwell-applications", branch: "fix/nav" }),
    );

    expect(url.searchParams.get("slug")).toBe("bradwell-applications");
    expect(url.searchParams.get("teamId")).toBeNull();
    expect(url.searchParams.get("branch")).toBe("fix/nav");
  });
});

describe("pickDeployment", () => {
  it("picks the newest preview for the repository and branch", () => {
    const deployments = [
      ready({ uid: "old", created: 100 }),
      ready({ uid: "new", created: 300 }),
      ready({ uid: "middle", created: 200 }),
      production({ uid: "production", created: 400 }),
      ready({
        uid: "other-repo",
        created: 500,
        meta: { ...ready().meta, githubCommitRepo: "other-repo" },
      }),
      ready({
        uid: "other-branch",
        created: 600,
        meta: { ...ready().meta, githubCommitRef: "fix/other" },
      }),
      ready({ uid: "no-url", created: 700, url: null }),
    ];

    expect(
      pickDeployment(deployments, { repoName: "llm-seo-toolbox", branch: "feat/preview" }),
    ).toMatchObject({ uid: "new" });
  });

  it("prefers the exact pull request head commit", () => {
    const deployments = [
      ready({
        uid: "newer-branch",
        created: 300,
        meta: { ...ready().meta, githubCommitSha: "newer" },
      }),
      ready({ uid: "head", created: 100, meta: { ...ready().meta, githubCommitSha: "abc1234" } }),
    ];

    expect(
      pickDeployment(deployments, {
        repoName: "llm-seo-toolbox",
        branch: "feat/preview",
        headSha: "abc1234",
      }),
    ).toMatchObject({ uid: "head" });
  });

  it("returns null when the head commit has no deployment yet", () => {
    const deployments = [ready({ meta: { ...ready().meta, githubCommitSha: "older" } })];

    expect(
      pickDeployment(deployments, {
        repoName: "llm-seo-toolbox",
        branch: "feat/preview",
        headSha: "abc1234",
      }),
    ).toBeNull();
  });

  it("selects the production deployment for a main commit", () => {
    const deployments = [
      ready({ uid: "preview", target: null, meta: { ...ready().meta, githubCommitRef: "main" } }),
      production({ uid: "production", created: 50 }),
    ];

    expect(
      pickDeployment(deployments, {
        repoName: "llm-seo-toolbox",
        branch: "main",
        headSha: "abc1234",
        target: "production",
      }),
    ).toMatchObject({ uid: "production" });
  });

  it("ignores malformed responses", () => {
    expect(pickDeployment(null, { repoName: "repo", branch: "main" })).toBeNull();
    expect(pickDeployment([], { repoName: "repo", branch: "main" })).toBeNull();
  });
});

describe("resolveDeployment", () => {
  it("returns a ready preview deployment", async () => {
    const { fetchImpl } = harness([jsonResponse({ deployments: [ready()] })]);

    const result = await resolveDeployment({
      ...baseOptions,
      ...clocked(),
      fetchImpl,
    });

    expect(result).toEqual({
      url: "https://llm-seo-toolbox-abc-bradwell-applications.vercel.app",
      id: "dpl_ready",
      state: "READY",
      branchAlias: "https://llm-seo-toolbox-git-feat-preview-bradwell-applications.vercel.app",
      target: "preview",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns a ready production deployment", async () => {
    const { fetchImpl } = harness([jsonResponse({ deployments: [production()] })]);

    const result = await resolveDeployment({
      ...baseOptions,
      branch: "main",
      target: "production",
      ...clocked(),
      fetchImpl,
    });

    expect(result).toMatchObject({
      url: "https://llm-seo-toolbox-prod-bradwell-applications.vercel.app",
      id: "dpl_production",
      target: "production",
    });
  });

  it("polls while the deployment is building", async () => {
    const building = ready({ state: "BUILDING", readyState: "BUILDING" });
    const { fetchImpl } = harness([
      jsonResponse({ deployments: [building] }),
      jsonResponse({ deployments: [ready()] }),
    ]);

    const result = await resolveDeployment({
      ...baseOptions,
      ...clocked(),
      fetchImpl,
    });

    expect(result.state).toBe("READY");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("waits for the head commit instead of auditing an older deployment", async () => {
    const older = ready({ uid: "older", meta: { ...ready().meta, githubCommitSha: "older" } });
    const { fetchImpl } = harness([
      jsonResponse({ deployments: [older] }),
      jsonResponse({ deployments: [older] }),
      jsonResponse({ deployments: [older, ready()] }),
    ]);

    const result = await resolveDeployment({
      ...baseOptions,
      ...clocked(),
      fetchImpl,
    });

    expect(result.id).toBe("dpl_ready");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("fails when the deployment ends in an error state", async () => {
    const failed = ready({
      state: "ERROR",
      readyState: "ERROR",
      errorMessage: "Build failed",
      inspectorUrl: "https://vercel.com/inspect",
    });
    const { fetchImpl } = harness([jsonResponse({ deployments: [failed] })]);

    await expect(resolveDeployment({ ...baseOptions, ...clocked(), fetchImpl })).rejects.toThrow(
      /Build failed/,
    );
  });

  it("times out when no deployment appears", async () => {
    const { fetchImpl } = harness([jsonResponse({ deployments: [] })]);

    await expect(resolveDeployment({ ...baseOptions, ...clocked(), fetchImpl })).rejects.toThrow(
      /Timed out after 1s/,
    );
  });

  it("does not retry a 403 and explains the team scope", async () => {
    const { fetchImpl } = harness([
      jsonResponse(
        { error: { message: "Not authorized" } },
        { ok: false, status: 403, statusText: "Forbidden" },
      ),
    ]);

    await expect(resolveDeployment({ ...baseOptions, ...clocked(), fetchImpl })).rejects.toThrow(
      /VERCEL_TEAM_ID/,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a rate-limited response", async () => {
    const { fetchImpl } = harness([
      jsonResponse(
        { error: { message: "Rate limited" } },
        { ok: false, status: 429, statusText: "Too Many Requests" },
      ),
      jsonResponse({ deployments: [ready()] }),
    ]);

    const result = await resolveDeployment({
      ...baseOptions,
      ...clocked(),
      fetchImpl,
    });

    expect(result.state).toBe("READY");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("requires a token", async () => {
    await expect(
      resolveDeployment({ ...baseOptions, token: "", ...clocked(), fetchImpl: vi.fn() }),
    ).rejects.toThrow(/VERCEL_TOKEN/);
  });

  it("rejects an unknown target", async () => {
    await expect(
      resolveDeployment({
        ...baseOptions,
        target: "staging",
        ...clocked(),
        fetchImpl: vi.fn(),
      }),
    ).rejects.toThrow(/preview or production/);
  });
});
