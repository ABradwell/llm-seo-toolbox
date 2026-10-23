import { describe, expect, it } from "vitest";

import type { AuditPage } from "./types";

import { analyzePage, extractJsonLd, failedPage } from "./page-audit";
import * as cheerio from "cheerio";

const page: AuditPage = {
  url: "https://example.com/app",
  label: "App",
  section: "Pages",
  source: "sitemap",
};

function html(input: {
  meta?: string;
  headings?: string;
  jsonLd?: unknown;
  body?: string;
}): string {
  const jsonLd =
    input.jsonLd === undefined
      ? ""
      : `<script type="application/ld+json">${JSON.stringify(input.jsonLd)}</script>`;
  return `<!doctype html>
<html lang="en">
<head>
  <title>Example app</title>
  ${input.meta ? `<meta name="robots" content="${input.meta}" />` : ""}
  ${jsonLd}
</head>
<body>
  <main>
    ${input.headings ?? "<h1>Example app</h1><h2>Features</h2>"}
    <p>${input.body ?? "A".repeat(800)}</p>
  </main>
</body>
</html>`;
}

function check(result: ReturnType<typeof analyzePage>, id: string) {
  const found = result.checks.find((entry) => entry.id === id);
  if (!found) throw new Error(`No check ${id}`);
  return found;
}

describe("analyzePage", () => {
  it("scores page-level checks and records evidence on the page path", () => {
    const result = analyzePage({
      page,
      html: html({
        jsonLd: {
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Example",
        },
      }),
      headers: {},
      recommendedSchema: ["SoftwareApplication"],
      profileLabel: "SaaS",
      profileType: "saas",
    });

    expect(result.outcome).toBe("analyzed");
    expect(result.checks.map((entry) => entry.id)).toEqual([
      "meta-robots",
      "x-robots-tag",
      "h1",
      "heading-order",
      "snr",
      "ssr-content",
      "faq-content",
      "answer-first",
      "section-chunks",
      "page-metadata",
      "image-alt",
      "citable-evidence",
      "json-ld",
      "schema-types",
      "schema-depth",
      "breadcrumbs",
      "freshness",
      "canonical",
    ]);
    expect(result.checks.every((entry) => entry.scope === "page")).toBe(true);
    expect(check(result, "h1").status).toBe("pass");
    expect(check(result, "h1").evidence?.file).toBe("/app");
    expect(check(result, "json-ld").status).toBe("pass");
    expect(check(result, "schema-types").status).toBe("pass");
    expect(check(result, "canonical").status).toBe("warn");
    expect(check(result, "freshness").status).toBe("info");
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.grade).toBe("B");
  });

  it("marks blocking robots directives as failures", () => {
    const result = analyzePage({
      page,
      html: html({ meta: "noindex, nofollow" }),
      headers: { "x-robots-tag": "noai" },
      recommendedSchema: ["SoftwareApplication"],
      profileLabel: "SaaS",
      profileType: "saas",
    });

    expect(check(result, "meta-robots").status).toBe("fail");
    expect(check(result, "x-robots-tag").status).toBe("fail");
  });

  it("warns when headings skip a level", () => {
    const result = analyzePage({
      page,
      html: html({ headings: "<h1>Example app</h1><h3>Deep section</h3>" }),
      headers: {},
      recommendedSchema: ["SoftwareApplication"],
      profileLabel: "SaaS",
      profileType: "saas",
    });

    expect(check(result, "h1").status).toBe("pass");
    expect(check(result, "heading-order").status).toBe("warn");
  });
});

describe("extractJsonLd", () => {
  it("counts valid and invalid blocks and collects nested types", () => {
    const $ = cheerio.load(`
      <script type="application/ld+json">
        {"@context":"https://schema.org","@graph":[{"@type":"WebSite"},{"@type":"TechArticle"}]}
      </script>
      <script type="application/ld+json">{ nope }</script>
    `);
    const report = extractJsonLd($);

    expect(report.valid).toBe(1);
    expect(report.invalid).toBe(1);
    expect(report.types).toEqual(expect.arrayContaining(["WebSite", "TechArticle"]));
  });
});

describe("failedPage", () => {
  it("represents an unreachable focus page without inventing checks", () => {
    const result = failedPage({
      url: "https://example.com/missing",
      outcome: "unreachable",
      error: "HTTP 404",
      fetchMs: 12,
    });

    expect(result.outcome).toBe("unreachable");
    expect(result.status).toBe("info");
    expect(result.checks).toEqual([]);
    expect(result.score).toBeNull();
    expect(result.error).toBe("HTTP 404");
  });
});
