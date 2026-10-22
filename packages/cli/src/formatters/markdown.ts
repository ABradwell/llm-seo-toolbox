import { renderMarkdownReport, type AuditReport } from "@llm-seo-toolbox/core";

export function renderMarkdown(report: AuditReport): string {
  return renderMarkdownReport(report, {
    title: "LLM SEO Toolbox audit",
    includeDetails: true,
    includeFixes: true,
  });
}
