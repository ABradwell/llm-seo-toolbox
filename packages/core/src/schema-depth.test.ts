import { describe, expect, it } from "vitest";

import {
  isSchemaType,
  matchesAnyType,
  placeholderFor,
  schemaTableFor,
  scoreSchemaDepth,
} from "./schema-depth";
import type { StructuredDataReport, StructuredDataNode } from "./structured-data";

function node(
  types: string[],
  properties: Record<string, unknown>,
  format: StructuredDataNode["format"] = "json-ld",
): StructuredDataNode {
  return { types, properties, format, line: 1 };
}

function report(nodes: StructuredDataNode[]): StructuredDataReport {
  return {
    valid: nodes.filter((entry) => entry.format === "json-ld").length,
    invalid: 0,
    types: [...new Set(nodes.flatMap((entry) => entry.types))],
    blocks: [],
    firstValidLine: null,
    firstBlockLine: null,
    nodes,
    formats: {
      "json-ld": nodes.filter((entry) => entry.format === "json-ld").length,
      microdata: nodes.filter((entry) => entry.format === "microdata").length,
      rdfa: nodes.filter((entry) => entry.format === "rdfa").length,
    },
  };
}

describe("isSchemaType", () => {
  it("matches exact types case-insensitively", () => {
    expect(isSchemaType("Article", "Article")).toBe(true);
    expect(isSchemaType("article", "Article")).toBe(true);
    expect(isSchemaType("Person", "Organization")).toBe(false);
  });

  it("accepts the subtype families the profiles expect", () => {
    expect(isSchemaType("NewsArticle", "Article")).toBe(true);
    expect(isSchemaType("BlogPosting", "Article")).toBe(true);
    expect(isSchemaType("Restaurant", "LocalBusiness")).toBe(true);
    expect(isSchemaType("WebApplication", "SoftwareApplication")).toBe(true);
    expect(isSchemaType("APIReference", "TechArticle")).toBe(true);
    expect(isSchemaType("ProductGroup", "Product")).toBe(true);
  });
});

describe("matchesAnyType", () => {
  it("returns the first matching type", () => {
    expect(matchesAnyType(["WebPage", "NewsArticle"], ["Article"])).toBe("NewsArticle");
    expect(matchesAnyType(["WebPage"], ["Article"])).toBeNull();
  });
});

describe("schemaTableFor", () => {
  it("prefers the most specific table", () => {
    expect(schemaTableFor(["FAQPage"])?.key).toBe("FAQPage");
    expect(schemaTableFor(["TechArticle"])?.key).toBe("TechArticle");
    expect(schemaTableFor(["NewsArticle"])?.key).toBe("Article");
    expect(schemaTableFor(["Product"])?.key).toBe("Product");
    expect(schemaTableFor(["WebApplication"])?.key).toBe("SoftwareApplication");
    expect(schemaTableFor(["Restaurant"])?.key).toBe("LocalBusiness");
    expect(schemaTableFor(["Person"])?.key).toBe("Person");
    expect(schemaTableFor(["WebPage"])).toBeNull();
  });
});

describe("scoreSchemaDepth", () => {
  it("scores a complete Article node at 100%", () => {
    const result = scoreSchemaDepth(
      report([
        node(["NewsArticle"], {
          headline: "Hello",
          author: { "@type": "Person", name: "Ada" },
          datePublished: "2026-01-01",
          dateModified: "2026-02-01",
          publisher: { "@type": "Organization", name: "Example" },
        }),
      ]),
      ["Article"],
    );

    expect(result.type).toBe("Article");
    expect(result.percentage).toBe(100);
    expect(result.missing).toEqual([]);
  });

  it("lists the missing properties and their percentage", () => {
    const result = scoreSchemaDepth(
      report([node(["Product"], { name: "Widget", description: "A widget" })]),
      ["Product"],
    );

    expect(result.type).toBe("Product");
    expect(result.present).toEqual(["name", "description"]);
    expect(result.missing).toContain("offers.price");
    expect(result.missing).toContain("offers.priceCurrency");
    expect(result.percentage).toBe(33);
  });

  it("prefers a node that matches the profile over another known table", () => {
    const result = scoreSchemaDepth(
      report([
        node(["FAQPage"], {
          mainEntity: [
            {
              "@type": "Question",
              name: "What?",
              acceptedAnswer: { "@type": "Answer", text: "This." },
            },
          ],
        }),
        node(["Person"], {
          name: "Ada",
          jobTitle: "Engineer",
          url: "https://example.com",
          sameAs: ["https://example.com/social"],
        }),
      ]),
      ["Person"],
    );

    expect(result.type).toBe("Person");
    expect(result.percentage).toBe(100);
  });

  it("accepts proficiencyLevel or about for TechArticle", () => {
    const base = {
      headline: "Install",
      dateModified: "2026-01-01",
    };
    const withProficiency = scoreSchemaDepth(
      report([node(["TechArticle"], { ...base, proficiencyLevel: "Beginner" })]),
      ["TechArticle"],
    );
    const withAbout = scoreSchemaDepth(
      report([node(["APIReference"], { ...base, about: "Authentication" })]),
      ["TechArticle"],
    );
    const without = scoreSchemaDepth(report([node(["TechArticle"], base)]), ["TechArticle"]);

    expect(withProficiency.percentage).toBe(100);
    expect(withAbout.percentage).toBe(100);
    expect(without.missing).toEqual(["proficiencyLevel|about"]);
  });

  it("requires a complete Question and Answer pair for FAQPage", () => {
    const complete = scoreSchemaDepth(
      report([
        node(["FAQPage"], {
          mainEntity: [
            {
              "@type": "Question",
              name: "What is it?",
              acceptedAnswer: { "@type": "Answer", text: "A thing." },
            },
          ],
        }),
      ]),
      ["FAQPage"],
    );
    const incomplete = scoreSchemaDepth(
      report([
        node(["FAQPage"], {
          mainEntity: [{ "@type": "Question", name: "What is it?" }],
        }),
      ]),
      ["FAQPage"],
    );

    expect(complete.percentage).toBe(100);
    expect(incomplete.percentage).toBe(0);
  });

  it("returns an empty result when there is no structured data", () => {
    const result = scoreSchemaDepth(report([]), ["Article"]);

    expect(result.node).toBeNull();
    expect(result.type).toBeNull();
    expect(result.percentage).toBe(0);
    expect(result.missing).toEqual([]);
  });
});

describe("placeholderFor", () => {
  it("builds a complete FAQPage mainEntity", () => {
    expect(placeholderFor("mainEntity")).toEqual([
      {
        "@type": "Question",
        name: "A question your customers ask",
        acceptedAnswer: { "@type": "Answer", text: "A direct answer in one paragraph." },
      },
    ]);
  });

  it("uses typed placeholders for offers and dates", () => {
    expect(placeholderFor("offers.price")).toBe("0.00");
    expect(placeholderFor("offers.priceCurrency")).toBe("USD");
    expect(placeholderFor("offers.availability")).toBe("https://schema.org/InStock");
    expect(placeholderFor("dateModified")).toBe("2026-01-01T00:00:00.000Z");
    expect(placeholderFor("headline")).toBe("Your headline");
  });
});
