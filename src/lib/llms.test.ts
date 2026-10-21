import { describe, expect, it } from "vitest";

import { buildLlmsFullTxt, buildLlmsTxt, groupPages, sectionForPath } from "./llms";
import type { AuditPage } from "@/types/audit";

const pages: AuditPage[] = [
  { url: "https://example.com/", label: "Home", section: "Home", source: "home" },
  {
    url: "https://example.com/docs/start",
    label: "Start",
    section: "Documentation",
    source: "sitemap",
  },
  {
    url: "https://example.com/docs/api",
    label: "Api",
    section: "Documentation",
    source: "sitemap",
  },
  { url: "https://example.com/blog/hello", label: "Hello", section: "Updates", source: "link" },
];

const input = {
  siteName: "Example",
  description: "Everything developers need.",
  notes: "## Optional\n- [Contact](https://example.com/contact)",
  pages,
  selectedSections: ["Home", "Documentation", "Updates"],
  capturedMarkdown: "# Example\n\nBody copy.",
};

describe("sectionForPath", () => {
  it("classifies common documentation paths", () => {
    expect(sectionForPath("/")).toBe("Home");
    expect(sectionForPath("/docs/intro")).toBe("Documentation");
    expect(sectionForPath("/guides/deploy")).toBe("Guides");
    expect(sectionForPath("/api/reference")).toBe("Developers");
    expect(sectionForPath("/blog/launch")).toBe("Updates");
    expect(sectionForPath("/about")).toBe("Company");
    expect(sectionForPath("/pricing")).toBe("Product");
    expect(sectionForPath("/random/page")).toBe("Pages");
  });
});

describe("groupPages", () => {
  it("groups and orders sections by priority", () => {
    const groups = groupPages(pages);
    expect(groups.map((group) => group.name)).toEqual(["Documentation", "Updates", "Home"]);
    expect(groups[0].pages).toHaveLength(2);
  });
});

describe("buildLlmsTxt", () => {
  it("starts with an H1 and a blockquote summary", () => {
    const output = buildLlmsTxt(input);
    expect(output.startsWith("# Example\n\n> Everything developers need.")).toBe(true);
    expect(output).toContain("## Documentation");
    expect(output).toContain("- [Start](https://example.com/docs/start)");
    expect(output).toContain("## Optional");
  });

  it("filters out unselected sections", () => {
    const output = buildLlmsTxt({ ...input, selectedSections: ["Documentation"] });
    expect(output).toContain("## Documentation");
    expect(output).not.toContain("## Updates");
    expect(output).not.toContain("## Home");
  });

  it("falls back to a homepage link when nothing is selected", () => {
    const output = buildLlmsTxt({ ...input, selectedSections: [] });
    expect(output).toContain("## Pages");
    expect(output).toContain("- [Home](/): Start here.");
  });
});

describe("buildLlmsFullTxt", () => {
  it("includes the captured page content", () => {
    const output = buildLlmsFullTxt(input);
    expect(output).toContain("## Captured page content");
    expect(output).toContain("# Example\n\nBody copy.");
  });
});
