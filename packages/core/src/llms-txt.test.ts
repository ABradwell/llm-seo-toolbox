import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { validateLlmsTxt } from "./llms-txt";

const VALID = `# Example Docs

> Everything developers need to build with Example.

## Documentation
- [Getting started](https://example.com/docs/start)
- [API reference](https://example.com/docs/api)

## Optional
- [Contact](https://example.com/contact)
`;

describe("validateLlmsTxt", () => {
  it("accepts the llmstxt.org structure", () => {
    const result = validateLlmsTxt(VALID);

    expect(result.valid).toBe(true);
    expect(result.h1).toBe("Example Docs");
    expect(result.h1Line).toBe(1);
    expect(result.summaryLine).toBe(3);
    expect(result.sections.map((section) => section.title)).toEqual(["Documentation", "Optional"]);
    expect(result.linkCount).toBe(3);
    expect(result.firstLinkLine).toBe(6);
    expect(result.paginated).toBe(false);
    expect(result.issues).toHaveLength(0);
  });

  it("fails when the H1 is missing", () => {
    const result = validateLlmsTxt(
      "> A summary\n\n## Docs\n- [Start](https://example.com/start)\n",
    );

    expect(result.valid).toBe(false);
    expect(result.h1Line).toBeNull();
    expect(result.issues.some((issue) => issue.code === "missing_h1")).toBe(true);
  });

  it("fails when there is no markdown index", () => {
    const result = validateLlmsTxt("# Example\n\n> A summary.\n");

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "no_links")).toBe(true);
  });

  it("warns about a missing summary without invalidating the manifest", () => {
    const result = validateLlmsTxt("# Example\n\n## Docs\n- [Start](https://example.com/start)\n");

    expect(result.valid).toBe(true);
    expect(result.hasSummary).toBe(false);
    expect(result.issues.some((issue) => issue.code === "missing_summary")).toBe(true);
  });

  it("flags pagination markers in a bundle", () => {
    const result = validateLlmsTxt(
      "# Example\n\n> Summary.\n\n## Docs\n- [Page 2](https://example.com/docs?page=2)\n",
    );

    expect(result.paginated).toBe(true);
    expect(result.issues.some((issue) => issue.code === "paginated")).toBe(true);
  });

  it("warns about a second H1", () => {
    const result = validateLlmsTxt(
      "# Example\n\n> Summary.\n\n# Second title\n\n- [Start](https://example.com/start)\n",
    );

    expect(result.h1Count).toBe(2);
    expect(result.issues.some((issue) => issue.code === "multiple_h1")).toBe(true);
  });

  it("ships a valid manifest for this site", () => {
    const manifest = readFileSync(resolve(process.cwd(), "public/llms.txt"), "utf8");
    const result = validateLlmsTxt(manifest);

    expect(result.valid).toBe(true);
    expect(result.h1).toBe("LLMReady");
    expect(result.linkCount).toBeGreaterThanOrEqual(5);
    expect(result.issues.filter((issue) => issue.severity === "error")).toHaveLength(0);
  });

  it("ships an unpaginated full bundle", () => {
    const bundle = readFileSync(resolve(process.cwd(), "public/llms-full.txt"), "utf8");
    const result = validateLlmsTxt(bundle);

    expect(result.paginated).toBe(false);
    expect(result.linkCount).toBe(0);
    expect(result.lines).toBeGreaterThan(40);
  });
});
