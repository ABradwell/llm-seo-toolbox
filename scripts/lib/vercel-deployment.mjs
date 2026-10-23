/**
 * Resolve a Vercel deployment for a Git branch.
 *
 * The Vercel deployments API lists newest first, but a build may still be
 * queued or running when the workflow starts. This module polls until the
 * deployment for the requested commit is READY, then returns its unique URL.
 */

const DEFAULT_API_URL = "https://api.vercel.com";
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 10 * 1000;
const DEFAULT_LIMIT = 20;
const USER_AGENT = "llm-seo-toolbox-ci (+https://github.com/ABradwell/llm-seo-toolbox)";

const IN_PROGRESS_STATES = new Set(["QUEUED", "INITIALIZING", "BUILDING"]);
const FAILED_STATES = new Set(["ERROR", "CANCELED", "BLOCKED", "DELETED"]);
const TARGETS = new Set(["preview", "production"]);

export class VercelApiError extends Error {
  constructor(message, { status = 0, retryable = false } = {}) {
    super(message);
    this.name = "VercelApiError";
    this.status = status;
    this.retryable = retryable;
  }
}

function createdTime(deployment) {
  const value = deployment?.created ?? deployment?.createdAt ?? 0;
  return Number(value) || 0;
}

/**
 * Builds the deployments URL. `branch` and identifier values are encoded by
 * URLSearchParams, so branch names with slashes work unchanged.
 */
export function buildDeploymentsUrl({
  apiUrl = DEFAULT_API_URL,
  projectId,
  teamId,
  teamSlug,
  branch,
  limit = DEFAULT_LIMIT,
} = {}) {
  const url = new URL("/v7/deployments", apiUrl);

  if (projectId) url.searchParams.set("projectId", projectId);
  if (teamId) url.searchParams.set("teamId", teamId);
  else if (teamSlug) url.searchParams.set("slug", teamSlug);
  if (branch) url.searchParams.set("branch", branch);
  url.searchParams.set("limit", String(limit));

  return url.toString();
}

/**
 * Picks the deployment for the requested repository, branch, commit and target.
 * Preview mode excludes production deployments; production mode requires one.
 */
export function pickDeployment(
  deployments,
  { repoName, branch, headSha, target = "preview" } = {},
) {
  if (!Array.isArray(deployments)) return null;

  const matches = deployments.filter((deployment) => {
    const meta = deployment?.meta ?? {};
    if (meta.githubCommitRepo !== repoName) return false;
    if (meta.githubCommitRef !== branch) return false;
    if (target === "production") {
      if (deployment?.target !== "production") return false;
    } else if (deployment?.target === "production") {
      return false;
    }
    if (!deployment?.url) return false;
    return true;
  });

  matches.sort((left, right) => createdTime(right) - createdTime(left));

  if (headSha) {
    return matches.find((deployment) => deployment.meta?.githubCommitSha === headSha) ?? null;
  }

  return matches[0] ?? null;
}

async function readErrorMessage(response) {
  try {
    const body = await response.json();
    return body?.error?.message ?? body?.message ?? response.statusText ?? "";
  } catch {
    return response.statusText ?? "";
  }
}

function setupHint(status) {
  if (status === 401) return "VERCEL_TOKEN is invalid or expired.";
  if (status === 403) {
    return "The token cannot access this project's team. Set VERCEL_TEAM_ID (or VERCEL_TEAM_SLUG) and make sure the token belongs to that team.";
  }
  if (status === 404) return "The project was not found. Check VERCEL_PROJECT_ID.";
  return "";
}

async function listDeployments({
  token,
  apiUrl,
  projectId,
  teamId,
  teamSlug,
  branch,
  limit,
  fetchImpl,
}) {
  const response = await fetchImpl(
    buildDeploymentsUrl({ apiUrl, projectId, teamId, teamSlug, branch, limit }),
    {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        "user-agent": USER_AGENT,
      },
    },
  );

  if (!response.ok) {
    const detail = await readErrorMessage(response);
    const hint = setupHint(response.status);
    const message = `Vercel API ${response.status}${detail ? `: ${detail}` : ""}${hint ? ` ${hint}` : ""}`;
    throw new VercelApiError(message, {
      status: response.status,
      retryable: response.status === 429 || response.status >= 500,
    });
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new VercelApiError("The Vercel API returned a response that was not JSON.", {
      status: response.status,
      retryable: true,
    });
  }

  if (!Array.isArray(body?.deployments)) {
    throw new VercelApiError("The Vercel API response did not include a deployments array.", {
      status: response.status,
      retryable: true,
    });
  }

  return body.deployments;
}

