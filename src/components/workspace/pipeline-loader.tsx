"use client";

import { Check, LoaderCircle, X } from "lucide-react";

import { PIPELINE_PHASES, PIPELINE_STEPS } from "@/lib/pipeline-steps";
import type { PipelineStatus } from "@/lib/pipeline-timeline";
import { usePipelineTimeline } from "@/lib/use-pipeline-timeline";
import { cn } from "@/lib/utils";
import type { AuditResult } from "@/types/audit";

interface PipelineLoaderProps {
  /** The domain or URL being audited, shown as the heading. */
  target: string;
  /** The finished audit once the response lands; null while in flight. */
  audit: AuditResult | null;
  /** The step an API error belongs to, which freezes the sequence there. */
  failedStepId: string | null;
  onComplete: () => void;
}

/**
 * The compatibility pipeline loading state (option A, the ledger). Remount
 * it with a new `key` for each audit request so the sequence restarts.
 */
export function PipelineLoader({ target, audit, failedStepId, onComplete }: PipelineLoaderProps) {
  const state = usePipelineTimeline(
    { responded: audit !== null, cached: audit?.meta.cached ?? false, failedStepId },
    onComplete,
  );

  const activePhase =
    state.activePhaseIndex !== null ? PIPELINE_PHASES[state.activePhaseIndex] : null;
  const failedStep = state.failed ? PIPELINE_STEPS[state.steps.indexOf("failed")] : null;
  const status = failedStep
    ? `${failedStep.label} failed`
    : state.done
      ? "Audit ready"
      : state.holding
        ? "Still scoring. Large pages take longer."
        : `${activePhase?.title ?? PIPELINE_PHASES[0].title}…`;

  return (
    <div className="mx-auto w-full max-w-2xl py-2 sm:py-6">
      <p className="font-mono text-[9px] tracking-[0.16em] text-muted uppercase">
        audit pipeline / {audit?.meta.cached ? "cached" : "live run"}
      </p>
      <h1 className="mt-1 truncate text-2xl font-medium tracking-tight sm:text-3xl">{target}</h1>

      <div
        role="progressbar"
        aria-label="Audit progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(state.progress * 100)}
        aria-valuetext={status}
        className="mt-5 space-y-2"
      >
        {PIPELINE_PHASES.map((phase, phaseIndex) => {
          const phaseState = state.phases[phaseIndex];
          const open = phaseState.status === "active" || phaseState.status === "failed";
          const meta =
            phaseState.status === "done"
              ? audit
                ? phase.summary(audit)
                : "done"
              : open
                ? `${phaseState.completedSteps} of ${phase.steps.length}`
                : "";

          return (
            <section
              key={phase.id}
              aria-label={phase.title}
              className={cn(
                "rounded-[4px] border bg-panel transition-colors duration-300 motion-reduce:transition-none",
                phaseState.status === "active" && "border-accent/50",
                phaseState.status === "failed" && "border-fail/40",
                (phaseState.status === "pending" || phaseState.status === "done") && "border-line",
              )}
            >
              <div className="flex items-center gap-3 px-3 py-2.5">
                <span className="w-6 font-mono text-[10px] text-muted">{phaseIndex + 1}/3</span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-[13px] font-medium",
                    phaseState.status === "pending" && "text-muted",
                  )}
                >
                  {phase.title}
                </span>
                <span
                  key={meta}
                  className={cn(
                    "text-right font-mono text-[10.5px] text-muted tabular-nums",
                    phaseState.status === "done" && "text-pass",
                    phaseState.status === "done" && audit && "fresh-in",
                  )}
                >
                  {meta}
                </span>
              </div>

              <div className="mx-3 h-0.5 overflow-hidden bg-line" aria-hidden="true">
                <div
                  className={cn(
                    "h-full",
                    phaseState.status === "done" ? "bg-pass" : "bg-accent",
                    phaseState.status === "failed" && "bg-fail",
                  )}
                  style={{ width: `${phaseState.fraction * 100}%` }}
                />
              </div>

              <div
                aria-hidden={!open}
                className={cn(
                  "grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none",
                  open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                )}
              >
                <ol className="min-h-0 overflow-hidden px-3">
                  {PIPELINE_STEPS.map((step, index) => {
                    if (step.phaseIndex !== phaseIndex) return null;
                    const stepStatus = state.steps[index];
                    const result =
                      stepStatus === "done"
                        ? audit
                          ? step.result(audit)
                          : "done"
                        : stepStatus === "active" && state.holding
                          ? "waiting for response"
                          : stepStatus === "failed"
                            ? "failed"
                            : "";

                    return (
                      <li
                        key={step.id}
                        className="flex items-center gap-2.5 py-1.5 text-xs first:pt-3 last:pb-3"
                      >
                        <StepMark status={stepStatus} />
                        <span
                          className={cn(
                            "min-w-0 flex-1",
                            stepStatus === "pending" && "text-muted",
                            stepStatus === "failed" && "text-fail",
                          )}
                        >
                          {step.label}
                        </span>
                        <span
                          key={result}
                          className={cn(
                            "text-right font-mono text-[10.5px] break-words text-muted",
                            stepStatus === "done" && audit && "fresh-in",
                            stepStatus === "failed" && "text-fail",
                          )}
                        >
                          {result}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </section>
          );
        })}
      </div>

      <p className="mt-3 flex justify-between gap-3 font-mono text-[10px] text-muted">
        <span>{status}</span>
        <span className="tabular-nums">{(state.elapsed / 1000).toFixed(1)}s</span>
      </p>
      <p className="sr-only" aria-live="polite">
        {failedStep ? status : state.done ? "Audit ready" : (activePhase?.title ?? "")}
      </p>
    </div>
  );
}

function StepMark({ status }: { status: PipelineStatus }) {
  const base = "size-3 shrink-0";

  switch (status) {
    case "done":
      return <Check className={cn(base, "text-pass")} aria-hidden="true" />;
    case "failed":
      return <X className={cn(base, "text-fail")} aria-hidden="true" />;
    case "active":
      return (
        <LoaderCircle
          className={cn(base, "text-accent motion-safe:animate-spin")}
          aria-hidden="true"
        />
      );
    default:
      return (
        <span className={cn(base, "flex items-center justify-center")} aria-hidden="true">
          <span className="size-2 rounded-[1px] border border-line-strong" />
        </span>
      );
  }
}
