import { describe, expect, it } from "vitest";

import { gradeFor, scoreAudit, scorePillar, statusScore } from "./score";
import type { AuditCheck } from "./types";

function check(status: AuditCheck["status"], weight = 1, score?: number): AuditCheck {
  return {
    id: `check-${status}-${weight}-${score ?? "auto"}`,
    label: "Check",
    status,
    summary: "",
    detail: "",
    weight,
    scope: "site",
    ...(score === undefined ? {} : { score }),
  };
}

describe("statusScore", () => {
  it("maps statuses to points", () => {
    expect(statusScore("pass")).toBe(100);
    expect(statusScore("warn")).toBe(50);
    expect(statusScore("fail")).toBe(0);
    expect(statusScore("info")).toBeNull();
  });
});

describe("scorePillar", () => {
  it("averages unweighted checks", () => {
    expect(scorePillar({ checks: [check("pass"), check("warn"), check("fail")] })).toBe(50);
  });

  it("respects weights", () => {
    expect(scorePillar({ checks: [check("pass", 3), check("fail", 1)] })).toBe(75);
  });

  it("ignores info checks", () => {
    expect(scorePillar({ checks: [check("pass"), check("info")] })).toBe(100);
  });

  it("returns zero for empty pillars", () => {
    expect(scorePillar({ checks: [] })).toBe(0);
  });

  it("uses an aggregate score when one is present", () => {
    expect(scorePillar({ checks: [check("warn", 1, 88)] })).toBe(88);
  });

  it("does not confuse a zero aggregate score with a missing score", () => {
    expect(scorePillar({ checks: [check("warn", 1, 0)] })).toBe(0);
  });
});

describe("scoreAudit", () => {
  it("averages pillar scores", () => {
    expect(scoreAudit([{ score: 100 }, { score: 50 }, { score: 0 }, { score: 50 }])).toBe(50);
  });
});

describe("gradeFor", () => {
  it("maps score bands", () => {
    expect(gradeFor(95).grade).toBe("A");
    expect(gradeFor(80).grade).toBe("B");
    expect(gradeFor(64).grade).toBe("C");
    expect(gradeFor(41).grade).toBe("D");
    expect(gradeFor(12).grade).toBe("F");
  });
});
