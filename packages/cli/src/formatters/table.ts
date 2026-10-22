import type { AuditReport, AuditReportPillar } from "@llm-seo-toolbox/core";
import { formatNumber } from "@llm-seo-toolbox/core/format";

import { CLI_NAME, CLI_VERSION } from "../args";
import type { Palette } from "../color";

type Align = "left" | "right";

interface Cell {
  text: string;
  color?: (value: string) => string;
}

function displayWidth(value: string): number {
  return [...value].length;
}

function pad(value: string, width: number, align: Align): string {
  const missing = Math.max(0, width - displayWidth(value));
  return align === "right" ? `${" ".repeat(missing)}${value}` : `${value}${" ".repeat(missing)}`;
}

function tableLines(headers: string[], rows: Cell[][], aligns: Align[]): string[] {
  const widths = headers.map((header, column) =>
    Math.max(displayWidth(header), ...rows.map((row) => displayWidth(row[column]?.text ?? ""))),
  );

  const border = (left: string, middle: string, right: string) =>
    `${left}${widths.map((width) => "─".repeat(width + 2)).join(middle)}${right}`;

  const line = (cells: Cell[]) =>
    `│${widths
      .map((width, column) => {
        const cell = cells[column] ?? { text: "" };
        const padded = pad(cell.text, width, aligns[column]);
        return ` ${cell.color ? cell.color(padded) : padded} `;
      })
      .join("│")}│`;

  const output = [border("┌", "┬", "┐"), line(headers.map((text) => ({ text })))];
  output.push(border("├", "┼", "┤"));
  rows.forEach((row) => output.push(line(row)));
  output.push(border("└", "┴", "┘"));
  return output;
}

function statusCell(status: "pass" | "warn" | "fail" | "info", palette: Palette): Cell {
  switch (status) {
    case "pass":
      return { text: "PASS", color: palette.green };
    case "warn":
      return { text: "WARN", color: palette.yellow };
    case "fail":
      return { text: "FAIL", color: palette.red };
    default:
      return { text: "INFO", color: palette.dim };
  }
}

function notesFor(pillar: AuditReportPillar, report: AuditReport): string {
  const checks = report.checks.filter((check) => check.pillar === pillar.id);
  const failed = checks.filter((check) => check.status === "fail");
  const warned = checks.filter((check) => check.status === "warn");

  if (failed.length > 0) return failed[0].summary;
  if (warned.length > 0) return warned[0].summary;
  return "All scored checks passed";
}

function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1).trimEnd()}…`;
}

export function renderTable(report: AuditReport, palette: Palette): string {
  const lines: string[] = [];
  const gate = report.thresholds;
  const gateConfigured = Boolean(gate && (gate.minScore > 0 || gate.minGrade !== "F"));

  lines.push(palette.bold(`${CLI_NAME} ${CLI_VERSION}`));
  lines.push("");
  lines.push(`${palette.dim("Target")}   ${report.finalUrl}`);
  lines.push(
    `${palette.dim("Profile")}  ${report.classification.label} · ${
      report.classification.method === "override" ? "pinned" : "auto-detected"
    } · ${report.classification.confidence}% confidence`,
  );
  const scoreTone =
    report.score >= 75 ? palette.green : report.score >= 50 ? palette.yellow : palette.red;
  lines.push(
    `${palette.dim("Score")}    ${scoreTone(palette.bold(`${report.score} / 100`))} · Grade ${palette.bold(
      report.grade,
    )} · ${report.gradeLabel}`,
  );
  if (gate && gateConfigured) {
    const verdict = gate.passed ? palette.green("PASS") : palette.red("FAIL");
    lines.push(
      `${palette.dim("Gate")}     ${verdict} · minimum ${gate.minScore}/100 and grade ${gate.minGrade}`,
    );
  }
  lines.push(
    `${palette.dim("Scanned")}  ${formatNumber(report.meta.pageCount)} pages in ${(
      report.meta.fetchMs / 1000
    ).toFixed(1)}s${report.meta.cached ? " (cached)" : ""}`,
  );
  lines.push("");

  const rows = report.pillars
    ? (["discovery", "access", "parseability", "structured"] as const)
        .map((id) => report.pillars[id])
        .filter((pillar): pillar is AuditReportPillar => Boolean(pillar))
        .map((pillar) => [
          { text: pillar.name },
          {
            text: `${pillar.score}/100`,
            color:
              pillar.status === "pass"
                ? palette.green
                : pillar.status === "warn"
                  ? palette.yellow
                  : palette.red,
          },
          statusCell(pillar.status, palette),
          { text: truncate(notesFor(pillar, report), 42) },
        ])
    : [];

  lines.push(
    ...tableLines(["Pillar", "Score", "Status", "Notes"], rows, ["left", "right", "left", "left"]),
  );

  const attention = report.checks.filter(
    (check) => check.status === "fail" || check.status === "warn",
  );
  if (attention.length > 0) {
    lines.push("");
    lines.push(palette.bold("Needs attention"));
    for (const check of attention.slice(0, 6)) {
      const marker = check.status === "fail" ? palette.red("✗") : palette.yellow("⚠");
      lines.push(`  ${marker} ${check.label} · ${check.summary}`);
    }
    if (attention.length > 6) {
      lines.push(`  ${palette.dim(`…and ${attention.length - 6} more`)}`);
    }
  }

  if (report.fixes.length > 0) {
    lines.push("");
    lines.push(palette.bold("Fix first"));
    report.fixes.slice(0, 5).forEach((entry, index) => {
      lines.push(`  ${index + 1}. ${palette.bold(entry.label)} — ${entry.recommendation}`);
    });
  }

  if (gate && gateConfigured && !gate.passed) {
    const failures: string[] = [];
    if (!gate.scorePassed) failures.push(`score ${report.score} < ${gate.minScore}`);
    if (!gate.gradePassed) failures.push(`grade ${report.grade} < ${gate.minGrade}`);
    lines.push("");
    lines.push(palette.red(`Threshold not met: ${failures.join(", ")}.`));
  }

  return `${lines.join("\n")}\n`;
}
