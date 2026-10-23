import { describe, expect, it } from "vitest";

import {
  breadcrumbLists,
  faqSchemaPairs,
  hasFaqSchema,
  identitySignals,
  nodesOfType,
  tokenOverlap,
  tokens,
} from "./entities";
import type { StructuredDataNode, StructuredDataReport } from "./structured-data";

function node(
  types: string[],
  properties: Record<string, unknown>,
  format: StructuredDataNode["format"] = "json-ld",
): StructuredDataNode {
  return { types, properties, format, line: 1 };
}

function report(nodes: StructuredDataNode[]): StructuredDataReport {
  return {
    valid: 0,
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

describe("nodesOfType", () => {
  it("matches subtype families", () => {
    const data = report([node(["NewsArticle"], {}), node(["Person"], {})]);
    const articles = nodesOfType(data, ["Article"]);

    expect(articles).toHaveLength(1);
    expect(articles[0].types).toEqual(["NewsArticle"]);
  });
});

describe("identitySignals", () => {
  it("summarises Organization and Person nodes", () => {
    const signals = identitySignals(
      report([
        node(["Organization"], {
          name: "Example Inc",
          url: "https://example.com",
          description: "We build examples.",
          sameAs: ["https://www.linkedin.com/company/example"],
          knowsAbout: ["Examples", "Testing"],
        }),
        node(["Person"], {
          name: "Ada Lovelace",
          jobTitle: "Engineer",
          sameAs: "https://example.com/ada",
        }),
        node(["WebSite"], { name: "Ignored" }),
      ]),
    );

    expect(signals).toHaveLength(2);
    expect(signals[0]).toMatchObject({
      type: "Organization",
      name: "Example Inc",
      url: "https://example.com",
      description: "We build examples.",
      sameAs: ["https://www.linkedin.com/company/example"],
      knowsAbout: ["Examples", "Testing"],
    });
    expect(signals[1]).toMatchObject({
      type: "Person",
      name: "Ada Lovelace",
      jobTitle: "Engineer",
      sameAs: ["https://example.com/ada"],
    });
  });

  it("falls back to legalName and @id", () => {
    const signals = identitySignals(
      report([
        node(["Organization"], { legalName: "Example LLC", "@id": "https://example.com/#org" }),
      ]),
    );

    expect(signals[0].name).toBe("Example LLC");
    expect(signals[0].url).toBe("https://example.com/#org");
  });

  it("returns an empty list when no identity node exists", () => {
    expect(identitySignals(report([node(["WebPage"], {})]))).toEqual([]);
  });
});

describe("faqSchemaPairs", () => {
  it("reads question and answer strings from mainEntity", () => {
    const pairs = faqSchemaPairs(
      report([
        node(["FAQPage"], {
          mainEntity: [
            {
              "@type": "Question",
              name: "What is it?",
              acceptedAnswer: { "@type": "Answer", text: "A thing." },
            },
            {
              "@type": "Question",
              text: "How does it work?",
              acceptedAnswer: { "@type": "Answer", text: "Like this." },
            },
          ],
        }),
      ]),
    );

    expect(pairs).toEqual([
      { question: "What is it?", answer: "A thing.", line: 1 },
      { question: "How does it work?", answer: "Like this.", line: 1 },
    ]);
  });

  it("skips incomplete pairs and non-array mainEntity", () => {
    expect(
      faqSchemaPairs(
        report([
          node(["FAQPage"], {
            mainEntity: [{ "@type": "Question", name: "No answer" }],
          }),
          node(["FAQPage"], { mainEntity: "not an array" }),
        ]),
      ),
    ).toEqual([]);
  });
});

describe("hasFaqSchema", () => {
  it("requires a non-empty mainEntity list", () => {
    expect(
      hasFaqSchema(
        report([node(["FAQPage"], { mainEntity: [{ "@type": "Question", name: "What?" }] })]),
      ),
    ).toBe(true);
    expect(hasFaqSchema(report([node(["FAQPage"], { mainEntity: [] })]))).toBe(false);
    expect(hasFaqSchema(report([node(["FAQPage"], {})]))).toBe(false);
    expect(hasFaqSchema(report([node(["WebPage"], {})]))).toBe(false);
  });
});

describe("breadcrumbLists", () => {
  it("reads names and item URLs", () => {
    const lists = breadcrumbLists(
      report([
        node(["BreadcrumbList"], {
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://example.com/" },
            {
              "@type": "ListItem",
              position: 2,
              name: "Docs",
              item: { "@id": "https://example.com/docs" },
            },
            { "@type": "ListItem", position: 3, name: "Start" },
          ],
        }),
      ]),
    );

    expect(lists).toHaveLength(1);
    expect(lists[0].items).toEqual([
      { name: "Home", url: "https://example.com/" },
      { name: "Docs", url: "https://example.com/docs" },
      { name: "Start", url: null },
    ]);
  });

  it("keeps a BreadcrumbList node with no items as an empty trail", () => {
    expect(breadcrumbLists(report([node(["BreadcrumbList"], {})]))).toEqual([
      { items: [], line: 1, format: "json-ld" },
    ]);
  });
});

describe("tokenOverlap", () => {
  it("ignores short tokens and punctuation", () => {
    expect(tokens("The quick, brown fox!")).toEqual(new Set(["the", "quick", "brown", "fox"]));
  });

  it("measures shared vocabulary against the smaller set", () => {
    expect(tokenOverlap("Install the package", "Install the package locally")).toBe(1);
    expect(tokenOverlap("Install the package", "Unrelated words here")).toBe(0);
    expect(tokenOverlap("", "Anything")).toBe(0);
  });
});
