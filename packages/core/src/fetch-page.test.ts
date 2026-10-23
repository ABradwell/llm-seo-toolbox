import { describe, expect, it } from "vitest";

import { headersForOrigin } from "./fetch-page";

const bypass = { "x-vercel-protection-bypass": "secret" };

describe("headersForOrigin", () => {
  it("sends extra headers to the audited origin", () => {
    expect(
      headersForOrigin(
        new URL("https://llm-seo-toolbox-git-branch.vercel.app/app"),
        "https://llm-seo-toolbox-git-branch.vercel.app",
        bypass,
      ),
    ).toEqual(bypass);
  });

  it("drops extra headers for external links", () => {
    expect(
      headersForOrigin(new URL("https://llmstxt.org/"), "https://preview.example.com", bypass),
    ).toBeUndefined();
  });

  it("returns undefined when no extra headers are configured", () => {
    expect(
      headersForOrigin(new URL("https://preview.example.com/"), "https://preview.example.com"),
    ).toBeUndefined();
  });
});
