import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CliUsageError } from "./args";
import { loadConfig, mergeOptions } from "./config";

const directories: string[] = [];

function tempDir(): string {
  const directory = mkdtempSync(join(tmpdir(), "llmseo-config-"));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  while (directories.length > 0) {
    const directory = directories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

describe("loadConfig", () => {
  it("discovers the default config file in the working directory", () => {
    const directory = tempDir();
    writeFileSync(
      join(directory, "llm-seo-toolbox.config.json"),
      JSON.stringify({ minScore: 80, minGrade: "b", format: "summary" }),
    );

    const loaded = loadConfig(undefined, directory);
    expect(loaded.path).toBe(join(directory, "llm-seo-toolbox.config.json"));
    expect(loaded.config).toEqual({ minScore: 80, minGrade: "B", format: "summary" });
    expect(loaded.warnings).toEqual([]);
  });

  it("accepts kebab-case keys and maps siteType auto to null", () => {
    const directory = tempDir();
    writeFileSync(
      join(directory, ".llmseotoolboxrc"),
      JSON.stringify({
        "min-score": 60,
        "min-grade": "c",
        "site-type": "auto",
        "user-agent": "Custom/1.0",
        "resolve-links": false,
        "agent-fetch": false,
      }),
    );

    const loaded = loadConfig(undefined, directory);
    expect(loaded.config).toMatchObject({
      minScore: 60,
      minGrade: "C",
      siteType: null,
      userAgent: "Custom/1.0",
      resolveLinks: false,
      agentFetch: false,
    });
  });

  it("warns about unknown keys instead of failing", () => {
    const directory = tempDir();
    writeFileSync(
      join(directory, "llm-seo-toolbox.config.json"),
      JSON.stringify({ minScore: 70, somethingElse: true }),
    );

    const loaded = loadConfig(undefined, directory);
    expect(loaded.warnings[0]).toContain("somethingElse");
  });

  it("fails when an explicit config path does not exist", () => {
    const directory = tempDir();
    expect(() => loadConfig("nope.json", directory)).toThrow(CliUsageError);
  });

  it("fails on malformed JSON and invalid values", () => {
    const directory = tempDir();
    writeFileSync(join(directory, "llm-seo-toolbox.config.json"), "{ not json");
    expect(() => loadConfig(undefined, directory)).toThrow(/Could not read/);

    writeFileSync(
      join(directory, "llm-seo-toolbox.config.json"),
      JSON.stringify({ minGrade: "Z" }),
    );
    expect(() => loadConfig(undefined, directory)).toThrow(/min-grade/);
  });

  it("returns an empty config when nothing is found", () => {
    const directory = tempDir();
    const loaded = loadConfig(undefined, directory);
    expect(loaded.path).toBeNull();
    expect(loaded.config).toEqual({});
  });
});

describe("mergeOptions", () => {
  it("lets CLI flags win over config values", () => {
    const merged = mergeOptions(
      { minScore: 60, format: "table", verbose: false },
      { minScore: 90, verbose: true },
    );
    expect(merged.minScore).toBe(90);
    expect(merged.format).toBe("table");
    expect(merged.verbose).toBe(true);
  });

  it("keeps an explicit auto site type", () => {
    const merged = mergeOptions({ siteType: "docs" }, { siteType: null });
    expect(merged.siteType).toBeNull();
  });

  it("merges the probe toggles", () => {
    const merged = mergeOptions({ resolveLinks: true, agentFetch: true }, { agentFetch: false });
    expect(merged.resolveLinks).toBe(true);
    expect(merged.agentFetch).toBe(false);
  });
});
