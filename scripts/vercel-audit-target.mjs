#!/usr/bin/env node
/**
 * Resolve the Vercel deployment for the current workflow event and write
 * `url`, `deployment_id`, `deployment_state`, `deployment_url` and
 * `branch_alias` to GITHUB_OUTPUT.
 *
 * Pull requests resolve the preview deployment for the head commit. Pushes and
 * manual runs resolve the production deployment for the pushed commit and
 * output the production URL once that deployment is READY.
 *
 * Required environment:
 *   VERCEL_TOKEN          Vercel access token with access to the project's team
 *   GITHUB_REPOSITORY     owner/repo, provided by GitHub Actions
 *   GITHUB_HEAD_REF       pull request source branch, provided by GitHub Actions
 *   AUDIT_URL             production URL, required when VERCEL_TARGET=production
 *
 * Optional environment:
 *   VERCEL_TARGET                    preview or production, default preview
 *   PR_HEAD_SHA                      pull request head commit
 *   GITHUB_SHA                       pushed commit, used for production
 *   VERCEL_PROJECT_ID                project id (starts with prj_)
 *   VERCEL_TEAM_ID                   team id (starts with team_)
 *   VERCEL_TEAM_SLUG                 team slug, used when VERCEL_TEAM_ID is absent
 *   VERCEL_DEPLOYMENT_TIMEOUT_SECONDS  total wait, default 600
 *   VERCEL_DEPLOYMENT_POLL_SECONDS     poll interval, default 10
 */
import { appendFileSync } from "node:fs";

import { resolveDeployment } from "./lib/vercel-deployment.mjs";

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

function normalizeUrl(value) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
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
  const target = (env("VERCEL_TARGET") ?? "preview").toLowerCase();
  if (target !== "preview" && target !== "production") {
    throw new Error("VERCEL_TARGET must be preview or production.");
  }

  const token = required("VERCEL_TOKEN");
  const repository = required("GITHUB_REPOSITORY");
  const [owner, repoName] = repository.split("/");
  if (!owner || !repoName) {
    throw new Error("GITHUB_REPOSITORY must look like owner/repo.");
  }

  const branch =
    target === "production"
      ? (env("GITHUB_REF_NAME") ?? "main")
      : (env("GITHUB_HEAD_REF") ?? env("GITHUB_REF_NAME"));
  if (!branch) {
    throw new Error("GITHUB_HEAD_REF is required for pull request events.");
  }

  const headSha = env("PR_HEAD_SHA") ?? (target === "production" ? env("GITHUB_SHA") : undefined);
  const auditUrl = env("AUDIT_URL");
  if (target === "production" && !auditUrl) {
    throw new Error("AUDIT_URL is required to resolve a production target.");
  }

  const result = await resolveDeployment({
    token,
    projectId: env("VERCEL_PROJECT_ID"),
    teamId: env("VERCEL_TEAM_ID"),
    teamSlug: env("VERCEL_TEAM_SLUG"),
    repoName,
    branch,
    headSha,
    target,
    timeoutMs:
      positiveInteger("VERCEL_DEPLOYMENT_TIMEOUT_SECONDS", 600, MAX_TIMEOUT_SECONDS) * 1000,
    intervalMs: positiveInteger("VERCEL_DEPLOYMENT_POLL_SECONDS", 10, MAX_POLL_SECONDS) * 1000,
  });

  setOutput("url", target === "production" ? normalizeUrl(auditUrl) : result.url);
  setOutput("deployment_url", result.url);
  setOutput("deployment_id", result.id ?? "");
  setOutput("deployment_state", result.state);
  if (result.branchAlias) setOutput("branch_alias", result.branchAlias);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`::error::${message}`);
  process.exitCode = 1;
});
