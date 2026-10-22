import { ArrowRight, Compass, FileText, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { SITE_TYPES } from "@/lib/site-types";
import { cn } from "@/lib/utils";

interface PipelineStepProps {
  index: string;
  title: string;
  icon: LucideIcon;
  description: string;
  tags: string[];
  highlighted?: boolean;
  detail?: ReactNode;
}

function PipelineStep({
  index,
  title,
  icon: Icon,
  description,
  tags,
  highlighted,
  detail,
}: PipelineStepProps) {
  return (
    <li
      className={cn(
        "flex h-full min-w-0 flex-col rounded-[4px] border bg-panel p-4",
        highlighted ? "border-accent/45" : "border-line",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex size-7 items-center justify-center rounded-[2px] border border-line bg-panel-2/60">
          <Icon className="size-3.5 text-accent" aria-hidden="true" />
        </span>
        <span className="font-mono text-[9px] tracking-[0.14em] text-muted/60 uppercase">
          step {index}
        </span>
      </div>
      <h3 className="mt-3 text-sm font-medium tracking-tight">{title}</h3>
      <p className="mt-1 text-[11px] leading-relaxed text-muted">{description}</p>
      {detail}
      <ul className="mt-auto flex flex-wrap gap-1 pt-3">
        {tags.map((tag) => (
          <li
            key={tag}
            className="rounded-[2px] border border-line bg-panel-2/50 px-1.5 py-0.5 font-mono text-[9px] text-muted"
          >
            {tag}
          </li>
        ))}
      </ul>
    </li>
  );
}

function PipelineArrow() {
  return (
    <li className="flex items-center justify-center py-0.5 text-muted/45" aria-hidden="true">
      <ArrowRight className="size-4 rotate-90 lg:rotate-0" />
    </li>
  );
}

export function PipelineDiagram() {
  return (
    <section id="pipeline" className="scroll-mt-20 border-b border-line">
      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:py-16">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="font-mono text-[10px] tracking-[0.2em] text-accent-strong uppercase">
              02 / the pipeline
            </p>
            <h2 className="mt-3 text-2xl font-medium tracking-tight sm:text-4xl">
              One scan. Three decisions.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">
              The audit reads the raw site once, classifies what kind of site it is, then scores the
              AI compatibility checks that matter for that profile. If the classifier guesses wrong,
              you can pin a different profile in the workspace.
            </p>
          </div>

          <Link
            href="/app"
            className="inline-flex items-center gap-1.5 font-mono text-[11px] text-accent-strong transition-opacity hover:opacity-75"
          >
            Run the pipeline
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>

        <ol
          className="mt-8 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-stretch"
          aria-label="Raw site to site classification to site AI compatibility"
        >
          <PipelineStep
            index="01"
            title="Raw site"
            icon={FileText}
            description="Fetch the homepage HTML, manifests and structured data. No browser, no rendering, no guesswork about what a crawler sees."
            tags={["HTML", "/llms.txt", "/robots.txt", "sitemap", "JSON-LD"]}
          />
          <PipelineArrow />
          <PipelineStep
            index="02"
            title="Site classification"
            icon={Compass}
            description="URL shape, schema types, metadata, markup and manifest signals vote for one of six profiles."
            tags={["6 profiles", "signal evidence", "manual override"]}
            highlighted
            detail={
              <div className="mt-3 flex items-center justify-between gap-2 rounded-[2px] border border-accent/30 bg-accent/5 px-2 py-1.5 font-mono text-[10px]">
                <span>Docs</span>
                <span className="text-muted">86% · auto</span>
              </div>
            }
          />
          <PipelineArrow />
          <PipelineStep
            index="03"
            title="Site AI compatibility"
            icon={ShieldCheck}
            description="The profile decides which checks count: expected schema, OpenAPI relevance and the warnings worth fixing."
            tags={["4 pillars", "profile schema", "score + fixes"]}
            detail={
              <div className="mt-3 flex items-center justify-between gap-2 rounded-[2px] border border-line bg-panel-2/50 px-2 py-1.5 font-mono text-[10px]">
                <span>compatibility</span>
                <span className="text-pass">94 / A</span>
              </div>
            }
          />
        </ol>

        <p className="mt-3 font-mono text-[10px] leading-relaxed text-muted/70">
          Profiles: {SITE_TYPES.map((type) => type.shortLabel).join(" · ")} — switch profile in the
          workspace or with <code className="text-foreground/80">?type=</code> on the audit API.
        </p>
      </div>
    </section>
  );
}
