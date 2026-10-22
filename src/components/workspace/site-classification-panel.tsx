"use client";

import { Compass, Loader2, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { SITE_TYPES } from "@/lib/site-types";
import { cn } from "@/lib/utils";
import type { SiteClassification, SiteType } from "@/types/audit";

export type SiteTypeSelection = SiteType | "auto";

const LOW_CONFIDENCE_THRESHOLD = 30;
const SITE_TYPES_BY_ID = new Map(SITE_TYPES.map((type) => [type.id, type]));

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
  const lowConfidence = !overridden && classification.confidence < LOW_CONFIDENCE_THRESHOLD;
  const alternatives = classification.alternatives ?? [];
  const showBreakdown = lowConfidence && alternatives.length > 0;

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
            <h2 className={cn("text-lg font-medium tracking-tight", lowConfidence && "text-fail")}>
              {classification.label}
            </h2>
            <span className="font-mono text-[10px] text-muted">
              {overridden ? "user pinned" : `${classification.confidence}% confidence`}
            </span>
          </div>

          {showBreakdown ? (
            <div className="mt-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[9px] tracking-[0.12em] text-muted uppercase">
                  Profile confidence
                </span>
                <span className="font-mono text-[9px] tracking-[0.12em] text-fail uppercase">
                  below {LOW_CONFIDENCE_THRESHOLD}%
                </span>
              </div>
              <ul
                className="mt-1.5 grid grid-cols-2 gap-x-5 gap-y-1 sm:grid-cols-3"
                aria-label="Profile confidence by option"
              >
                {alternatives.map((alternative) => {
                  const definition = SITE_TYPES_BY_ID.get(alternative.type);
                  const isDetected = alternative.type === classification.detected.type;
                  return (
                    <li
                      key={alternative.type}
                      className="flex min-w-0 items-center gap-1.5"
                      aria-label={`${definition?.label ?? alternative.label}: ${alternative.confidence}% confidence${isDetected ? ", applied profile" : ""}`}
                    >
                      <span
                        title={definition?.label ?? alternative.label}
                        className={cn(
                          "w-[62px] shrink-0 truncate font-mono text-[9px] tracking-[0.02em]",
                          isDetected ? "font-medium text-foreground" : "text-muted",
                        )}
                      >
                        {definition?.shortLabel ?? alternative.label}
                      </span>
                      <span
                        className="h-[3px] min-w-4 flex-1 overflow-hidden rounded-[1px] bg-panel-2"
                        aria-hidden="true"
                      >
                        <span
                          className={cn(
                            "block h-full",
                            alternative.confidence >= 70
                              ? "bg-pass"
                              : alternative.confidence >= LOW_CONFIDENCE_THRESHOLD
                                ? "bg-warn"
                                : "bg-fail",
                            !isDetected && "opacity-60",
                          )}
                          style={{ width: `${alternative.confidence}%` }}
                        />
                      </span>
                      <span
                        className={cn(
                          "w-6 shrink-0 text-right font-mono text-[9px] tabular-nums",
                          isDetected ? "text-foreground" : "text-muted",
                        )}
                      >
                        {alternative.confidence}%
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <div className="mt-2 h-1 overflow-hidden rounded-[1px] bg-panel-2">
              <div
                className={cn(
                  "h-full",
                  overridden ? "bg-accent" : confidence >= 70 ? "bg-pass" : "bg-warn",
                )}
                style={{ width: `${overridden ? 100 : classification.confidence}%` }}
              />
            </div>
          )}

          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            {overridden
              ? `Auto-detection saw ${classification.detected.label} at ${classification.detected.confidence}%. The pinned profile decides which checks are scored.`
              : lowConfidence
                ? `No profile cleared ${LOW_CONFIDENCE_THRESHOLD}% confidence. ${classification.label} is the fallback — pick the closest profile above to re-run the audit.`
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
