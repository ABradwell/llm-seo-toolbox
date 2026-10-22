import { appendFileSync } from "node:fs";

function delimiter(): string {
  return `ghadelimiter_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/** Writes a step output using the file command GitHub Actions expects. */
export function setOutput(
  name: string,
  value: string,
  env: Record<string, string | undefined> = process.env,
): void {
  const file = env.GITHUB_OUTPUT;
  if (!file) {
    console.log(`::set-output name=${name}::${value.replace(/\r?\n/g, "%0A")}`);
    return;
  }

  const marker = delimiter();
  appendFileSync(file, `${name}<<${marker}\n${value}\n${marker}\n`, "utf8");
}

/** Appends markdown to the workflow job summary. */
export function writeStepSummary(
  markdown: string,
  env: Record<string, string | undefined> = process.env,
): void {
  const file = env.GITHUB_STEP_SUMMARY;
  if (!file) return;
  appendFileSync(file, `${markdown.trimEnd()}\n\n`, "utf8");
}
