import type { AuditGrade, AuditPillar } from "./types";

export const AUDIT_GRADES: readonly AuditGrade[] = ["A", "B", "C", "D", "F"];

export function isAuditGrade(value: unknown): value is AuditGrade {
  return typeof value === "string" && (AUDIT_GRADES as readonly string[]).includes(value);
}

export const STATUS_LABELS = {
  pass: "Pass",
  warn: "Warning",
  fail: "Fail",
  info: "Info",
} as const;

export function statusScore(status: "pass" | "warn" | "fail" | "info"): number | null {
  switch (status) {
    case "pass":
      return 100;
    case "warn":
      return 50;
    case "fail":
      return 0;
    default:
      return null;
  }
}

export function scorePillar(pillar: Pick<AuditPillar, "checks">): number {
  let weighted = 0;
  let totalWeight = 0;

  for (const check of pillar.checks) {
    const value = statusScore(check.status);
    if (value === null) continue;
    const weight = check.weight > 0 ? check.weight : 1;
    weighted += value * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return 0;
  return Math.round(weighted / totalWeight);
}

export function scoreAudit(pillars: Pick<AuditPillar, "score">[]): number {
  if (pillars.length === 0) return 0;
  const total = pillars.reduce((sum, pillar) => sum + pillar.score, 0);
  return Math.round(total / pillars.length);
}

export function gradeFor(score: number): { grade: AuditGrade; label: string } {
  if (score >= 90) return { grade: "A", label: "LLM-ready" };
  if (score >= 75) return { grade: "B", label: "Nearly ready" };
  if (score >= 60) return { grade: "C", label: "Needs work" };
  if (score >= 40) return { grade: "D", label: "At risk" };
  return { grade: "F", label: "Invisible to LLMs" };
}

export function scoreTone(score: number): "pass" | "warn" | "fail" {
  if (score >= 75) return "pass";
  if (score >= 50) return "warn";
  return "fail";
}

export function toneColor(tone: "pass" | "warn" | "fail"): string {
  switch (tone) {
    case "pass":
      return "var(--pass-bright)";
    case "warn":
      return "var(--warn-bright)";
    default:
      return "var(--fail-bright)";
  }
}

export function statusColor(status: "pass" | "warn" | "fail" | "info"): string {
  switch (status) {
    case "pass":
      return "var(--pass)";
    case "warn":
      return "var(--warn)";
    case "fail":
      return "var(--fail)";
    default:
      return "var(--muted)";
  }
}
