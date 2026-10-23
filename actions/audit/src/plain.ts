import { buildPlainBrief, renderChangeRequests, type AuditReport } from "@llm-seo-toolbox/core";

/**
 * Pull request comment for `report-style: plain`: the gate verdict, then the
 * plain-language change requests with technical references for the developer.
 */
export function renderPlainComment(
  report: AuditReport,
  options: { marker?: string; runUrl?: string } = {},
): string {
  const gate = report.thresholds;
  const passed = report.passed ?? gate?.passed ?? true;
  const lines: string[] = [];

  if (options.marker) lines.push(`<!-- ${options.marker} -->`, "");
  lines.push(
    `## ${passed ? "✅" : "❌"} LLM SEO Toolbox audit ${passed ? "passed" : "failed"}`,
    "",
  );
  if (gate) {
    lines.push(
      `Score ${report.score}/100 (minimum ${gate.minScore}) · Grade ${report.grade} (minimum ${gate.minGrade})`,
      "",
    );
  }

  // Nest the brief under the verdict heading so the comment keeps one top-level title.
  const brief = renderChangeRequests(buildPlainBrief(report), {
    includeTechnical: true,
    reportUrl: options.runUrl,
  }).replace(/^(#{1,4}) /gm, (_, hashes: string) => `${"#".repeat(hashes.length + 2)} `);
  lines.push(brief);

  return `${lines.join("\n").trim()}\n`;
}
