"use client";

import { CheckCircle2, Download, ExternalLink, RefreshCw } from "lucide-react";

import { CopyButton } from "@/components/copy-button";
import { StatusIcon } from "@/components/status-icon";
import { FilesTable } from "@/components/tool/files-table";
import { PillarCard } from "@/components/tool/pillar-card";
import { ScoreRing } from "@/components/tool/score-ring";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { downloadText } from "@/lib/download";
import { gradeFor } from "@/lib/score";
import { cn, formatNumber } from "@/lib/utils";
import type { AuditResult, CheckStatus } from "@/types/audit";

export function AuditDashboard({
  audit,
  onRefresh,
  refreshing,
}: {
  audit: AuditResult;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const counts = countStatuses(audit);
  const grade = gradeFor(audit.score);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <section className="relative overflow-hidden rounded-3xl border border-line bg-panel/70 p-6 sm:p-8">
          <div
            className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-acid/5 blur-[90px]"
            aria-hidden="true"
          />
          <div className="relative flex flex-col gap-8 sm:flex-row sm:items-center">
            <ScoreRing
              score={audit.score}
              size={168}
              strokeWidth={10}
              gradeLabel={`Grade ${audit.grade}`}
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="accent">{grade.label}</Badge>
                {audit.meta.cached ? <Badge variant="default">Cached</Badge> : null}
              </div>
              <h2 className="mt-4 truncate text-2xl font-medium tracking-tight">
                {audit.profile.siteName || audit.domain}
              </h2>
              <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted">
                {audit.profile.title}
              </p>
              <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-muted/70">
                <a
                  href={audit.finalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 transition-colors hover:text-acid"
                >
                  {audit.domain}
                  <ExternalLink className="size-3" aria-hidden="true" />
                </a>
                <span aria-hidden="true">·</span>
                <span>{audit.meta.crawledAt.replace("T", " ").slice(0, 16)} UTC</span>
                <span aria-hidden="true">·</span>
                <span>{(audit.meta.fetchMs / 1000).toFixed(1)}s</span>
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={onRefresh} disabled={refreshing}>
                  <RefreshCw className={cn(refreshing && "animate-spin")} aria-hidden="true" />
                  Re-run audit
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    downloadText(
                      `llmready-${audit.domain.replace(/[^a-z0-9.-]+/gi, "-")}.json`,
                      JSON.stringify(audit, null, 2),
                      "application/json",
                    )
                  }
                >
                  <Download aria-hidden="true" />
                  Export JSON
                </Button>
                <CopyButton
                  value={typeof window === "undefined" ? audit.url : window.location.href}
                  label="Copy report link"
                  variant="ghost"
                />
              </div>
            </div>
          </div>

          <div className="relative mt-8 grid grid-cols-3 gap-4 border-t border-line pt-5">
            {(
              [
                { key: "pass", label: "Passing" },
                { key: "warn", label: "Warnings" },
                { key: "fail", label: "Failing" },
              ] as const
            ).map((item) => (
              <div key={item.key}>
                <p
                  className={cn(
                    "font-mono text-2xl leading-none",
                    item.key === "pass" && "text-pass",
                    item.key === "warn" && "text-warn",
                    item.key === "fail" && "text-fail",
                  )}
                >
                  {counts[item.key]}
                </p>
                <p className="mt-1.5 font-mono text-[10px] tracking-[0.14em] text-muted uppercase">
                  {item.label}
                </p>
              </div>
            ))}
          </div>

          <div className="relative mt-6 grid gap-3 sm:grid-cols-2">
            {audit.pillars.map((pillar) => (
              <div key={pillar.id}>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted">{pillar.shortName}</span>
                  <span className="font-mono">{pillar.score}</span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-panel-2">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      pillar.score >= 75 ? "bg-pass" : pillar.score >= 50 ? "bg-warn" : "bg-fail",
                    )}
                    style={{ width: `${pillar.score}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col self-start rounded-3xl border border-line bg-panel/60 p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-medium">Priority fixes</h3>
            <Badge variant={audit.fixes.length === 0 ? "pass" : "warn"}>
              {audit.fixes.length === 0 ? "All clear" : `${audit.fixes.length} found`}
            </Badge>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            The highest-impact changes for this page, ranked by severity and weight.
          </p>

          {audit.fixes.length === 0 ? (
            <div className="mt-6 flex items-center gap-3 rounded-xl border border-line bg-panel-2/60 p-4">
              <CheckCircle2 className="size-5 text-pass" aria-hidden="true" />
              <p className="text-sm">
                Every check passed. Keep the manifests fresh as the site changes.
              </p>
            </div>
          ) : (
            <ul className="mt-5 space-y-3">
              {audit.fixes.map((fix) => (
                <li
                  key={`${fix.pillarId}-${fix.checkId}`}
                  className="rounded-xl border border-line bg-panel-2/50 p-4"
                >
                  <div className="flex items-center gap-2.5">
                    <StatusIcon status={fix.status} />
                    <span className="flex-1 text-sm font-medium">{fix.label}</span>
                    <span className="font-mono text-[10px] tracking-[0.14em] text-muted uppercase">
                      {fix.pillarName}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{fix.recommendation}</p>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-auto pt-5 font-mono text-xs text-muted/70">
            {formatNumber(audit.meta.pageCount)} pages discovered for the builder
          </p>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {audit.pillars.map((pillar) => (
          <PillarCard key={pillar.id} pillar={pillar} />
        ))}
      </div>

      <FilesTable files={audit.files} />
    </div>
  );
}

function countStatuses(audit: AuditResult): Record<"pass" | "warn" | "fail", number> {
  const counts: Record<CheckStatus, number> = { pass: 0, warn: 0, fail: 0, info: 0 };
  for (const pillar of audit.pillars) {
    for (const check of pillar.checks) counts[check.status] += 1;
  }
  return { pass: counts.pass, warn: counts.warn, fail: counts.fail };
}
