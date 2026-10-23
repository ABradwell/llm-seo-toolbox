#!/usr/bin/env node
/**
 * Resolve the Vercel preview deployment for the current pull request and write
 * `url`, `deployment_id`, `deployment_state` and `branch_alias` to GITHUB_OUTPUT.
 *
 * Required environment:
 *   VERCEL_TOKEN          Vercel access token with access to the project's team
 *   GITHUB_REPOSITORY     owner/repo, provided by GitHub Actions
 *   GITHUB_HEAD_REF       pull request source branch, provided by GitHub Actions
 *
 * Optional environment:
 *   PR_HEAD_SHA                     pull request head commit
 *   VERCEL_PROJECT_ID               project id (starts with prj_)
 *   VERCEL_TEAM_ID                  team id (starts with team_)
 *   VERCEL_TEAM_SLUG                team slug, used when VERCEL_TEAM_ID is absent
 *   VERCEL_PREVIEW_TIMEOUT_SECONDS  total wait, default 600
 *   VERCEL_PREVIEW_POLL_SECONDS     poll interval, default 10
 */
import { appendFileSync } from "node:fs";

import { resolvePreviewDeployment } from "./lib/vercel-preview.mjs";

const MAX_TIMEOUT_SECONDS = 60 * 60;
const MAX_POLL_SECONDS = 2 * 60;

function env(name) {
  return process.env[name]?.trim() || undefined;
}

function required(name) {
  const value = env(name);
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function positiveInteger(name, fallback, maximum) {
  const raw = env(name);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0 || value > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}.`);
  }
  return value;
}

function setOutput(name, value) {
  const file = env("GITHUB_OUTPUT");
  if (!file) {
    console.log(`${name}=${value}`);
    return;
  }

  const delimiter = `ghadelimiter_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  appendFileSync(file, `${name}<<${delimiter}\n${value}\n${delimiter}\n`, "utf8");
}

async function main() {
  const token = required("VERCEL_TOKEN");
  const repository = required("GITHUB_REPOSITORY");
  const [owner, repoName] = repository.split("/");
  if (!owner || !repoName) {
    throw new Error("GITHUB_REPOSITORY must look like owner/repo.");
  }

  const branch = env("GITHUB_HEAD_REF") ?? env("GITHUB_REF_NAME");
  if (!branch) {
    throw new Error("GITHUB_HEAD_REF is required for pull request events.");
  }

  const result = await resolvePreviewDeployment({
    token,
    projectId: env("VERCEL_PROJECT_ID"),
    teamId: env("VERCEL_TEAM_ID"),
    teamSlug: env("VERCEL_TEAM_SLUG"),
    repoName,
    branch,
    headSha: env("PR_HEAD_SHA"),
    timeoutMs: positiveInteger("VERCEL_PREVIEW_TIMEOUT_SECONDS", 600, MAX_TIMEOUT_SECONDS) * 1000,
    intervalMs: positiveInteger("VERCEL_PREVIEW_POLL_SECONDS", 10, MAX_POLL_SECONDS) * 1000,
  });

  setOutput("url", result.url);
  setOutput("deployment_id", result.id ?? "");
  setOutput("deployment_state", result.state);
  if (result.branchAlias) setOutput("branch_alias", result.branchAlias);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`::error::${message}`);
  process.exitCode = 1;
});
