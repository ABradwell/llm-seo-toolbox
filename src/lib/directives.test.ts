import { describe, expect, it } from "vitest";

import { evaluateMetaRobots, evaluateXRobotsTag } from "./directives";

describe("evaluateXRobotsTag", () => {
  it("passes when the header is absent", () => {
    const verdict = evaluateXRobotsTag(null);
    expect(verdict.status).toBe("pass");
    expect(verdict.summary).toBe("Not set");
  });

  it("fails on noindex and none", () => {
    expect(evaluateXRobotsTag("noindex").status).toBe("fail");
    expect(evaluateXRobotsTag("none").status).toBe("fail");
    expect(evaluateXRobotsTag("noindex, nofollow").blocking).toEqual(["noindex"]);
  });

  it("understands agent-scoped directives", () => {
    const verdict = evaluateXRobotsTag("googlebot: noindex");
    expect(verdict.status).toBe("fail");
    expect(verdict.summary).toContain("googlebot");
  });

  it("warns on soft restrictions without failing the page", () => {
    expect(evaluateXRobotsTag("nosnippet").status).toBe("warn");
    expect(evaluateXRobotsTag("nofollow").status).toBe("warn");
  });

  it("treats permissive directives as a pass", () => {
    expect(evaluateXRobotsTag("index, follow").status).toBe("pass");
  });
});

describe("evaluateMetaRobots", () => {
  it("fails noindex meta tags", () => {
    const verdict = evaluateMetaRobots("noindex, follow");
    expect(verdict.status).toBe("fail");
    expect(verdict.detail).toContain("robots meta tag");
  });

  it("passes clean pages", () => {
    expect(evaluateMetaRobots("index, follow").status).toBe("pass");
    expect(evaluateMetaRobots(null).status).toBe("pass");
  });
});
