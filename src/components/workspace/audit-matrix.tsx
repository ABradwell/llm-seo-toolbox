"use client";

import {
  Braces,
  CheckCircle2,
  ChevronDown,
  Compass,
  Download,
  ExternalLink,
  RefreshCw,
  ScanText,
  Bot,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";

import { CopyButton } from "@/components/copy-button";
import { StatusIcon } from "@/components/status-icon";
import { CodeBlock } from "@/components/workspace/code-pane";
import { FilesTable } from "@/components/workspace/files-table";
import { ScoreRing } from "@/components/workspace/score-ring";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { downloadText } from "@/lib/download";
import { gradeFor, scoreTone } from "@/lib/score";
import { cn, formatNumber } from "@/lib/utils";
import type { AuditCheck, AuditPillar, AuditResult, CheckStatus, PillarId } from "@/types/audit";

const PILLAR_ICONS: Record<PillarId, LucideIcon> = {
  discovery: Compass,
  access: Bot,
  parseability: ScanText,
  structured: Braces,
};

export function AuditMatrix({
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
  const [issuesOnly, setIssuesOnly] = useState(false);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 xl:grid-cols-[1.3fr_0.7fr]">
        <section className="relative overflow-hidden rounded-[4px] border border-line bg-panel p-4 sm:p-5">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <ScoreRing
              score={audit.score}
              size={128}
              strokeWidth={7}
              gradeLabel={`grade ${audit.grade}`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={scoreTone(audit.score)}>{grade.label}</Badge>
                {audit.meta.cached ? <Badge variant="default">cached</Badge> : null}
                <Badge variant="outline">{audit.pillars.length} pillars</Badge>
              </div>
              <h2 className="mt-3 truncate text-xl font-medium tracking-tight sm:text-2xl">
                {audit.profile.siteName || audit.domain}
              </h2>
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">
                {audit.profile.title}
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] text-muted/70">
                <a
                  href={audit.finalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 transition-colors hover:text-accent-strong"
                >
                  {audit.domain}
                  <ExternalLink className="size-2.5" aria-hidden="true" />
                </a>
                <span aria-hidden="true">·</span>
                <span>{audit.meta.crawledAt.replace("T", " ").slice(0, 16)} UTC</span>
                <span aria-hidden="true">·</span>
                <span>{(audit.meta.fetchMs / 1000).toFixed(1)}s</span>
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 border-t border-line pt-3">
            {(
              [
                { key: "pass", label: "passing" },
                { key: "warn", label: "warnings" },
                { key: "fail", label: "failing" },
              ] as const
            ).map((item) => (
              <div key={item.key}>
                <p
                  className={cn(
                    "font-mono text-xl leading-none",
                    item.key === "pass" && "text-pass",
                    item.key === "warn" && "text-warn",
                    item.key === "fail" && "text-fail",
                  )}
                >
                  {counts[item.key]}
                </p>
                <p className="mt-1 font-mono text-[9px] tracking-[0.12em] text-muted uppercase">
                  {item.label}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {audit.pillars.map((pillar) => (
              <a key={pillar.id} href={`#pillar-${pillar.id}`} className="group block">
                <div className="flex items-center justify-between font-mono text-[10px]">
                  <span className="text-muted group-hover:text-foreground">{pillar.shortName}</span>
                  <span>{pillar.score}</span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-[1px] bg-panel-2">
                  <div
                    className={cn(
                      "h-full",
                      pillar.score >= 75
                        ? "bg-pass-bright"
                        : pillar.score >= 50
                          ? "bg-warn-bright"
                          : "bg-fail-bright",
                    )}
                    style={{ width: `${pillar.score}%` }}
                  />
                </div>
              </a>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line pt-3">
            <Button variant="secondary" size="sm" onClick={onRefresh} disabled={refreshing}>
              <RefreshCw className={cn(refreshing && "animate-spin")} aria-hidden="true" />
              Re-run
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
              label="Copy link"
              variant="ghost"
            />
          </div>
        </section>

        <section className="flex flex-col rounded-[4px] border border-line bg-panel">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h3 className="font-mono text-[11px] tracking-[0.1em] uppercase">Fix queue</h3>
            <Badge variant={audit.fixes.length === 0 ? "pass" : "warn"}>
              {audit.fixes.length === 0 ? "clear" : `${audit.fixes.length}`}
            </Badge>
          </div>

          {audit.fixes.length === 0 ? (
            <div className="flex flex-1 items-center gap-3 p-4">
              <CheckCircle2 className="size-4 text-pass" aria-hidden="true" />
              <p className="text-xs leading-relaxed text-muted">
                Every check passed. Re-run after the next deploy and keep the manifests fresh.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {audit.fixes.slice(0, 5).map((fix) => (
                <li key={`${fix.pillarId}-${fix.checkId}`} className="p-3">
                  <a href={`#check-${fix.pillarId}-${fix.checkId}`} className="group block">
                    <div className="flex items-center gap-2">
                      <StatusIcon status={fix.status} />
                      <span className="min-w-0 flex-1 truncate text-xs font-medium group-hover:text-accent-strong">
                        {fix.label}
                      </span>
                      <span className="font-mono text-[9px] text-muted uppercase">
                        {fix.pillarName}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 pl-[22px] text-[11px] leading-relaxed text-muted">
                      {fix.recommendation}
                    </p>
                    {fix.evidence ? (
                      <p className="mt-1 pl-[22px] font-mono text-[9px] text-muted/60">
                        {fix.evidence.file}
                        {fix.evidence.line ? `:${fix.evidence.line}` : ""}
                      </p>
                    ) : null}
                  </a>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-auto border-t border-line px-4 py-2 font-mono text-[9px] text-muted/60">
            {formatNumber(audit.meta.pageCount)} pages discovered · top fixes ranked by severity
          </p>
        </section>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-mono text-[11px] tracking-[0.14em] uppercase">Audit matrix</h2>
          <p className="mt-0.5 text-[11px] text-muted">
            Pass / warn / fail with protocol, source line and a copy-paste fix.
          </p>
        </div>
        <Button
          variant={issuesOnly ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setIssuesOnly((value) => !value)}
          aria-pressed={issuesOnly}
        >
          {issuesOnly ? "Showing issues" : "Show issues only"}
        </Button>
      </div>

      <div className="space-y-3">
        {audit.pillars.map((pillar) => (
          <PillarMatrix
            key={pillar.id}
            pillar={pillar}
            issuesOnly={issuesOnly}
            origin={audit.domain}
          />
        ))}
      </div>

      <FilesTable files={audit.files} />
    </div>
  );
}

function PillarMatrix({
  pillar,
  issuesOnly,
  origin,
}: {
  pillar: AuditPillar;
  issuesOnly: boolean;
  origin: string;
}) {
  const Icon = PILLAR_ICONS[pillar.id];
  const checks = issuesOnly
    ? pillar.checks.filter((check) => check.status === "fail" || check.status === "warn")
    : pillar.checks;

  return (
    <section
      id={`pillar-${pillar.id}`}
      className="scroll-mt-24 overflow-hidden rounded-[4px] border border-line bg-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-panel-2/40 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-[2px] border border-line bg-panel">
            <Icon className="size-3.5 text-accent" aria-hidden="true" />
          </span>
          <div>
            <h3 className="font-mono text-[11px] tracking-[0.1em] uppercase">{pillar.name}</h3>
            <p className="mt-0.5 text-[10px] text-muted">{pillar.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-muted">{checks.length} checks</span>
          <Badge variant={pillar.score >= 75 ? "pass" : pillar.score >= 50 ? "warn" : "fail"}>
            {pillar.score}/100
          </Badge>
        </div>
      </div>

      {checks.length === 0 ? (
        <p className="px-4 py-6 text-center font-mono text-[11px] text-muted/60">
          No issues in this pillar.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line bg-panel/60 font-mono text-[9px] tracking-[0.12em] text-muted uppercase">
                <th className="w-14 px-4 py-2 font-normal">status</th>
                <th className="px-3 py-2 font-normal">check</th>
                <th className="w-40 px-3 py-2 font-normal">protocol</th>
                <th className="w-32 px-3 py-2 font-normal">source</th>
                <th className="w-52 px-3 py-2 font-normal">observed</th>
                <th className="w-20 px-3 py-2 font-normal">action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {checks.map((check) => (
                <CheckRow key={check.id} check={check} pillarId={pillar.id} origin={origin} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CheckRow({
  check,
  pillarId,
  origin,
}: {
  check: AuditCheck;
  pillarId: PillarId;
  origin: string;
}) {
  const [open, setOpen] = useState(false);
  const detailId = `detail-${pillarId}-${check.id}`;

  return (
    <>
      <tr
        id={`check-${pillarId}-${check.id}`}
        className={cn("scroll-mt-24 hover:bg-panel-2/30", open && "bg-panel-2/40")}
      >
        <td className="px-4 py-2.5">
          <span className="flex items-center gap-1.5">
            <StatusIcon status={check.status} />
            <span className="font-mono text-[9px] tracking-[0.08em] text-muted uppercase">
              {check.status}
            </span>
          </span>
        </td>
        <td className="px-3 py-2.5">
          <span className="text-xs font-medium">{check.label}</span>
        </td>
        <td className="px-3 py-2.5">
          <span className="font-mono text-[10px] leading-tight text-muted">
            {check.protocol ?? "—"}
          </span>
        </td>
        <td className="px-3 py-2.5">
          <span className="font-mono text-[10px] text-muted">
            {check.evidence?.file ?? "—"}
            {check.evidence?.line ? (
              <span className="text-accent-strong">:{check.evidence.line}</span>
            ) : null}
          </span>
        </td>
        <td className="px-3 py-2.5">
          <span className="line-clamp-2 font-mono text-[10px] text-foreground/80">
            {check.summary}
          </span>
        </td>
        <td className="px-3 py-2.5">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls={detailId}
            className="inline-flex items-center gap-1 font-mono text-[10px] text-muted transition-colors hover:text-accent-strong"
          >
            {open ? "hide" : "inspect"}
            <ChevronDown
              className={cn("size-3 transition-transform", open && "rotate-180")}
              aria-hidden="true"
            />
          </button>
        </td>
      </tr>

      {open ? (
        <tr id={detailId} className="bg-panel-2/40">
          <td colSpan={6} className="border-t border-line px-4 py-4">
            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="min-w-0">
                <p className="text-xs leading-relaxed text-foreground/85">{check.detail}</p>
                {check.recommendation ? (
                  <p className="mt-2 border-l-2 border-accent/50 pl-2.5 text-xs leading-relaxed text-muted">
                    {check.recommendation}
                  </p>
                ) : null}
                {check.evidence?.snippet ? (
                  <div className="mt-3 rounded-[2px] border border-line bg-panel px-2.5 py-2">
                    <p className="font-mono text-[9px] tracking-[0.12em] text-muted uppercase">
                      evidence · {check.evidence.file}
                      {check.evidence.line ? `:${check.evidence.line}` : ""}
                    </p>
                    <pre className="mt-1 overflow-x-auto font-mono text-[11px] text-foreground/80">
                      {check.evidence.snippet}
                    </pre>
                  </div>
                ) : null}
                <p className="mt-3 font-mono text-[9px] text-muted/50">target origin: {origin}</p>
              </div>

              {check.fix ? (
                <CodeBlock code={check.fix.code} language={check.fix.language} />
              ) : (
                <div className="rounded-[3px] border border-line bg-panel p-3">
                  <p className="font-mono text-[9px] tracking-[0.12em] text-muted uppercase">
                    resolution
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    This check passes. No code change is required.
                  </p>
                </div>
              )}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function countStatuses(audit: AuditResult): Record<"pass" | "warn" | "fail", number> {
  const counts: Record<CheckStatus, number> = { pass: 0, warn: 0, fail: 0, info: 0 };
  for (const pillar of audit.pillars) {
    for (const check of pillar.checks) counts[check.status] += 1;
  }
  return { pass: counts.pass, warn: counts.warn, fail: counts.fail };
}
