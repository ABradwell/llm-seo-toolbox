import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./security", () => {
  class UnsafeUrlError extends Error {}
  return {
    assertSafeUrl: async (input: string | URL) => new URL(String(input)),
    UnsafeUrlError,
  };
});

vi.mock("./fetch-page", () => {
  const origin = "https://example.com";
  const paths = [
    "/docs/a",
    "/docs/app",
    "/guides/a",
    "/integrations/a",
    "/pricing",
    "/blog/a",
    "/about",
    "/contact",
    "/features",
    "/app",
  ];

  function goodHtml(path: string): string {
    const title = path === "/" ? "Example home" : `Example ${path}`;
    return `<!doctype html>
<html lang="en">
<head>
  <title>${title}</title>
  <meta name="description" content="A useful example site for the audit." />
  <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"SoftwareApplication","name":"Example"}
  </script>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <h2>What it does</h2>
    <p>${"Readable server-rendered prose for agents. ".repeat(30)}</p>
  </main>
</body>
</html>`;
  }

  function badHtml(): string {
    return `<!doctype html>
<html lang="en">
<head><title>Broken focus page</title></head>
<body><main><h3>No top-level heading</h3><p>Short.</p></main></body>
</html>`;
  }

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((path) => `  <url><loc>${origin}${path}</loc></url>`).join("\n")}
</urlset>`;

  function outcome(
    input: string | URL,
    body: string,
    options: { status?: number; contentType?: string } = {},
  ) {
    const url = new URL(String(input));
    const status = options.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      finalUrl: url.toString(),
      contentType: options.contentType ?? "text/html; charset=utf-8",
      headers: { "content-type": options.contentType ?? "text/html; charset=utf-8" },
      bytes: body.length,
      body,
      truncated: false,
      error: null,
      unsafe: false,
    };
  }

  function notFound(input: string | URL) {
    return {
      ...outcome(input, "", { status: 404, contentType: "text/plain" }),
      ok: false,
    };
  }

  return {
    fetchText: async (input: string | URL) => {
      const url = new URL(String(input));
      const path = url.pathname;

      if (path === "/robots.txt") {
        return outcome(input, "User-agent: *\nAllow: /\n", { contentType: "text/plain" });
      }
      if (path === "/sitemap.xml") {
        return outcome(input, sitemap, { contentType: "application/xml" });
      }
      if (path === "/llms.txt" || path === "/llms-full.txt") {
        return notFound(input);
      }
      if (
        path.startsWith("/.well-known/") ||
        path === "/openapi.json" ||
        path === "/openapi.yaml"
      ) {
        return notFound(input);
      }
      if (path === "/sitemap_index.xml") {
        return notFound(input);
      }

      if (path === "/docs/app") {
        return outcome(input, badHtml());
      }
      if (path === "/" || paths.includes(path)) {
        return outcome(input, goodHtml(path));
      }
      return notFound(input);
    },
  };
});

import { analyzeSite, clearAuditCache } from "./analyzer";
import { PAGE_CHECK_IDS, SITE_CHECK_IDS } from "./plain-language";

describe("analyzeSite site scope", () => {
  beforeEach(() => {
    clearAuditCache();
  });

  it("keeps the site score and sample independent of the focus path", async () => {
    const root = await analyzeSite("https://example.com/");
    clearAuditCache();
    const focus = await analyzeSite("https://example.com/docs/app");

    expect(root.scope).toBe("site");
    expect(focus.scope).toBe("site");
    expect(focus.finalUrl).toBe("https://example.com/");
    expect(focus.focusUrl).toBe("https://example.com/docs/app");
    expect(focus.coverage.sampleSize).toBe(8);
    expect(focus.pageResults.map((page) => page.url)).toEqual(
      root.pageResults.map((page) => page.url),
    );
    expect(focus.score).toBe(root.score);
    expect(focus.pageResults.map((page) => page.finalUrl)).not.toContain(
      "https://example.com/docs/app",
    );
    expect(focus.focusPage.url).toBe("https://example.com/docs/app");
    expect(focus.focusPage.source).toBe("focus");
    expect(focus.focusPage.score).toBeLessThan(focus.score);
    expect(focus.meta.sampledPageCount).toBe(8);
    expect(focus.meta.discoveredPageCount).toBe(11);
  });

  it("serves a cached site base while resolving a new focus page", async () => {
    const first = await analyzeSite("https://example.com/");
    const second = await analyzeSite("https://example.com/docs/app");

    expect(first.meta.cached).toBe(false);
    expect(second.meta.siteCached).toBe(true);
    expect(second.meta.focusCached).toBe(false);
    expect(second.score).toBe(first.score);
  });

  it("keeps page scope on the entered page and the old score shape", async () => {
    const page = await analyzeSite("https://example.com/docs/app", { scope: "page" });

    expect(page.scope).toBe("page");
    expect(page.finalUrl).toBe("https://example.com/");
    expect(page.focusUrl).toBe("https://example.com/docs/app");
    expect(page.pageResults).toHaveLength(1);
    expect(page.pageResults[0].url).toBe("https://example.com/docs/app");
    expect(page.pageResults[0].source).toBe("focus");
    expect(page.focusPage.url).toBe("https://example.com/docs/app");
    expect(page.coverage.method).toBe("page");
    expect(page.coverage.sampleSize).toBe(1);
  });

  it("only emits check ids that have plain-language copy", async () => {
    const known = new Set([...SITE_CHECK_IDS, ...PAGE_CHECK_IDS]);
    for (const scope of ["site", "page"] as const) {
      const result = await analyzeSite("https://example.com/", { scope });
      const ids = result.pillars.flatMap((pillar) => pillar.checks.map((entry) => entry.id));
      expect(
        ids.filter((id) => !known.has(id)),
        scope,
      ).toEqual([]);
      expect(new Set(ids).size, scope).toBe(known.size);
    }
  });
});