function isRetryable(error) {
  // Network failures and transient API responses are worth retrying until the
  // deadline. Authentication and project errors are not.
  return error instanceof VercelApiError ? error.retryable : true;
}

function deploymentUrl(deployment) {
  const value = deployment.url;
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

/**
 * Polls the Vercel API until the deployment for `headSha` (or the newest
 * deployment on `branch` when no SHA is given) is READY.
 */
export async function resolveDeployment({
  token,
  projectId,
  teamId,
  teamSlug,
  repoName,
  branch,
  headSha,
  target = "preview",
  apiUrl = DEFAULT_API_URL,
  limit = DEFAULT_LIMIT,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  intervalMs = DEFAULT_INTERVAL_MS,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
  log = (message) => console.log(message),
} = {}) {
  if (!token) throw new Error("VERCEL_TOKEN is required to resolve the deployment.");
  if (!repoName) throw new Error("A repository name is required to resolve the deployment.");
  if (!branch) throw new Error("A Git branch is required to resolve the deployment.");
  if (!TARGETS.has(target)) throw new Error("target must be preview or production.");
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("timeoutMs must be a positive number.");
  }
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new Error("intervalMs must be a positive number.");
  }

  const label = target === "production" ? "production" : "preview";
  const deadline = now() + timeoutMs;
  let attempt = 0;
  let lastState = "none";

  while (now() < deadline) {
    attempt += 1;
    let deployments;

    try {
      deployments = await listDeployments({
        token,
        apiUrl,
        projectId,
        teamId,
        teamSlug,
        branch,
        limit,
        fetchImpl,
      });
    } catch (error) {
      if (!isRetryable(error)) throw error;
      const message = error instanceof Error ? error.message : String(error);
      log(`Attempt ${attempt}: ${message} Retrying...`);
      await sleep(intervalMs);
      continue;
    }

    const deployment = pickDeployment(deployments, { repoName, branch, headSha, target });

    if (!deployment) {
      const commit = headSha ? ` at ${headSha.slice(0, 7)}` : "";
      log(
        `Attempt ${attempt}: no Vercel ${label} for ${repoName}@${branch}${commit} yet. Waiting...`,
      );
    } else {
      const state = deployment.state ?? deployment.readyState ?? "UNKNOWN";
      lastState = state;

      if (state === "READY") {
        const url = deploymentUrl(deployment);
        const branchAlias = deployment.meta?.branchAlias
          ? `https://${deployment.meta.branchAlias}`
          : null;
        log(`Vercel ${label} ready: ${url} (${deployment.uid ?? "unknown deployment"})`);
        return { url, id: deployment.uid ?? null, state, branchAlias, target };
      }

      if (FAILED_STATES.has(state)) {
        const inspector = deployment.inspectorUrl ? ` Inspect: ${deployment.inspectorUrl}` : "";
        throw new Error(
          `Vercel ${label} deployment ${deployment.uid ?? ""} for ${branch} is ${state}${
            deployment.errorMessage ? `: ${deployment.errorMessage}` : ""
          }.${inspector}`,
        );
      }

      if (!IN_PROGRESS_STATES.has(state)) {
        log(`Attempt ${attempt}: deployment ${deployment.uid ?? ""} reported ${state}. Waiting...`);
      } else {
        log(`Attempt ${attempt}: deployment ${deployment.uid ?? ""} is ${state}. Waiting...`);
      }
    }

    await sleep(intervalMs);
  }

  const commit = headSha ? ` at ${headSha.slice(0, 7)}` : "";
  throw new Error(
    `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for a READY Vercel ${label} deployment for ${repoName}@${branch}${commit} (last state: ${lastState}). Check that the Vercel project is connected to this repository and that the build was not skipped.`,
  );
}
