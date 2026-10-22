import { isAuditGrade, isSiteType } from "@llm-seo-toolbox/core";
import type { AuditGrade, SiteType } from "@llm-seo-toolbox/core/types";

export interface ActionInputs {
  url: string;
  minScore: number;
  minGrade: AuditGrade;
  siteType: SiteType | null;
  commentOnPr: boolean;
  githubToken: string | null;
  timeoutMs: number;
}

export class ActionInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionInputError";
  }
}

function readInput(env: Record<string, string | undefined>, name: string): string | undefined {
  const underscore = `INPUT_${name.replace(/-/g, "_").toUpperCase()}`;
  const hyphen = `INPUT_${name.toUpperCase()}`;
  const value = env[underscore] ?? env[hyphen];
  return value === undefined ? undefined : value.trim();
}

function parseInteger(value: string, name: string, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new ActionInputError(`${name} must be an integer between ${min} and ${max}.`);
  }
  return parsed;
}

function parseBoolean(value: string, name: string): boolean {
  const normalized = value.toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  throw new ActionInputError(`${name} must be true or false.`);
}

export function readInputs(env: Record<string, string | undefined> = process.env): ActionInputs {
  const url = readInput(env, "url");
  if (!url) throw new ActionInputError("The url input is required.");

  const minScore = parseInteger(readInput(env, "min-score") ?? "75", "min-score", 0, 100);
  const minGrade = (readInput(env, "min-grade") ?? "B").toUpperCase();
  if (!isAuditGrade(minGrade)) {
    throw new ActionInputError("min-grade must be one of A, B, C, D or F.");
  }

  const siteTypeValue = (readInput(env, "site-type") ?? "auto").toLowerCase();
  let siteType: SiteType | null = null;
  if (siteTypeValue !== "auto") {
    if (!isSiteType(siteTypeValue)) {
      throw new ActionInputError(
        "site-type must be auto, saas, portfolio, docs, ecommerce, local-business or blog-media.",
      );
    }
    siteType = siteTypeValue;
  }

  const commentOnPr = parseBoolean(readInput(env, "comment-on-pr") ?? "true", "comment-on-pr");
  const timeoutMs = parseInteger(readInput(env, "timeout") ?? "10000", "timeout", 1000, 120000);
  const githubToken = readInput(env, "github-token") || null;

  return { url, minScore, minGrade, siteType, commentOnPr, githubToken, timeoutMs };
}
