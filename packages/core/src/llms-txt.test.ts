import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  validateLlmsTxt,
  extractLlmsTxtLinks,
  llmsTxtCoverage,
  resolveLlmsTxtLinks,
} from "./llms-txt";

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

describe("extractLlmsTxtLinks", () => {
  it("resolves relative links and records their section and line", () => {
    const links = extractLlmsTxtLinks(
      "# Example\n\n## Docs\n- [Start](/docs/start)\n- [API](https://example.com/docs/api)\n",
      "https://example.com/",
    );

    expect(links).toEqual([
      { url: "https://example.com/docs/start", label: "Start", section: "Docs", line: 4 },
      { url: "https://example.com/docs/api", label: "API", section: "Docs", line: 5 },
    ]);
  });

  it("skips anchors and non-HTTP schemes", () => {
    const links = extractLlmsTxtLinks(
      [
        "# Example",
        "- [Mail](mailto:hi@example.com)",
        "- [Phone](tel:+10000000000)",
        "- [Anchor](#docs)",
        "- [Script](javascript:alert(1))",
        "- [Real](https://example.com/real)",
      ].join("\n"),
      "https://example.com/",
    );

    expect(links.map((link) => link.url)).toEqual(["https://example.com/real"]);
    expect(links[0].section).toBeNull();
  });
});

describe("llmsTxtCoverage", () => {
  const links = extractLlmsTxtLinks(
    [
      "# Example",
      "- [Home](https://example.com/)",
      "- [Start](https://example.com/docs/start/)",
      "- [Off-site](https://other.example/page)",
    ].join("\n"),
    "https://example.com/",
  );

  it("measures sampled-page and sitemap coverage", () => {
    const coverage = llmsTxtCoverage(
      links,
      ["https://example.com", "https://example.com/docs/start"],
      ["https://example.com/", "https://example.com/docs/start", "https://example.com/docs/api"],
    );

    expect(coverage.sampled).toBe(100);
    expect(coverage.sitemap).toBe(67);
  });

  it("normalises trailing slashes and fragments", () => {
    const coverage = llmsTxtCoverage(
      extractLlmsTxtLinks("- [Start](https://example.com/docs/start/#top)", "https://example.com/"),
      ["https://example.com/docs/start"],
      ["https://example.com/docs/start/"],
    );

    expect(coverage).toEqual({ sampled: 100, sitemap: 100 });
  });

  it("returns zero for empty inputs", () => {
    expect(llmsTxtCoverage([], [], [])).toEqual({ sampled: 0, sitemap: 0 });
    expect(llmsTxtCoverage(links, [], ["https://example.com/"])).toEqual({
      sampled: 0,
      sitemap: 33,
    });
  });
});

describe("resolveLlmsTxtLinks", () => {
  const links = extractLlmsTxtLinks(
    [
      "# Example",
      "## Docs",
      "- [Start](https://example.com/docs/start)",
      "- [API](https://example.com/docs/api)",
      "- [Third](https://example.com/docs/third)",
      "## Blog",
      "- [Post](https://example.com/blog/post)",
      "- [News](https://example.com/blog/news)",
      "## More",
      "- [About](https://example.com/about)",
    ].join("\n"),
    "https://example.com/",
  );

  it("HEAD-checks at most two links per section", async () => {
    const checked: string[] = [];
    const head = async (url: string | URL) => {
      checked.push(String(url));
      return { ok: true, status: 200, finalUrl: String(url), error: null };
    };

    const results = await resolveLlmsTxtLinks(links, {
      origin: "https://example.com",
      head,
    });

    expect(results).toHaveLength(5);
    expect(checked).toEqual([
      "https://example.com/docs/start",
      "https://example.com/docs/api",
      "https://example.com/blog/post",
      "https://example.com/blog/news",
      "https://example.com/about",
    ]);
  });

  it("marks broken links as not ok", async () => {
    const head = async (url: string | URL) => ({
      ok: false,
      status: 404,
      finalUrl: String(url),
      error: "Not found",
    });

    const results = await resolveLlmsTxtLinks([links[0]], {
      origin: "https://example.com",
      head,
    });

    expect(results[0]).toMatchObject({
      url: "https://example.com/docs/start",
      status: 404,
      ok: false,
      offOrigin: false,
      error: "Not found",
    });
  });

  it("flags an undeclared off-origin redirect", async () => {
    const head = async () => ({
      ok: true,
      status: 200,
      finalUrl: "https://other.example/docs/start",
      error: null,
    });

    const results = await resolveLlmsTxtLinks([links[0]], {
      origin: "https://example.com",
      head,
    });

    expect(results[0].offOrigin).toBe(true);
    expect(results[0].ok).toBe(false);
  });

  it("passes the audited origin so external links can drop bypass headers", async () => {
    const calls: Array<{ url: string; headersOrigin?: string }> = [];
    const head = async (url: string | URL, options: { headersOrigin?: string } = {}) => {
      calls.push({ url: String(url), headersOrigin: options.headersOrigin });
      return {
        ok: true,
        status: 200,
        finalUrl: String(url),
        error: null,
      };
    };
    const external = extractLlmsTxtLinks(
      "## External resources\n- [Partner](https://partner.example/docs)",
      "https://example.com/",
    );

    await resolveLlmsTxtLinks(external, {
      origin: "https://example.com",
      headers: { "x-vercel-protection-bypass": "secret" },
      headersOrigin: "https://example.com",
      head,
    });

    expect(calls[0]).toEqual({
      url: "https://partner.example/docs",
      headersOrigin: "https://example.com",
    });
  });

  it("accepts an off-origin link declared as external", async () => {
    const external = extractLlmsTxtLinks(
      "## External resources\n- [Partner](https://partner.example/docs)",
      "https://example.com/",
    );
    const head = async () => ({
      ok: true,
      status: 200,
      finalUrl: "https://partner.example/docs",
      error: null,
    });

    const results = await resolveLlmsTxtLinks(external, {
      origin: "https://example.com",
      head,
    });

    expect(results[0]).toMatchObject({
      offOrigin: false,
      declaredExternal: true,
      ok: true,
    });
  });
});
