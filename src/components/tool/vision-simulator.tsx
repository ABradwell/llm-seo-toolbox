"use client";

import { Eye, FileText, Scissors, Sigma } from "lucide-react";

import { CopyButton } from "@/components/copy-button";
import { Badge } from "@/components/ui/badge";
import { formatBytes, formatNumber } from "@/lib/utils";
import type { AuditResult } from "@/types/audit";

export function VisionSimulator({ audit }: { audit: AuditResult }) {
  const vision = audit.vision;
  const removedTotal =
    vision.removed.scripts +
    vision.removed.styles +
    vision.removed.landmarks +
    vision.removed.svg +
    vision.removed.frames;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={FileText}
          label="HTML as served"
          value={formatBytes(vision.htmlBytes)}
          sub="initial response"
        />
        <StatCard
          icon={Eye}
          label="Markdown as read"
          value={formatBytes(vision.markdownBytes)}
          sub="content an LLM ingests"
        />
        <StatCard
          icon={Scissors}
          label="Payload reduction"
          value={`${vision.reductionPct}%`}
          sub="before tokens are spent"
        />
        <StatCard
          icon={Sigma}
          label="Estimated tokens"
          value={`≈ ${formatNumber(vision.tokenEstimate.markdown)}`}
          sub={`vs ${formatNumber(vision.tokenEstimate.html)} for raw HTML`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-line bg-panel/40 px-5 py-4">
        <span className="font-mono text-[11px] tracking-[0.16em] text-muted uppercase">
          Stripped before parsing
        </span>
        <NoiseCount label="scripts" value={vision.removed.scripts} />
        <NoiseCount label="style blocks" value={vision.removed.styles} />
        <NoiseCount label="chrome landmarks" value={vision.removed.landmarks} />
        <NoiseCount label="inline SVG" value={vision.removed.svg} />
        <NoiseCount label="iframes" value={vision.removed.frames} />
        <span className="ml-auto font-mono text-xs text-muted/70">
          {formatNumber(removedTotal)} elements removed
        </span>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <CodePane
          title="Raw HTML"
          badge="noise included"
          subtitle={`Script and style bodies are redacted for safety. ${vision.rawTruncated ? "Preview truncated." : ""}`}
          value={vision.rawHtml}
          language="html"
        />
        <CodePane
          title="Clean Markdown"
          badge="LLM view"
          subtitle={`${formatNumber(vision.textBytes)} bytes of readable text, converted to markdown.${vision.markdownTruncated ? " Preview truncated." : ""}`}
          value={vision.markdown}
          language="markdown"
          highlight
        />
      </div>

      <p className="text-sm leading-relaxed text-muted/80">
        This simulation follows the same path an AI crawler takes: fetch the initial HTML, discard
        scripts, styles, and chrome, then convert what remains into text. Content that only appears
        after client-side JavaScript will not be here.
      </p>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof FileText;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-panel/60 p-5">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-acid" aria-hidden="true" />
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">{label}</p>
      </div>
      <p className="mt-4 text-2xl font-medium tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted">{sub}</p>
    </div>
  );
}

function NoiseCount({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex items-center gap-2 text-sm">
      <span className="font-mono text-foreground">{value}</span>
      <span className="text-muted">{label}</span>
    </span>
  );
}

function CodePane({
  title,
  subtitle,
  badge,
  value,
  language,
  highlight = false,
}: {
  title: string;
  subtitle: string;
  badge: string;
  value: string;
  language: string;
  highlight?: boolean;
}) {
  return (
    <section
      className={
        highlight
          ? "flex min-h-[420px] flex-col overflow-hidden rounded-2xl border border-acid/25 bg-panel/70"
          : "flex min-h-[420px] flex-col overflow-hidden rounded-2xl border border-line bg-panel/50"
      }
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">{title}</h3>
            <Badge variant={highlight ? "accent" : "default"}>{badge}</Badge>
          </div>
          <p className="mt-1 truncate font-mono text-xs text-muted">{subtitle}</p>
        </div>
        <CopyButton value={value} label="Copy" />
      </div>
      <pre
        className="max-h-[560px] flex-1 overflow-auto p-5 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap text-foreground/85"
        data-language={language}
      >
        <code>{value}</code>
      </pre>
    </section>
  );
}
