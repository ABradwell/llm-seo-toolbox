import * as cheerio from "cheerio";
import { describe, expect, it } from "vitest";

import { extractJsonLd, extractStructuredData, typeList } from "./structured-data";

describe("typeList", () => {
  it("accepts a string or an array of strings", () => {
    expect(typeList("Article")).toEqual(["Article"]);
    expect(typeList(["Article", 42, "Person"])).toEqual(["Article", "Person"]);
    expect(typeList(undefined)).toEqual([]);
  });
});

describe("extractStructuredData", () => {
  it("collects JSON-LD blocks and flattens @graph nodes", () => {
    const $ = cheerio.load(`<html><head>
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@graph": [
            { "@type": "Organization", "name": "Example" },
            { "@type": ["WebSite", "SoftwareApplication"], "name": "Example App" }
          ]
        }
      </script>
    </head></html>`);
    const report = extractStructuredData($);

    expect(report.valid).toBe(1);
    expect(report.invalid).toBe(0);
    expect(report.blocks[0].hasContext).toBe(true);
    expect(report.types).toEqual(["Organization", "WebSite", "SoftwareApplication"]);
    expect(report.nodes).toHaveLength(2);
    expect(report.nodes[0].properties.name).toBe("Example");
    expect(report.formats["json-ld"]).toBe(2);
  });

  it("counts invalid JSON-LD without losing valid blocks", () => {
    const $ = cheerio.load(`<html><head>
      <script type="application/ld+json">{ "broken": </script>
      <script type="application/ld+json">{ "@type": "Person", "name": "Ada" }</script>
    </head></html>`);
    const report = extractStructuredData($);

    expect(report.valid).toBe(1);
    expect(report.invalid).toBe(1);
    expect(report.types).toEqual(["Person"]);
    expect(report.blocks.map((block) => block.valid)).toEqual([false, true]);
  });

  it("reads microdata properties and nested scopes", () => {
    const $ = cheerio.load(`<div itemscope itemtype="https://schema.org/Product">
      <span itemprop="name">Widget</span>
      <div itemprop="offers" itemscope itemtype="https://schema.org/Offer">
        <meta itemprop="price" content="19.00" />
        <meta itemprop="priceCurrency" content="USD" />
      </div>
    </div>`);
    const report = extractStructuredData($);
    const product = report.nodes.find((node) => node.types.includes("Product"));
    const offer = report.nodes.find((node) => node.types.includes("Offer"));

    expect(product?.format).toBe("microdata");
    expect(product?.properties.name).toBe("Widget");
    expect(product?.properties.offers).toMatchObject({ price: "19.00", priceCurrency: "USD" });
    expect(offer?.properties.price).toBe("19.00");
    expect(report.formats.microdata).toBe(2);
  });

  it("reads RDFa types and properties", () => {
    const $ = cheerio.load(`<div vocab="https://schema.org/" typeof="Person">
      <span property="name">Ada Lovelace</span>
      <a property="url" href="https://example.com/ada">Profile</a>
    </div>`);
    const report = extractStructuredData($);

    expect(report.types).toContain("Person");
    expect(report.nodes[0].format).toBe("rdfa");
    expect(report.nodes[0].properties.name).toBe("Ada Lovelace");
    expect(report.nodes[0].properties.url).toBe("https://example.com/ada");
    expect(report.formats.rdfa).toBe(1);
  });

  it("combines formats into one type list and keeps JSON-LD counters", () => {
    const $ = cheerio.load(`<html><head>
      <script type="application/ld+json">{ "@type": "Article", "headline": "Hi" }</script>
    </head><body>
      <div itemscope itemtype="https://schema.org/Person"><span itemprop="name">Ada</span></div>
      <div typeof="Organization"><span property="name">Example</span></div>
    </body></html>`);
    const report = extractStructuredData($);
    const jsonLd = extractJsonLd($);

    expect(new Set(report.types)).toEqual(new Set(["Article", "Person", "Organization"]));
    expect(report.formats).toEqual({ "json-ld": 1, microdata: 1, rdfa: 1 });
    expect(jsonLd.types).toEqual(["Article"]);
    expect(jsonLd.valid).toBe(1);
  });

  it("returns an empty report for a page without structured data", () => {
    const report = extractStructuredData(cheerio.load("<html><body><p>Hello</p></body></html>"));

    expect(report.valid).toBe(0);
    expect(report.invalid).toBe(0);
    expect(report.types).toEqual([]);
    expect(report.nodes).toEqual([]);
    expect(report.firstValidLine).toBeNull();
    expect(report.firstBlockLine).toBeNull();
  });
});
