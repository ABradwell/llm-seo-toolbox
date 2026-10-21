"use client";

import { Eye, FileText, Scissors, Sigma } from "lucide-react";

import { CopyButton } from "@/components/copy-button";
import { LineNumberedCode } from "@/components/workspace/code-pane";
import { Badge } from "@/components/ui/badge";
import { formatBytes, formatNumber } from "@/lib/utils";
import type { AuditResult } from "@/types/audit";

export function ScraperSimulator({ audit }: { audit: AuditResult }) {
  const vision = audit.vision;
  const removedTotal =
    vision.removed.scripts +
    vision.removed.styles +
    vision.removed.landmarks +
    vision.removed.svg +
    vision.removed.frames;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[4px] border border-line bg-panel/60 px-3 py-2.5">
        <span className="font-mono text-[9px] tracking-[0.14em] text-muted uppercase">
          stripped before parsing
        </span>
        <NoiseCount label="scripts" value={vision.removed.scripts} />
        <NoiseCount label="style blocks" value={vision.removed.styles} />
        <NoiseCount label="chrome landmarks" value={vision.removed.landmarks} />
        <NoiseCount label="inline SVG" value={vision.removed.svg} />
        <NoiseCount label="iframes" value={vision.removed.frames} />
        <span className="ml-auto font-mono text-[10px] text-muted/60">
          {formatNumber(removedTotal)} elements removed
        </span>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
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

      <p className="text-[11px] leading-relaxed text-muted/80">
        This follows the same path as a non-JS crawler: fetch the initial HTML, discard scripts,
        styles and chrome, then convert what remains into text. Content that only appears after
        client-side JavaScript will not be here.
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
    <div className="rounded-[4px] border border-line bg-panel p-3.5">
      <div className="flex items-center gap-1.5">
        <Icon className="size-3.5 text-accent" aria-hidden="true" />
        <p className="font-mono text-[9px] tracking-[0.12em] text-muted uppercase">{label}</p>
      </div>
      <p className="mt-2 font-mono text-xl tracking-tight">{value}</p>
      <p className="mt-0.5 text-[10px] text-muted">{sub}</p>
    </div>
  );
}

function NoiseCount({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex items-center gap-1.5 font-mono text-[10px]">
      <span className="text-foreground">{value}</span>
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
          ? "flex min-h-[420px] min-w-0 flex-col overflow-hidden rounded-[4px] border border-accent/25 bg-panel"
          : "flex min-h-[420px] min-w-0 flex-col overflow-hidden rounded-[4px] border border-line bg-panel/60"
      }
    >
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="font-mono text-[11px]">{title}</h3>
            <Badge variant={highlight ? "accent" : "default"}>{badge}</Badge>
          </div>
          <p className="mt-0.5 truncate font-mono text-[9px] text-muted">{subtitle}</p>
        </div>
        <CopyButton value={value} label="Copy" />
      </div>
      <LineNumberedCode value={value} maxHeight="max-h-[560px]" className="flex-1" />
      <div className="border-t border-line px-3 py-1.5 font-mono text-[9px] tracking-[0.1em] text-muted/50 uppercase">
        {language}
      </div>
    </section>
  );
}
