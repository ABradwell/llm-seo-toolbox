import { isAuditGrade, isSiteType } from "@llm-seo-toolbox/core";
import type { AuditGrade, SiteType } from "@llm-seo-toolbox/core/types";

export const CLI_NAME = "llm-seo-toolbox";
export const CLI_VERSION = "0.1.0";

export const OUTPUT_FORMATS = ["table", "json", "markdown", "summary"] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

export interface CliOptions {
  url: string;
  format?: OutputFormat;
  minScore?: number;
  minGrade?: AuditGrade;
  config?: string;
  /** `null` means auto-detect. */
  siteType?: SiteType | null;
  output?: string;
  timeout?: number;
  userAgent?: string;
  verbose?: boolean;
  color?: boolean;
}

export interface ParsedArgs {
  options: CliOptions | null;
  help: boolean;
  version: boolean;
}

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

function readValue(argv: string[], index: number, flag: string): { value: string; next: number } {
  const inline = argv[index];
  const equals = inline.indexOf("=");
  if (equals !== -1) {
    const value = inline.slice(equals + 1);
    if (!value) throw new CliUsageError(`${flag} needs a value.`);
    return { value, next: index + 1 };
  }

  const value = argv[index + 1];
  if (value === undefined || (value.startsWith("-") && value !== "-")) {
    throw new CliUsageError(`${flag} needs a value.`);
  }
  return { value, next: index + 2 };
}

export function parseFormat(value: string): OutputFormat {
  const normalized = value.toLowerCase();
  if (!(OUTPUT_FORMATS as readonly string[]).includes(normalized)) {
    throw new CliUsageError(`Unknown format “${value}”. Use one of: ${OUTPUT_FORMATS.join(", ")}.`);
  }
  return normalized as OutputFormat;
}

export function parseScore(value: string): number {
  const score = Number(value);
  if (!Number.isFinite(score) || !Number.isInteger(score) || score < 0 || score > 100) {
    throw new CliUsageError(
      `min-score must be an integer between 0 and 100 (received “${value}”).`,
    );
  }
  return score;
}

export function parseGrade(value: string): AuditGrade {
  const grade = value.toUpperCase();
  if (!isAuditGrade(grade)) {
    throw new CliUsageError(`min-grade must be one of A, B, C, D or F (received “${value}”).`);
  }
  return grade;
}

export function parseSiteType(value: string): SiteType | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "auto") return null;
  if (!isSiteType(normalized)) {
    throw new CliUsageError(
      `Unknown site type “${value}”. Use auto or one of: saas, portfolio, docs, ecommerce, local-business, blog-media.`,
    );
  }
  return normalized;
}

export function parseTimeout(value: string): number {
  const timeout = Number(value);
  if (
    !Number.isFinite(timeout) ||
    !Number.isInteger(timeout) ||
    timeout < 1_000 ||
    timeout > 120_000
  ) {
    throw new CliUsageError(
      `timeout must be an integer between 1000 and 120000 ms (received “${value}”).`,
    );
  }
  return timeout;
}

/**
 * Parses CLI arguments without a dependency. The parser is deliberately
 * strict: unknown flags and missing values fail before any network request.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const options: Partial<CliOptions> = {};
  const positionals: string[] = [];
  let help = false;
  let version = false;
  let index = 0;
  let endOfFlags = false;

  while (index < argv.length) {
    const arg = argv[index];

    if (endOfFlags || !arg.startsWith("-") || arg === "-") {
      positionals.push(arg);
      index += 1;
      continue;
    }

    if (arg === "--") {
      endOfFlags = true;
      index += 1;
      continue;
    }

    const flag = arg.includes("=") ? arg.slice(0, arg.indexOf("=")) : arg;

    switch (flag) {
      case "-h":
      case "--help":
        help = true;
        index += 1;
        break;
      case "--version":
        version = true;
        index += 1;
        break;
      case "-v":
      case "--verbose":
        options.verbose = true;
        index += 1;
        break;
      case "--no-color":
        options.color = false;
        index += 1;
        break;
      case "--color":
        options.color = true;
        index += 1;
        break;
      case "-f":
      case "--format": {
        const { value, next } = readValue(argv, index, flag);
        options.format = parseFormat(value);
        index = next;
        break;
      }
      case "-s":
      case "--min-score": {
        const { value, next } = readValue(argv, index, flag);
        options.minScore = parseScore(value);
        index = next;
        break;
      }
      case "-g":
      case "--min-grade": {
        const { value, next } = readValue(argv, index, flag);
        options.minGrade = parseGrade(value);
        index = next;
        break;
      }
      case "-c":
      case "--config": {
        const { value, next } = readValue(argv, index, flag);
        options.config = value;
        index = next;
        break;
      }
      case "-t":
      case "--site-type": {
        const { value, next } = readValue(argv, index, flag);
        options.siteType = parseSiteType(value);
        index = next;
        break;
      }
      case "-o":
      case "--output": {
        const { value, next } = readValue(argv, index, flag);
        options.output = value;
        index = next;
        break;
      }
      case "--timeout": {
        const { value, next } = readValue(argv, index, flag);
        options.timeout = parseTimeout(value);
        index = next;
        break;
      }
      case "--user-agent": {
        const { value, next } = readValue(argv, index, flag);
        options.userAgent = value;
        index = next;
        break;
      }
      default:
        throw new CliUsageError(`Unknown option “${flag}”. Run ${CLI_NAME} --help for usage.`);
    }
  }

  if (help || version) return { options: null, help, version };

  if (positionals.length === 0) {
    throw new CliUsageError(`Missing target URL. Run ${CLI_NAME} --help for usage.`);
  }
  if (positionals.length > 1) {
    throw new CliUsageError("Audit one URL at a time.");
  }

  return {
    options: { ...options, url: positionals[0] },
    help: false,
    version: false,
  };
}

export function helpText(): string {
  return `${CLI_NAME} ${CLI_VERSION}

Audit a website's AI discovery surface: /llms.txt, RFC 9309 crawler access,
static HTML parseability and schema.org machine interfaces.

Usage
  ${CLI_NAME} <url> [options]

Options
  -f, --format <type>     table (default), json, markdown or summary
  -s, --min-score <0-100> Minimum composite score required to pass
  -g, --min-grade <A-F>   Minimum letter grade required to pass
  -t, --site-type <type>  auto (default), saas, portfolio, docs, ecommerce,
                          local-business or blog-media
  -c, --config <path>     Configuration file (default: auto-discovered)
  -o, --output <file>     Write the report to a file instead of stdout
      --timeout <ms>      Per-request timeout (default: 10000)
      --user-agent <ua>   Override the crawler user agent
  -v, --verbose           Log progress and timing to stderr
      --no-color          Disable ANSI colour
      --version           Print the version
  -h, --help              Show this help

Exit codes
  0  Audit completed and met the configured thresholds
  1  Audit completed but scored below a threshold
  2  The audit could not run (bad arguments, unreachable site, timeout)

Examples
  ${CLI_NAME} example.com
  ${CLI_NAME} https://example.com --format json --min-score 75 --min-grade B
  ${CLI_NAME} docs.example.com --format markdown --output audit.md
`;
}
