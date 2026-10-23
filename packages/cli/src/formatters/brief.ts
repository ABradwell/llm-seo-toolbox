import { buildPlainBrief, renderChangeRequests, type AuditReport } from "@llm-seo-toolbox/core";

/** Plain-language change requests, with technical references for the developer who picks them up. */
export function renderBrief(report: AuditReport): string {
  return renderChangeRequests(buildPlainBrief(report), { includeTechnical: true });
}
