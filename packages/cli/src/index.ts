#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  analyzeSite,
  AuditError,
  buildReport,
  evaluateThresholds,
  type AuditReport,
} from "@llm-seo-toolbox/core";

import {
  CLI_NAME,
  CLI_VERSION,
  CliUsageError,
  helpText,
  parseArgs,
  type CliOptions,
  type OutputFormat,
} from "./args";
import { createPalette, shouldUseColor, type Palette } from "./color";
import { loadConfig, mergeOptions } from "./config";
import { renderBrief } from "./formatters/brief";
import { renderJson } from "./formatters/json";
import { renderMarkdown } from "./formatters/markdown";
import { renderSummary } from "./formatters/summary";
import { renderTable } from "./formatters/table";

const DEFAULT_USER_AGENT =
  "LLMSEOToolbox-CLI/0.1 (+https://github.com/ABradwell/llm-seo-toolbox; automated audit)";

const DEFAULT_OPTIONS = {
  format: "table" as OutputFormat,
  minScore: 0,
  minGrade: "F" as const,
  timeout: 10_000,
  userAgent: DEFAULT_USER_AGENT,
};

export interface RunResult {
  code: number;
  report?: AuditReport;
}

function log(message: string): void {
  process.stderr.write(`${message}\n`);
}

function verboseLog(palette: Palette, message: string): void {
  process.stderr.write(`${palette.dim(`[verbose] ${message}`)}\n`);
}

function render(report: AuditReport, format: OutputFormat, palette: Palette): string {
  switch (format) {
    case "json":
      return renderJson(report);
    case "markdown":
      return renderMarkdown(report);
    case "brief":
      return renderBrief(report);
    case "summary":
      return renderSummary(report, palette);
    case "table":
    default:
      return renderTable(report, palette);
  }
}

async function writeOutput(path: string, content: string): Promise<void> {
  await mkdir(dirname(resolve(path)), { recursive: true });
  await writeFile(path, content, "utf8");
}

export async function run(argv: string[]): Promise<RunResult> {
  const parsed = parseArgs(argv);

  if (parsed.help) {
    process.stdout.write(helpText());
    return { code: 0 };
  }
  if (parsed.version) {
    process.stdout.write(`${CLI_NAME} ${CLI_VERSION}\n`);
    return { code: 0 };
  }
  if (!parsed.options) return { code: 0 };

  const cliOptions: CliOptions = parsed.options;
  const loaded = loadConfig(cliOptions.config);
  const merged = mergeOptions(loaded.config, cliOptions);

  const options = {
    url: cliOptions.url,
    format: merged.format ?? DEFAULT_OPTIONS.format,
    minScore: merged.minScore ?? DEFAULT_OPTIONS.minScore,
    minGrade: merged.minGrade ?? DEFAULT_OPTIONS.minGrade,
    siteType: merged.siteType ?? null,
    output: merged.output,
    timeout: merged.timeout ?? DEFAULT_OPTIONS.timeout,
    userAgent: merged.userAgent ?? DEFAULT_OPTIONS.userAgent,
    headers: merged.headers,
    resolveLinks: merged.resolveLinks ?? true,
    agentFetch: merged.agentFetch ?? true,
    verbose: merged.verbose ?? false,
    color: merged.color,
  };

  const writesToFile = Boolean(options.output && options.output !== "-");
  const palette = createPalette(
    writesToFile ? false : shouldUseColor(options.color, process.stdout),
  );

  if (options.verbose) {
    verboseLog(palette, loaded.path ? `config ${loaded.path}` : "no config file found");
    for (const warning of loaded.warnings) verboseLog(palette, warning);
    verboseLog(
      palette,
      `target ${options.url} · timeout ${options.timeout}ms · format ${options.format}`,
    );
    verboseLog(palette, `profile ${options.siteType ?? "auto"} · user-agent ${options.userAgent}`);
    if (options.headers && Object.keys(options.headers).length > 0) {
      verboseLog(palette, `headers ${Object.keys(options.headers).join(", ")}`);
    }
  }

  const startedAt = Date.now();
  let report: AuditReport;

  try {
    const audit = await analyzeSite(options.url, {
      siteType: options.siteType,
      timeoutMs: options.timeout,
      userAgent: options.userAgent,
      headers: options.headers,
      resolveLinks: options.resolveLinks,
      agentFetch: options.agentFetch,
      cache: false,
    });
    report = buildReport(audit, {
      minScore: options.minScore,
      minGrade: options.minGrade,
    });
  } catch (error) {
    if (error instanceof AuditError) {
      log(`Audit failed [${error.code}]: ${error.message}`);
      if (error.hint) log(`Hint: ${error.hint}`);
    } else {
      const message = error instanceof Error ? error.message : String(error);
      log(`Audit failed: ${message}`);
      if (options.verbose && error instanceof Error && error.stack) {
        verboseLog(palette, error.stack);
      }
    }
    return { code: 2 };
  }

  if (options.verbose) {
    verboseLog(
      palette,
      `completed in ${Date.now() - startedAt}ms · ${report.checks.length} checks · ${report.meta.pageCount} pages`,
    );
  }

  const content = render(report, options.format, palette);

  if (writesToFile && options.output) {
    try {
      await writeOutput(options.output, content);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`Could not write ${options.output}: ${message}`);
      return { code: 2, report };
    }
    log(`Report written to ${options.output}`);
  } else {
    process.stdout.write(content);
  }

  const gate = evaluateThresholds(report.score, report.grade, {
    minScore: options.minScore,
    minGrade: options.minGrade,
  });

  return { code: gate.passed ? 0 : 1, report };
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  try {
    const result = await run(argv);
    return result.code;
  } catch (error) {
    if (error instanceof CliUsageError) {
      log(`Error: ${error.message}`);
      return 2;
    }
    const message = error instanceof Error ? error.message : String(error);
    log(`Unexpected error: ${message}`);
    return 2;
  }
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return resolve(fileURLToPath(import.meta.url)) === resolve(entry);
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      log(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 2;
    });
}
