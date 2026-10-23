"use client";

import { ArrowRight, Check, ChevronDown, Download, FileText, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

import { CopyButton } from "@/components/copy-button";
import { StatusIcon } from "@/components/status-icon";
import { ScoreRing } from "@/components/workspace/score-ring";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buildPlainBrief, renderChangeRequests, type PlainIssue } from "@/lib/brief";
import { downloadText } from "@/lib/download";
import { PLAIN_OWNER_LABELS, PLAIN_PILLAR_NAMES } from "@/lib/plain-language";
import { buildReport } from "@/lib/report";
import { scoreTone } from "@/lib/score";
import { cn } from "@/lib/utils";
import type { AuditResult } from "@/types/audit";

export function PlainReport({
  audit,
  onRefresh,
  refreshing,
  onShowTechnical,
}: {
  audit: AuditResult;
  onRefresh: () => void;
  refreshing: boolean;
  /** Switch to the technical view and scroll to this element id. */
  onShowTechnical: (anchorId: string) => void;
}) {
  const brief = useMemo(() => buildPlainBrief(buildReport(audit)), [audit]);
  const issues = useMemo(() => [...brief.mustFix, ...brief.improve], [brief]);
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(() => new Set());
  const [includeTechnical, setIncludeTechnical] = useState(false);

  const selectedIds = issues.filter((issue) => !excluded.has(issue.id)).map((issue) => issue.id);
  const reportUrl = technicalUrl(audit.url);
  const text = renderChangeRequests(brief, { includeTechnical, selectedIds, reportUrl });

  function toggleIssue(id: string) {
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="min-w-0 rounded-[4px] border border-line bg-panel p-4 sm:p-5">
          <p className="font-mono text-[9px] tracking-[0.16em] text-muted uppercase">
            how AI assistants see {audit.scope === "site" ? "your site" : "this page"}
          </p>
          <div className="mt-3 flex flex-col gap-5 sm:flex-row sm:items-center">
            <ScoreRing
              score={audit.score}
              size={112}
              strokeWidth={6}
              gradeLabel={`grade ${audit.grade}`}
              className="shrink-0 self-center"
            />
            <div className="min-w-0 flex-1">
              <Badge variant={scoreTone(audit.score)}>{brief.gradeLabel}</Badge>
              <p className="mt-3 text-base leading-relaxed text-foreground sm:text-lg">
                {brief.summary}
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 border-t border-line pt-3">
            <Count value={brief.mustFix.length} label="must fix" tone="fail" />
            <Count value={brief.improve.length} label="worth improving" tone="warn" />
            <Count value={brief.working.length} label="working well" tone="pass" />
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {audit.pillars.map((pillar) => (
              <div key={pillar.id}>
                <div className="flex items-center justify-between font-mono text-[10px]">
                  <span className="text-muted">{PLAIN_PILLAR_NAMES[pillar.id]}</span>
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
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line pt-3">
            <Button variant="secondary" size="sm" onClick={onRefresh} disabled={refreshing}>
              <RefreshCw className={cn(refreshing && "animate-spin")} aria-hidden="true" />
              Re-run
            </Button>
            <CopyButton
              value={typeof window === "undefined" ? audit.url : window.location.href}
              label="Copy link"
              variant="ghost"
            />
          </div>
        </section>

        <ChangeRequestPanel
          text={text}
          domain={audit.domain}
          total={issues.length}
          selected={selectedIds.length}
          includeTechnical={includeTechnical}
          onIncludeTechnical={setIncludeTechnical}
        />
      </div>

      <IssueSection
        title="Must fix"
        description="These stop AI assistants from finding or reading your content."
        issues={brief.mustFix}
        excluded={excluded}
        onToggle={toggleIssue}
        onShowTechnical={onShowTechnical}
      />
      <IssueSection
        title="Worth improving"
        description="Nothing is broken here, but each change makes your content easier to use."
        issues={brief.improve}
        excluded={excluded}
        onToggle={toggleIssue}
        onShowTechnical={onShowTechnical}
      />

      <WorkingWell entries={brief.working} />
    </div>
  );
}

function technicalUrl(fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const url = new URL(window.location.href);
  url.searchParams.set("view", "technical");
  url.hash = "";
  return url.toString();
}

function Count({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: "pass" | "warn" | "fail";
}) {
  return (
    <div>
      <p
        className={cn(
          "font-mono text-xl leading-none",
          tone === "pass" && "text-pass",
          tone === "warn" && "text-warn",
          tone === "fail" && "text-fail",
        )}
      >
        {value}
      </p>
      <p className="mt-1 font-mono text-[9px] tracking-[0.12em] text-muted uppercase">{label}</p>
    </div>
  );
}

function ChangeRequestPanel({
  text,
  domain,
  total,
  selected,
  includeTechnical,
  onIncludeTechnical,
}: {
  text: string;
  domain: string;
  total: number;
  selected: number;
  includeTechnical: boolean;
  onIncludeTechnical: (value: boolean) => void;
}) {
  const [previewOpen, setPreviewOpen] = useState(true);

  return (
    <section
      id="change-requests"
      className="flex min-w-0 flex-col rounded-[4px] border border-line bg-panel"
      aria-labelledby="change-requests-title"
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 id="change-requests-title" className="font-mono text-[11px] tracking-[0.1em] uppercase">
          Change requests
        </h2>
        <Badge variant={total === 0 ? "pass" : "accent"}>
          {total === 0 ? "none needed" : `${selected} of ${total}`}
        </Badge>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="text-sm leading-relaxed text-foreground/85">
          {total === 0
            ? "Every check passed, so there is nothing to ask your developer for right now."
            : "A ready-to-send list of the changes below, written for your developer. Paste it into an email, a ticket or a chat message."}
        </p>

        <label className="flex items-start gap-2 text-xs leading-relaxed text-muted">
          <input
            type="checkbox"
            checked={includeTechnical}
            onChange={(event) => onIncludeTechnical(event.target.checked)}
            className="mt-0.5 size-3.5 accent-[var(--accent)]"
          />
          <span>
            Include technical details for developers
            <span className="block text-[11px] text-muted/70">
              Adds file locations, the exact finding and a suggested fix for each item.
            </span>
          </span>
        </label>

        <div className="flex flex-wrap gap-1.5">
          <CopyButton
            value={text}
            label="Copy change requests"
            copiedLabel="Copied"
            variant="default"
            disabled={total === 0}
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={total === 0}
            onClick={() =>
              downloadText(
                `change-requests-${domain.replace(/[^a-z0-9.-]+/gi, "-")}.md`,
                text,
                "text/markdown",
              )
            }
          >
            <Download aria-hidden="true" />
            Download .md
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPreviewOpen((value) => !value)}
            aria-expanded={previewOpen}
            aria-controls="change-requests-preview"
          >
            <FileText aria-hidden="true" />
            {previewOpen ? "Hide preview" : "Preview"}
          </Button>
        </div>

        {previewOpen ? (
          <pre
            id="change-requests-preview"
            className="max-h-64 overflow-auto rounded-[3px] border border-line bg-background p-3 font-mono text-[11px] leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap text-foreground/85"
          >
            {text}
          </pre>
        ) : null}
      </div>

      <p className="mt-auto border-t border-line px-4 py-2 font-mono text-[9px] text-muted/60">
        untick an item below to leave it out · ordered by impact
      </p>
    </section>
  );
}

function IssueSection({
  title,
  description,
  issues,
  excluded,
  onToggle,
  onShowTechnical,
}: {
  title: string;
  description: string;
  issues: PlainIssue[];
  excluded: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onShowTechnical: (anchorId: string) => void;
}) {
  if (issues.length === 0) return null;

  return (
    <section aria-label={title}>
      <div className="mb-2">
        <h2 className="font-mono text-[11px] tracking-[0.14em] uppercase">
          {title} <span className="text-muted">({issues.length})</span>
        </h2>
        <p className="mt-0.5 text-[11px] text-muted">{description}</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {issues.map((issue) => (
          <PlainIssueCard
            key={issue.id}
            issue={issue}
            included={!excluded.has(issue.id)}
            onToggle={() => onToggle(issue.id)}
            onShowTechnical={() => onShowTechnical(`check-${issue.pillarId}-${issue.id}`)}
          />
        ))}
      </div>
    </section>
  );
}

function PlainIssueCard({
  issue,
  included,
  onToggle,
  onShowTechnical,
}: {
  issue: PlainIssue;
  included: boolean;
  onToggle: () => void;
  onShowTechnical: () => void;
}) {
  const [open, setOpen] = useState(false);
  const moreId = `plain-more-${issue.id}`;

  return (
    <article
      id={`plain-${issue.id}`}
      className={cn(
        "flex flex-col rounded-[4px] border bg-panel p-4 transition-opacity",
        issue.status === "fail" ? "border-fail/25" : "border-warn/25",
        !included && "opacity-60",
      )}
    >
      <div className="flex items-center justify-between gap-3 font-mono text-[9px] tracking-[0.12em] text-muted uppercase">
        <span className="flex items-center gap-1.5">
          <StatusIcon status={issue.status} />
          {issue.area}
        </span>
        <span className="text-right">{issue.affects}</span>
      </div>

      <h3 className="mt-2 text-sm font-medium">{issue.title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-foreground/85">{issue.problem}</p>

      {issue.asks.length > 0 ? (
        <div className="mt-3">
          <p className="font-mono text-[9px] tracking-[0.12em] text-muted uppercase">
            What to ask for · usually {PLAIN_OWNER_LABELS[issue.owner]}
          </p>
          <ul className="mt-1.5 space-y-1">
            {issue.asks.map((ask) => (
              <li key={ask} className="flex gap-2 text-xs leading-relaxed text-foreground/80">
                <span
                  className="mt-[7px] size-1 shrink-0 rounded-full bg-accent"
                  aria-hidden="true"
                />
                <span>{ask}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {open ? (
        <div id={moreId} className="mt-3 space-y-2 border-l-2 border-accent/50 pl-3">
          {issue.why ? (
            <div>
              <p className="font-mono text-[9px] tracking-[0.12em] text-muted uppercase">
                Why it matters
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-foreground/80">{issue.why}</p>
            </div>
          ) : null}
          {issue.good ? (
            <div>
              <p className="font-mono text-[9px] tracking-[0.12em] text-muted uppercase">
                What good looks like
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-foreground/80">{issue.good}</p>
            </div>
          ) : null}
          {issue.pages.length > 0 ? (
            <div>
              <p className="font-mono text-[9px] tracking-[0.12em] text-muted uppercase">
                Example pages
              </p>
              <ul className="mt-0.5 space-y-0.5">
                {issue.pages.map((page) => (
                  <li key={page} className="truncate font-mono text-[10px] text-muted">
                    <a
                      href={page}
                      target="_blank"
                      rel="noreferrer"
                      className="transition-colors hover:text-accent-strong"
                    >
                      {pathOf(page)}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-auto pt-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-3">
          <label className="flex items-center gap-1.5 font-mono text-[10px] text-muted">
            <input
              type="checkbox"
              checked={included}
              onChange={onToggle}
              className="size-3.5 accent-[var(--accent)]"
            />
            include in requests
          </label>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls={moreId}
            className="inline-flex items-center gap-1 font-mono text-[10px] text-muted transition-colors hover:text-accent-strong"
          >
            {open ? "show less" : "tell me more"}
            <ChevronDown
              className={cn("size-3 transition-transform", open && "rotate-180")}
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            onClick={onShowTechnical}
            className="ml-auto inline-flex items-center gap-1 font-mono text-[10px] text-muted transition-colors hover:text-accent-strong"
          >
            technical detail
            <ArrowRight className="size-3" aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  );
}

function WorkingWell({ entries }: { entries: { id: string; title: string }[] }) {
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;

  return (
    <section className="rounded-[4px] border border-line bg-panel">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="plain-working-well"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] uppercase">
          <Check className="size-3.5 text-pass" aria-hidden="true" />
          Working well <span className="text-muted">({entries.length})</span>
        </span>
        <ChevronDown
          className={cn("size-3.5 text-muted transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <ul
          id="plain-working-well"
          className="grid gap-x-4 gap-y-1.5 border-t border-line px-4 py-3 sm:grid-cols-2"
        >
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-center gap-2 text-xs text-foreground/80">
              <StatusIcon status="pass" />
              {entry.title}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function pathOf(value: string): string {
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}` || "/";
  } catch {
    return value;
  }
}
