import { describe, expect, it } from "vitest";

import {
  CliUsageError,
  parseArgs,
  parseFormat,
  parseGrade,
  parseHeader,
  parseScore,
  parseSiteType,
  parseTimeout,
} from "./args";

describe("parseArgs", () => {
  it("parses a bare URL with defaults left undefined", () => {
    const parsed = parseArgs(["example.com"]);
    expect(parsed.options?.url).toBe("example.com");
    expect(parsed.options?.format).toBeUndefined();
    expect(parsed.help).toBe(false);
  });

  it("parses long and short flags, including --flag=value", () => {
    const short = parseArgs(["example.com", "-f", "json", "-s", "80", "-g", "b", "-v"]);
    expect(short.options).toMatchObject({
      format: "json",
      minScore: 80,
      minGrade: "B",
      verbose: true,
    });

    const inline = parseArgs([
      "example.com",
      "--format=markdown",
      "--min-score=90",
      "--min-grade=A",
      "--timeout=15000",
      "--user-agent=Custom/1.0",
      "--no-color",
    ]);
    expect(inline.options).toMatchObject({
      format: "markdown",
      minScore: 90,
      minGrade: "A",
      timeout: 15000,
      userAgent: "Custom/1.0",
      color: false,
    });
  });

  it("maps --site-type auto to null and keeps a real override", () => {
    expect(parseArgs(["example.com", "--site-type", "auto"]).options?.siteType).toBeNull();
    expect(parseArgs(["example.com", "-t", "local-business"]).options?.siteType).toBe(
      "local-business",
    );
  });

  it("can skip llms.txt link resolution and the live agent fetch", () => {
    const parsed = parseArgs(["example.com", "--no-resolve-links", "--no-agent-fetch"]);
    expect(parsed.options?.resolveLinks).toBe(false);
    expect(parsed.options?.agentFetch).toBe(false);
  });

  it("collects repeatable request headers", () => {
    const parsed = parseArgs([
      "example.com",
      "--header",
      "x-vercel-protection-bypass: secret",
      "--header=x-custom: value",
    ]);
    expect(parsed.options?.headers).toEqual({
      "x-vercel-protection-bypass": "secret",
      "x-custom": "value",
    });
  });

  it("reads help and version without requiring a URL", () => {
    expect(parseArgs(["--help"])).toMatchObject({ help: true, options: null });
    expect(parseArgs(["--version"])).toMatchObject({ version: true, options: null });
  });

  it("rejects missing values, unknown flags and multiple URLs", () => {
    expect(() => parseArgs(["example.com", "--format"])).toThrow(CliUsageError);
    expect(() => parseArgs(["example.com", "--wat"])).toThrow(/Unknown option/);
    expect(() => parseArgs(["a.com", "b.com"])).toThrow(/one URL/);
    expect(() => parseArgs([])).toThrow(/Missing target URL/);
  });
});

describe("value parsers", () => {
  it("validates formats", () => {
    expect(parseFormat("SUMMARY")).toBe("summary");
    expect(parseFormat("brief")).toBe("brief");
    expect(() => parseFormat("xml")).toThrow(/Unknown format/);
  });

  it("validates scores", () => {
    expect(parseScore("0")).toBe(0);
    expect(parseScore("100")).toBe(100);
    expect(() => parseScore("101")).toThrow(CliUsageError);
    expect(() => parseScore("7.5")).toThrow(CliUsageError);
  });

  it("validates grades", () => {
    expect(parseGrade("b")).toBe("B");
    expect(() => parseGrade("Z")).toThrow(/min-grade/);
  });

  it("validates site types", () => {
    expect(parseSiteType("docs")).toBe("docs");
    expect(() => parseSiteType("forum")).toThrow(/Unknown site type/);
  });

  it("validates timeouts", () => {
    expect(parseTimeout("10000")).toBe(10000);
    expect(() => parseTimeout("10")).toThrow(/timeout/);
    expect(() => parseTimeout("999999")).toThrow(/timeout/);
  });

  it("validates request headers", () => {
    expect(parseHeader("x-vercel-protection-bypass: secret")).toEqual([
      "x-vercel-protection-bypass",
      "secret",
    ]);
    expect(() => parseHeader("missing-colon")).toThrow(/Name: value/);
    expect(() => parseHeader(": secret")).toThrow(/invalid name/);
    expect(() => parseHeader("x-empty:")).toThrow(/needs a value/);
  });
});
