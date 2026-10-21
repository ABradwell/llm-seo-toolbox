import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { AuditGrade, SiteType } from "@llm-seo-toolbox/core/types";

import {
  CliUsageError,
  parseFormat,
  parseGrade,
  parseScore,
  parseSiteType,
  parseTimeout,
  type CliOptions,
  type OutputFormat,
} from "./args";

export const DEFAULT_CONFIG_FILES = [
  "llm-seo-toolbox.config.json",
  ".llmseotoolboxrc",
  ".llmseotoolboxrc.json",
] as const;

export interface ToolboxConfig {
  format?: OutputFormat;
  minScore?: number;
  minGrade?: AuditGrade;
  siteType?: SiteType | null;
  output?: string;
  timeout?: number;
  userAgent?: string;
  verbose?: boolean;
  color?: boolean;
}

export interface LoadedConfig {
  config: ToolboxConfig;
  path: string | null;
  warnings: string[];
}

function recordValue(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) return record[key];
  }
  return undefined;
}

function readString(
  record: Record<string, unknown>,
  key: string,
  ...aliases: string[]
): string | undefined {
  const value = recordValue(record, key, ...aliases);
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) {
    throw new CliUsageError(`“${key}” must be a non-empty string.`);
  }
  return value.trim();
}

function readBoolean(
  record: Record<string, unknown>,
  key: string,
  ...aliases: string[]
): boolean | undefined {
  const value = recordValue(record, key, ...aliases);
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new CliUsageError(`“${key}” must be true or false.`);
  }
  return value;
}

function normalizeConfig(
  raw: unknown,
  source: string,
): { config: ToolboxConfig; warnings: string[] } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new CliUsageError(`${source} must contain a JSON object.`);
  }

  const record = raw as Record<string, unknown>;
  const known = new Set([
    "format",
    "minScore",
    "min-score",
    "minGrade",
    "min-grade",
    "siteType",
    "site-type",
    "output",
    "timeout",
    "userAgent",
    "user-agent",
    "verbose",
    "color",
  ]);
  const warnings = Object.keys(record)
    .filter((key) => !known.has(key) && !key.startsWith("$"))
    .map((key) => `${source}: unknown key “${key}” was ignored.`);

  const config: ToolboxConfig = {};
  const format = readString(record, "format");
  if (format !== undefined) config.format = parseFormat(format);

  const minScore = recordValue(record, "minScore", "min-score");
  if (minScore !== undefined) config.minScore = parseScore(String(minScore));

  const minGrade = recordValue(record, "minGrade", "min-grade");
  if (minGrade !== undefined) config.minGrade = parseGrade(String(minGrade));

  const siteType = recordValue(record, "siteType", "site-type");
  if (siteType !== undefined) {
    if (typeof siteType !== "string") throw new CliUsageError("“siteType” must be a string.");
    config.siteType = parseSiteType(siteType);
  }

  config.output = readString(record, "output");
  config.userAgent = readString(record, "userAgent", "user-agent");
  config.verbose = readBoolean(record, "verbose");
  config.color = readBoolean(record, "color");

  const timeout = recordValue(record, "timeout");
  if (timeout !== undefined) config.timeout = parseTimeout(String(timeout));

  return { config, warnings };
}

export function loadConfig(requestedPath: string | undefined, cwd = process.cwd()): LoadedConfig {
  let path: string | null = null;

  if (requestedPath) {
    path = resolve(cwd, requestedPath);
    if (!existsSync(path)) {
      throw new CliUsageError(`Configuration file not found: ${requestedPath}`);
    }
  } else {
    for (const candidate of DEFAULT_CONFIG_FILES) {
      const candidatePath = resolve(cwd, candidate);
      if (existsSync(candidatePath)) {
        path = candidatePath;
        break;
      }
    }
  }

  if (!path) return { config: {}, path: null, warnings: [] };

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown parse error.";
    throw new CliUsageError(`Could not read ${path}: ${message}`);
  }

  const { config, warnings } = normalizeConfig(raw, path);
  return { config, path, warnings };
}

/**
 * CLI flags win over config values; config values win over defaults. Only keys
 * the user actually supplied are copied, so undefined never overwrites a lower
 * precedence layer.
 */
export function mergeOptions(
  config: ToolboxConfig,
  cli: Partial<Omit<CliOptions, "url">>,
): Omit<CliOptions, "url"> {
  const pick = <T>(cliValue: T | undefined, configValue: T | undefined): T | undefined =>
    cliValue !== undefined ? cliValue : configValue;

  return {
    format: pick(cli.format, config.format),
    minScore: pick(cli.minScore, config.minScore),
    minGrade: pick(cli.minGrade, config.minGrade),
    siteType: pick(cli.siteType, config.siteType),
    output: pick(cli.output, config.output),
    timeout: pick(cli.timeout, config.timeout),
    userAgent: pick(cli.userAgent, config.userAgent),
    verbose: pick(cli.verbose, config.verbose),
    color: pick(cli.color, config.color),
  };
}
