import type { AuditReport } from "@llm-seo-toolbox/core";

export function renderJson(report: AuditReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
