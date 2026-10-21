import type { AuditReport } from "@llm-seo-toolbox/core";

import type { Palette } from "../color";

export function renderSummary(report: AuditReport, palette: Palette): string {
  const gate = report.thresholds;
  const gateConfigured = Boolean(gate && (gate.minScore > 0 || gate.minGrade !== "F"));
  const tone =
    gate && !gate.passed ? palette.red : report.score >= 75 ? palette.green : palette.yellow;
  const counts = {
    pass: report.checks.filter((check) => check.status === "pass").length,
    warn: report.checks.filter((check) => check.status === "warn").length,
    fail: report.checks.filter((check) => check.status === "fail").length,
  };

  const pillars = (["discovery", "access", "parseability", "structured"] as const)
    .map((id) => report.pillars[id])
    .filter(Boolean)
    .map((pillar) => `${pillar.shortName} ${pillar.score}`)
    .join(" · ");

  const lines = [
    `${palette.bold(report.finalUrl)}`,
    `${tone(palette.bold(`${report.score}/100`))} · ${report.grade} · ${report.gradeLabel} · ${
      report.classification.label
    }`,
    pillars,
    `${counts.pass} pass · ${counts.warn} warn · ${counts.fail} fail`,
  ];

  const firstFix = report.fixes[0];
  if (firstFix) lines.push(`Fix first: ${firstFix.label} — ${firstFix.recommendation}`);
  if (gate && gateConfigured) {
    lines.push(gate.passed ? palette.green("Gate passed") : palette.red("Gate failed"));
  }

  return `${lines.join("\n")}\n`;
}
