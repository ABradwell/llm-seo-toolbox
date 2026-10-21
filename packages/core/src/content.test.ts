import { describe, expect, it } from "vitest";

import { buildContentModel, SNR_PASS } from "./content";

function filler(word: string, times: number): string {
  return Array.from({ length: times }, () => word).join(" ");
}

const BODY_COPY = filler("prose", 120);

const PAGE = `<!doctype html>
<html lang="en">
  <head>
    <title>Test page</title>
    <style>.hero { color: red; } .hero .title { font-size: 4rem; }</style>
    <script>window.__DATA__ = {"a":1};</script>
  </head>
  <body>
    <header>
      <h1>Site name</h1>
      <nav><h3>Navigation</h3><a href="/docs">Docs</a></nav>
    </header>
    <main>
      <h1>Real page title</h1>
      <p>${BODY_COPY}</p>
      <nav class="toc"><h3>On this page</h3><a href="#one">One</a></nav>
      <article>
        <header><h2>Article title</h2></header>
        <p>Article body copy.</p>
        <script type="application/ld+json">{"@context":"https://schema.org"}</script>
      </article>
    </main>
    <footer><h3>Footer</h3><p>Legal notices.</p></footer>
    <svg viewBox="0 0 10 10"><path d="M0 0 L10 10" /></svg>
    <div class="cookie-banner">We use cookies.</div>
  </body>
</html>`;

describe("buildContentModel", () => {
  it("reads the main element and drops chrome", () => {
    const model = buildContentModel(PAGE);

    expect(model.scopeSelector).toBe("main");
    expect(model.text).toContain("Real page title");
    expect(model.text).toContain("Article body copy.");
  });

  it("keeps article headers but removes navigation from the outline", () => {
    const model = buildContentModel(PAGE);

    expect(model.headings.map((heading) => `H${heading.level} ${heading.text}`)).toEqual([
      "H1 Real page title",
      "H2 Article title",
    ]);
  });

  it("excludes site chrome text from the measured content", () => {
    const model = buildContentModel(PAGE);

    for (const chrome of ["Site name", "Navigation", "Docs", "On this page", "Legal notices."]) {
      expect(model.text).not.toContain(chrome);
    }
  });

  it("excludes script, style and svg markup from both ratio inputs", () => {
    const model = buildContentModel(PAGE);

    expect(model.cleanHtml).not.toContain("color: red");
    expect(model.cleanHtml).not.toContain("window.__DATA__");
    expect(model.cleanHtml).not.toContain("<svg");

    expect(model.removed.nodes).toBe(1);
    expect(model.removed.landmarks).toBe(1);
    expect(model.noiseBytes).toBeGreaterThan(0);
    expect(model.noiseRatio).toBeGreaterThan(0);
    expect(model.noiseRatio).toBeLessThan(1);
  });

  it("drops consent banners and hidden nodes from the content", () => {
    const html = `<!doctype html><html><body><main>
      <h1>Title</h1>
      <p>${BODY_COPY}</p>
      <div class="cookie-banner">We use cookies.</div>
      <div aria-hidden="true">Decorative glyphs</div>
    </main></body></html>`;
    const model = buildContentModel(html);

    expect(model.removed.widgets).toBe(2);
    expect(model.text).not.toContain("We use cookies.");
    expect(model.text).not.toContain("Decorative glyphs");
  });

  it("reports readable text as a share of the cleaned scope markup", () => {
    const html = "<!doctype html><html><body><main><p>hello</p></main></body></html>";
    const model = buildContentModel(html);

    expect(model.scopeSelector).toBe("body");
    expect(model.cleanHtml).toBe("<main><p>hello</p></main>");
    expect(model.scopeBytes).toBe(Buffer.byteLength("<main><p>hello</p></main>", "utf8"));
    expect(model.textBytes).toBe(Buffer.byteLength("hello", "utf8"));
    expect(model.textRatio).toBeCloseTo(5 / 25, 5);
  });

  it("falls back to the document when the content scope is only a teaser", () => {
    const html = `<!doctype html><html><body>
      <main><h1>Hero</h1><p>Short teaser.</p></main>
      <section><h2>Real content</h2><p>${BODY_COPY}</p></section>
    </body></html>`;
    const model = buildContentModel(html);

    expect(model.scopeSelector).toBe("body");
    expect(model.text).toContain("Real content");
    expect(model.headings.map((heading) => heading.text)).toEqual(["Hero", "Real content"]);
  });

  it("picks the richest article when there is no main element", () => {
    const html = `<!doctype html><html><body>
      <article><h2>Card</h2><p>One line.</p></article>
      <article><h2>Feature story</h2><p>${BODY_COPY}</p></article>
    </body></html>`;
    const model = buildContentModel(html);

    expect(model.scopeSelector).toBe("article");
    expect(model.headings.map((heading) => heading.text)).toEqual(["Feature story"]);
  });

  it("reports the source line of each heading and the content scope", () => {
    const html = [
      "<!doctype html>",
      "<html>",
      "<body>",
      "<main>",
      "<h1>Title</h1>",
      `<p>${BODY_COPY}</p>`,
      "<h2>Section</h2>",
      "<h3>Subsection</h3>",
      "</main>",
      "</body>",
      "</html>",
    ].join("\n");
    const model = buildContentModel(html);

    expect(model.scopeSelector).toBe("main");
    expect(model.scopeLine).toBe(4);
    expect(model.headings).toEqual([
      { level: 1, text: "Title", line: 5 },
      { level: 2, text: "Section", line: 7 },
      { level: 3, text: "Subsection", line: 8 },
    ]);
  });

  it("computes SNR from content text versus chrome text", () => {
    const html = `<!doctype html><html><body>
      <header><h1>Brand</h1><nav>Home Docs Blog Pricing Login</nav></header>
      <main><h1>Deep dive</h1><p>${BODY_COPY}</p></main>
      <footer><p>Copyright 2026 Brand. All rights reserved. Privacy Terms.</p></footer>
    </body></html>`;
    const model = buildContentModel(html);

    expect(model.scopeSelector).toBe("main");
    expect(model.snrSignalChars).toBeGreaterThan(0);
    expect(model.snrNoiseChars).toBeGreaterThan(0);
    expect(model.snr).toBeCloseTo(
      model.snrSignalChars / (model.snrSignalChars + model.snrNoiseChars),
      6,
    );
    expect(model.snr).toBeGreaterThan(SNR_PASS);
  });

  it("drops below the pass threshold when navigation outweighs the content", () => {
    const chrome = filler("navigation", 800);
    const html = `<!doctype html><html><body>
      <main><h1>Short page</h1><p>${BODY_COPY}</p></main>
      <nav>${chrome}</nav>
    </body></html>`;
    const model = buildContentModel(html);

    expect(model.snr).toBeLessThan(SNR_PASS);
    expect(model.snrNoiseChars).toBeGreaterThan(model.snrSignalChars);
  });
});
