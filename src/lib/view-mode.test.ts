import { describe, expect, it } from "vitest";

import { applyView, parseView } from "./view-mode";

describe("parseView", () => {
  it("defaults to the plain-language view", () => {
    expect(parseView(null)).toBe("plain");
    expect(parseView(undefined)).toBe("plain");
    expect(parseView("")).toBe("plain");
    expect(parseView("matrix")).toBe("plain");
  });

  it("reads the technical view", () => {
    expect(parseView("technical")).toBe("technical");
  });
});

describe("applyView", () => {
  it("keeps the default view out of the URL and round-trips the technical view", () => {
    const params = new URLSearchParams("url=example.com&scope=page");

    applyView(params, "technical");
    expect(params.toString()).toBe("url=example.com&scope=page&view=technical");
    expect(parseView(params.get("view"))).toBe("technical");

    applyView(params, "plain");
    expect(params.toString()).toBe("url=example.com&scope=page");
    expect(parseView(params.get("view"))).toBe("plain");
  });
});
