import { describe, expect, it } from "vitest";

import { ActionInputError, readInputs } from "./inputs";

describe("readInputs", () => {
  it("uses the action defaults", () => {
    const inputs = readInputs({ INPUT_URL: "https://example.com" });
    expect(inputs).toEqual({
      url: "https://example.com",
      minScore: 75,
      minGrade: "B",
      siteType: null,
      commentOnPr: true,
      githubToken: null,
      timeoutMs: 10_000,
    });
  });

  it("reads hyphenated and underscored environment keys", () => {
    const hyphenated = readInputs({
      INPUT_URL: "example.com",
      "INPUT_MIN-SCORE": "90",
      "INPUT_MIN-GRADE": "a",
      "INPUT_SITE-TYPE": "docs",
      "INPUT_COMMENT-ON-PR": "false",
      INPUT_TIMEOUT: "15000",
      "INPUT_GITHUB-TOKEN": "secret",
    });
    expect(hyphenated).toMatchObject({
      minScore: 90,
      minGrade: "A",
      siteType: "docs",
      commentOnPr: false,
      timeoutMs: 15_000,
      githubToken: "secret",
    });

    const underscored = readInputs({
      INPUT_URL: "example.com",
      INPUT_MIN_SCORE: "50",
      INPUT_MIN_GRADE: "C",
      INPUT_SITE_TYPE: "ecommerce",
    });
    expect(underscored).toMatchObject({ minScore: 50, minGrade: "C", siteType: "ecommerce" });
  });

  it("rejects missing and malformed inputs", () => {
    expect(() => readInputs({})).toThrow(ActionInputError);
    expect(() => readInputs({ INPUT_URL: "x", "INPUT_MIN-GRADE": "Z" })).toThrow(/min-grade/);
    expect(() => readInputs({ INPUT_URL: "x", "INPUT_MIN-SCORE": "101" })).toThrow(/min-score/);
    expect(() => readInputs({ INPUT_URL: "x", "INPUT_SITE-TYPE": "forum" })).toThrow(/site-type/);
    expect(() => readInputs({ INPUT_URL: "x", INPUT_TIMEOUT: "10" })).toThrow(/timeout/);
    expect(() => readInputs({ INPUT_URL: "x", "INPUT_COMMENT-ON-PR": "maybe" })).toThrow(
      /comment-on-pr/,
    );
  });
});
