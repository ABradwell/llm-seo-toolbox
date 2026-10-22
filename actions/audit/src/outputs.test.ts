import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { setOutput, writeStepSummary } from "./outputs";

const directories: string[] = [];

function tempFile(): string {
  const directory = mkdtempSync(join(tmpdir(), "llmseo-output-"));
  directories.push(directory);
  return join(directory, "outputs.txt");
}

afterEach(() => {
  while (directories.length > 0) {
    const directory = directories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

describe("setOutput", () => {
  it("writes single and multi-line values with delimiters", () => {
    const file = tempFile();
    setOutput("score", "88", { GITHUB_OUTPUT: file });
    setOutput("report-json", '{"a":1}\n{"b":2}', { GITHUB_OUTPUT: file });

    const content = readFileSync(file, "utf8");
    expect(content).toMatch(/score<<ghadelimiter_[\w]+\n88\n/);
    expect(content).toMatch(/report-json<<ghadelimiter_[\w]+\n\{"a":1\}\n\{"b":2\}\n/);
  });
});

describe("writeStepSummary", () => {
  it("appends markdown to the job summary", () => {
    const file = tempFile();
    writeStepSummary("## Report", { GITHUB_STEP_SUMMARY: file });
    writeStepSummary("More", { GITHUB_STEP_SUMMARY: file });

    expect(readFileSync(file, "utf8")).toBe("## Report\n\nMore\n\n");
  });

  it("does nothing without a summary file", () => {
    expect(() => writeStepSummary("## Report", {})).not.toThrow();
  });
});
