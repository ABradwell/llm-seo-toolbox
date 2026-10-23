"use client";

import { AlertCircle, ChevronDown, ExternalLink, FileSearch, Focus, Layers } from "lucide-react";
import { Fragment, useState } from "react";

import { StatusIcon } from "@/components/status-icon";
import { Badge } from "@/components/ui/badge";
import { cn, formatNumber } from "@/lib/utils";
import type { AuditResult, CheckStatus, PageAuditResult } from "@/types/audit";

function pathOf(value: string): string {
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}` || "/";
  } catch {
    return value;
  }
}

function sameUrl(a: string, b: string): boolean {
  try {
    const left = new URL(a);
    const right = new URL(b);
    left.hash = "";
    right.hash = "";
    return left.toString() === right.toString();
  } catch {
    return false;
  }
}

function toneFor(status: CheckStatus): "pass" | "warn" | "fail" | "default" {
  if (status === "pass" || status === "warn" || status === "fail") return status;
  return "default";
}

export function PageResultsTable({ audit }: { audit: AuditResult }) {
  const [openUrl, setOpenUrl] = useState<string | null>(null);
  const focusInSample = audit.pageResults.some(
    (page) => sameUrl(page.finalUrl, audit.focusPage.finalUrl) || sameUrl(page.url, audit.focusUrl),
  );
  const sampled = audit.pageResults.length;
  const coverage = audit.coverage;

  return (
    <div className="space-y-4">
      <section className="rounded-[4px] border border-line bg-panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] text-muted uppercase">
              <Layers className="size-3.5 text-accent" aria-hidden="true" />
              {audit.scope === "site" ? "Site score coverage" : "Page audit"}
            </p>
            <h2 className="mt-1 text-lg font-medium tracking-tight">
              {audit.scope === "site"
                ? `${formatNumber(coverage.analyzedPages)} of ${formatNumber(
                    coverage.inventorySize,
                  )} discovered pages scored`
                : "Single-page result"}
            </h2>
            <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-muted">{coverage.note}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="accent">{coverage.method}</Badge>
            {coverage.homepageFallback ? <Badge variant="warn">homepage fallback</Badge> : null}
            {coverage.deadlineHit ? <Badge variant="warn">deadline hit</Badge> : null}
            {coverage.truncated ? <Badge variant="outline">sample capped</Badge> : null}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3 sm:grid-cols-4">
          <CoverageStat label="discovered" value={coverage.inventorySize} />
          <CoverageStat
            label={audit.scope === "site" ? "sampled" : "scored"}
            value={coverage.sampleSize}
          />
          <CoverageStat label="analyzed" value={coverage.analyzedPages} />
          <CoverageStat
            label="failed / skipped"
            value={coverage.failedPages + coverage.skippedPages}
          />
        </div>
      </section>

      {!focusInSample ? <FocusPageCard page={audit.focusPage} /> : null}

      <section className="overflow-hidden rounded-[4px] border border-line bg-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-panel-2/40 px-4 py-3">
          <div>
            <h2 className="font-mono text-[11px] tracking-[0.1em] uppercase">
              {audit.scope === "site" ? "Sampled pages" : "Page result"}
            </h2>
            <p className="mt-0.5 text-[10px] text-muted">
              {audit.scope === "site"
                ? "These pages feed the site score. The focus page is only included when it was sampled."
                : "The entered page scored directly in page scope."}
            </p>
          </div>
          <Badge variant="outline">
            {formatNumber(sampled)} page{sampled === 1 ? "" : "s"}
          </Badge>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line bg-panel/60 font-mono text-[9px] tracking-[0.12em] text-muted uppercase">
                <th className="w-16 px-4 py-2 font-normal">status</th>
                <th className="px-3 py-2 font-normal">page</th>
                <th className="w-24 px-3 py-2 font-normal">source</th>
                <th className="w-20 px-3 py-2 font-normal">score</th>
                <th className="w-28 px-3 py-2 font-normal">outline</th>
                <th className="w-28 px-3 py-2 font-normal">static text</th>
                <th className="w-28 px-3 py-2 font-normal">freshness</th>
                <th className="w-24 px-3 py-2 font-normal">FAQ</th>
                <th className="w-32 px-3 py-2 font-normal">robots</th>
                <th className="w-20 px-3 py-2 font-normal">inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {audit.pageResults.map((page) => {
                const isFocus =
                  sameUrl(page.finalUrl, audit.focusPage.finalUrl) ||
                  sameUrl(page.url, audit.focusUrl);
                const open = openUrl === page.url;
                return (
                  <Fragment key={page.url}>
                    <tr
                      key={page.url}
                      className={cn(
                        "hover:bg-panel-2/30",
                        open && "bg-panel-2/40",
                        isFocus && "bg-accent/[0.04]",
                      )}
                    >
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-1.5">
                          <StatusIcon status={page.status} />
                          <span className="font-mono text-[9px] tracking-[0.08em] text-muted uppercase">
                            {page.status}
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-medium">{page.label}</span>
                          {isFocus ? (
                            <Badge variant="accent">
                              <Focus className="size-2.5" aria-hidden="true" />
                              focus
                            </Badge>
                          ) : null}
                        </div>
                        <a
                          href={page.finalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-0.5 inline-flex max-w-[34rem] items-center gap-1 truncate font-mono text-[9px] text-muted transition-colors hover:text-accent-strong"
                        >
                          {pathOf(page.finalUrl)}
                          <ExternalLink className="size-2.5 shrink-0" aria-hidden="true" />
                        </a>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant={page.source === "home" ? "accent" : "default"}>
                          {page.source}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="font-mono text-sm">{page.score ?? "—"}</span>
                        {page.grade ? (
                          <span className="ml-1 font-mono text-[9px] text-muted">{page.grade}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[10px] text-muted">
                        {page.outcome === "analyzed"
                          ? `${page.h1Count} H1 · ${page.headingCount} headings`
                          : "—"}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[10px] text-muted">
                        {page.outcome === "analyzed"
                          ? `${formatNumber(page.textChars)} chars · ${(page.snr * 100).toFixed(0)}%`
                          : "—"}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[10px] text-muted">
                        {page.outcome === "analyzed" ? freshnessLabel(page) : "—"}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[10px] text-muted">
                        {page.outcome === "analyzed" ? faqLabel(page) : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        {page.outcome === "analyzed" ? (
                          <span className="flex flex-wrap gap-1">
                            <Badge variant={page.metaRobots ? "warn" : "pass"}>
                              {page.metaRobots ? "meta" : "meta ok"}
                            </Badge>
                            {page.xRobotsTag ? <Badge variant="warn">header</Badge> : null}
                          </span>
                        ) : (
                          <span className="font-mono text-[10px] text-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => setOpenUrl(open ? null : page.url)}
                          aria-expanded={open}
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
                      <tr key={`${page.url}-detail`} className="bg-panel-2/40">
                        <td colSpan={10} className="border-t border-line px-4 py-3">
                          <PageChecks page={page} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {sampled === 0 ? (
          <p className="px-4 py-6 text-center font-mono text-[11px] text-muted/60">
            No pages were sampled.
          </p>
        ) : null}
      </section>
    </div>
  );
}

function FocusPageCard({ page }: { page: PageAuditResult }) {
  return (
    <section className="overflow-hidden rounded-[4px] border border-accent/30 bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-accent/[0.04] px-4 py-3">
        <div>
          <p className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] text-accent-strong uppercase">
            <Focus className="size-3.5" aria-hidden="true" />
            Focus page drill-down
          </p>
          <p className="mt-0.5 text-[10px] text-muted">
            Not part of the site score unless it was selected in the sample.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge variant={toneFor(page.status)}>{page.status}</Badge>
          <Badge variant="outline">{page.score ?? "n/a"}/100</Badge>
        </div>
      </div>
      <div className="p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-sm font-medium">{page.label}</span>
          <a
            href={page.finalUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-mono text-[10px] text-muted transition-colors hover:text-accent-strong"
          >
            {pathOf(page.finalUrl)}
            <ExternalLink className="size-2.5" aria-hidden="true" />
          </a>
        </div>
        <p className="mt-1 text-xs text-muted">{page.title || page.error || "No page title."}</p>
        {page.outcome === "analyzed" ? (
          <div className="mt-3">
            <PageChecks page={page} />
          </div>
        ) : (
          <div className="mt-3 flex items-start gap-2 rounded-[3px] border border-warn/30 bg-warn/5 p-3">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden="true" />
            <p className="text-xs leading-relaxed text-muted">
              {page.error ?? "This page could not be analyzed."} The site score still comes from the
              sampled pages.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function freshnessLabel(page: PageAuditResult): string {
  if (!page.freshness) return "none";
  const date = page.freshness.iso.slice(0, 10);
  return `${date} · ${page.freshness.source}`;
}

function faqLabel(page: PageAuditResult): string {
  if (page.faqPairs > 0) return `${page.faqPairs} pair${page.faqPairs === 1 ? "" : "s"}`;
  return page.hasFaqSchema ? "schema only" : "none";
}

function PageChecks({ page }: { page: PageAuditResult }) {
  if (page.checks.length === 0) {
    return (
      <p className="flex items-center gap-2 font-mono text-[10px] text-muted">
        <FileSearch className="size-3.5" aria-hidden="true" />
        No page checks were collected.
      </p>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {page.checks.map((check) => (
        <div
          key={check.id}
          className="flex items-start gap-2 rounded-[3px] border border-line bg-panel px-2.5 py-2"
        >
          <StatusIcon status={check.status} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-medium">{check.label}</span>
              <span className="font-mono text-[9px] text-muted">{check.summary}</span>
            </div>
            <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-muted">
              {check.detail}
            </p>
            {check.evidence ? (
              <p className="mt-0.5 font-mono text-[9px] text-muted/60">
                {check.evidence.file}
                {check.evidence.line ? `:${check.evidence.line}` : ""}
              </p>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function CoverageStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="font-mono text-lg leading-none">{formatNumber(value)}</p>
      <p className="mt-1 font-mono text-[9px] tracking-[0.12em] text-muted uppercase">{label}</p>
    </div>
  );
}
