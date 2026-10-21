"use client";

import { Compass, Loader2, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { SITE_TYPES } from "@/lib/site-types";
import { cn } from "@/lib/utils";
import type { SiteClassification, SiteType } from "@/types/audit";

export type SiteTypeSelection = SiteType | "auto";

export function SiteClassificationPanel({
  classification,
  selected,
  onSelect,
  busy,
}: {
  classification: SiteClassification;
  selected: SiteTypeSelection;
  onSelect: (selection: SiteTypeSelection) => void;
  busy: boolean;
}) {
  const overridden = classification.method === "override";
  const confidence = overridden ? classification.detected.confidence : classification.confidence;

  return (
    <section
      aria-label="Site classification and AI compatibility"
      className="mb-4 overflow-hidden rounded-[4px] border border-line bg-panel"
    >
      <div className="grid lg:grid-cols-[1.05fr_0.95fr]">
        <div className="border-b border-line p-4 lg:border-r lg:border-b-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] text-muted uppercase">
              <Compass className="size-3.5 text-accent" aria-hidden="true" />
              Site classification
            </span>
            <div className="flex items-center gap-1.5">
              {busy ? (
                <Loader2 className="size-3 animate-spin text-muted" aria-label="Reclassifying" />
              ) : null}
              <Badge variant={overridden ? "warn" : "accent"}>
                {overridden ? "manual override" : "auto-detected"}
              </Badge>
              <label htmlFor="site-type-override" className="sr-only">
                Override site classification
              </label>
              <select
                id="site-type-override"
                value={selected}
                disabled={busy}
                onChange={(event) => onSelect(event.target.value as SiteTypeSelection)}
                className="h-6 rounded-[2px] border border-line bg-panel px-1.5 font-mono text-[10px] text-foreground focus:border-accent focus:outline-none disabled:opacity-60"
              >
                <option value="auto">Auto-detect</option>
                {SITE_TYPES.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-lg font-medium tracking-tight">{classification.label}</h2>
            <span className="font-mono text-[10px] text-muted">
              {overridden ? "user pinned" : `${classification.confidence}% confidence`}
            </span>
          </div>

          <div className="mt-2 h-1 overflow-hidden rounded-[1px] bg-panel-2">
            <div
              className={cn(
                "h-full",
                overridden ? "bg-accent" : confidence >= 70 ? "bg-pass" : "bg-warn",
              )}
              style={{ width: `${overridden ? 100 : classification.confidence}%` }}
            />
          </div>

          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            {overridden
              ? `Auto-detection saw ${classification.detected.label} at ${classification.detected.confidence}%. The pinned profile decides which checks are scored.`
              : "The profile is inferred from the HTML, JSON-LD, sitemap paths and manifests already fetched for this audit."}
          </p>

          {classification.signals.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-1" aria-label="Classification signals">
              {classification.signals.map((signal) => (
                <li key={`${signal.type}-${signal.label}`}>
                  <span
                    title={signal.detail}
                    className="inline-flex items-center rounded-[2px] border border-line bg-panel-2/50 px-1.5 py-0.5 font-mono text-[9px] text-muted"
                  >
                    {signal.label}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="p-4">
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] text-muted uppercase">
            <ShieldCheck className="size-3.5 text-accent" aria-hidden="true" />
            Site AI compatibility
          </span>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            {classification.compatibility.note}
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="font-mono text-[9px] tracking-[0.12em] text-muted uppercase">
                OpenAPI surface
              </p>
              <div className="mt-1">
                <Badge variant={classification.compatibility.openApiScored ? "pass" : "default"}>
                  {classification.compatibility.openApiScored ? "scored" : "not scored"}
                </Badge>
              </div>
            </div>
            <div>
              <p className="font-mono text-[9px] tracking-[0.12em] text-muted uppercase">
                Schema expects
              </p>
              <ul className="mt-1 flex flex-wrap gap-1">
                {classification.compatibility.recommendedSchema.map((schema) => (
                  <li
                    key={schema}
                    className="rounded-[2px] border border-line bg-panel-2/50 px-1.5 py-0.5 font-mono text-[9px] text-foreground/80"
                  >
                    {schema}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
