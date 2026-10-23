import { isAuditGrade, isSiteType } from "@llm-seo-toolbox/core";
import type { AuditGrade, SiteType } from "@llm-seo-toolbox/core/types";

export const REPORT_STYLES = ["technical", "plain"] as const;
export type ReportStyle = (typeof REPORT_STYLES)[number];

export interface ActionInputs {
  url: string;
  minScore: number;
  minGrade: AuditGrade;
  siteType: SiteType | null;
  commentOnPr: boolean;
  githubToken: string | null;
  timeoutMs: number;
  /** `plain` posts plain-language change requests instead of the technical report. */
  reportStyle: ReportStyle;
  resolveLinks: boolean;
  agentFetch: boolean;
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

  const reportStyle = (readInput(env, "report-style") || "technical").toLowerCase();
  if (!(REPORT_STYLES as readonly string[]).includes(reportStyle)) {
    throw new ActionInputError("report-style must be technical or plain.");
  }

  const resolveLinks = parseBoolean(readInput(env, "resolve-links") ?? "true", "resolve-links");
  const agentFetch = parseBoolean(readInput(env, "agent-fetch") ?? "true", "agent-fetch");

  return {
    url,
    minScore,
    minGrade,
    siteType,
    commentOnPr,
    githubToken,
    timeoutMs,
    reportStyle: reportStyle as ReportStyle,
    resolveLinks,
    agentFetch,
  };
}
