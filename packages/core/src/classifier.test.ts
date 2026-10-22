import { describe, expect, it } from "vitest";

import { classifySite, type ClassificationInput } from "./classifier";

function site(overrides: Partial<ClassificationInput> = {}): ClassificationInput {
  return {
    finalUrl: "https://example.com/",
    html: "<html><body><main><h1>Example</h1><p>A small page.</p></main></body></html>",
    title: "Example",
    description: "",
    jsonLdTypes: [],
    sitemapUrls: [],
    navUrls: [],
    ...overrides,
  };
}

const docsSite = site({
  finalUrl: "https://docs.python.org/3/",
  title: "Python 3 documentation",
  description: "The official Python documentation and language reference.",
  ogType: "article",
  jsonLdTypes: ["TechArticle"],
  sitemapUrls: ["/3/library/", "/3/reference/", "/3/tutorial/", "/3/using/"],
  html: `<html><body><main>
    <h1>Python documentation</h1>
    <pre><code>import sys</code></pre>
    <pre><code>print("hello")</code></pre>
  </main></body></html>`,
});

describe("classifySite", () => {
  it("classifies a documentation site", () => {
    const result = classifySite(docsSite);
    expect(result.type).toBe("docs");
    expect(result.label).toBe("Documentation");
    expect(result.confidence).toBeGreaterThanOrEqual(70);
    expect(result.alternatives).toHaveLength(6);
    expect(result.alternatives[0]).toMatchObject({
      type: "docs",
      confidence: result.confidence,
    });
    expect(result.alternatives.every((option) => option.confidence <= result.confidence)).toBe(
      true,
    );
    expect(result.signals.some((signal) => signal.label.includes("TechArticle"))).toBe(true);
  });

  it("classifies a SaaS product", () => {
    const result = classifySite(
      site({
        finalUrl: "https://linear.app/",
        title: "Linear – The product development platform",
        description: "Plan and build products with focused software.",
        jsonLdTypes: ["SoftwareApplication"],
        sitemapUrls: ["/pricing", "/features", "/integrations", "/changelog", "/customers"],
        html: '<html><body><a href="/signup">Start free trial</a><p>Trusted by teams.</p></body></html>',
        hasOpenApi: true,
      }),
    );

    expect(result.type).toBe("saas");
    expect(result.confidence).toBeGreaterThanOrEqual(60);
    expect(result.compatibility.openApiScored).toBe(true);
  });

  it("classifies an e-commerce store", () => {
    const result = classifySite(
      site({
        finalUrl: "https://shop.acme.com/",
        title: "Acme Shop — free shipping on every order",
        description: "Buy now from the Acme store.",
        ogType: "product",
        jsonLdTypes: ["Product", "Offer"],
        sitemapUrls: ["/products/widget", "/collections/all", "/cart", "/checkout"],
        html: '<html><body><button data-product="widget">Add to cart</button></body></html>',
      }),
    );

    expect(result.type).toBe("ecommerce");
    expect(result.compatibility.openApiScored).toBe(false);
  });

  it("classifies a portfolio", () => {
    const result = classifySite(
      site({
        finalUrl: "https://portfolio.janedoe.com/",
        title: "Jane Doe — Designer & Photographer",
        description: "Selected work and case studies.",
        jsonLdTypes: ["Person"],
        sitemapUrls: ["/work", "/projects", "/case-studies", "/about"],
        html: "<html><body><h2>Selected work</h2><a href='/work/one'>Project</a></body></html>",
      }),
    );

    expect(result.type).toBe("portfolio");
    expect(result.compatibility.recommendedSchema).toContain("Person");
  });

  it("classifies a local business", () => {
    const result = classifySite(
      site({
        finalUrl: "https://joespizza.com/",
        title: "Joe's Pizza | Restaurant in Austin",
        description: "A family-run restaurant serving the neighbourhood.",
        jsonLdTypes: ["Restaurant"],
        sitemapUrls: ["/menu", "/locations", "/hours", "/reviews"],
        html: "<html><body><address>1 Main St, Austin</address><a href='tel:+15125550100'>Call</a></body></html>",
      }),
    );

    expect(result.type).toBe("local-business");
    expect(result.compatibility.recommendedSchema).toContain("LocalBusiness");
  });

  it("classifies a news site", () => {
    const result = classifySite(
      site({
        finalUrl: "https://news.example.com/",
        title: "The Daily Ledger — News and analysis",
        description: "Independent journalism and editorial reporting.",
        ogType: "article",
        jsonLdTypes: ["NewsArticle"],
        sitemapUrls: ["/news", "/articles", "/author/avery", "/podcast"],
        html: "<html><body><article><time>Today</time></article><article><time>Yesterday</time></article></body></html>",
      }),
    );

    expect(result.type).toBe("blog-media");
    expect(result.compatibility.recommendedSchema).toContain("NewsArticle");
  });

  it("retains the detected profile when the user overrides it", () => {
    const result = classifySite(docsSite, { override: "saas" });

    expect(result.type).toBe("saas");
    expect(result.method).toBe("override");
    expect(result.confidence).toBe(100);
    expect(result.detected.type).toBe("docs");
    expect(result.detected.confidence).toBeGreaterThan(0);
    expect(result.alternatives[0]).toMatchObject({
      type: "docs",
      confidence: result.detected.confidence,
    });
    expect(result.compatibility.openApiScored).toBe(true);
    expect(result.signals.some((signal) => signal.type === "docs")).toBe(true);
  });

  it("falls back to SaaS with low confidence when there are no signals", () => {
    const result = classifySite(site());

    expect(result.type).toBe("saas");
    expect(result.method).toBe("heuristic");
    expect(result.confidence).toBe(15);
    expect(result.alternatives).toHaveLength(6);
    expect(result.alternatives.every((option) => option.confidence === 15)).toBe(true);
    expect(result.alternatives.map((option) => option.type)).toEqual([
      "saas",
      "portfolio",
      "docs",
      "ecommerce",
      "local-business",
      "blog-media",
    ]);
    expect(result.signals[0]?.source).toBe("fallback");
  });
});
