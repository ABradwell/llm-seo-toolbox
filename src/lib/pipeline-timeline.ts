import { PIPELINE_PHASES, PIPELINE_STEPS, PIPELINE_TOTAL_MS } from "./pipeline-steps";

/**
 * A pure, clock-free model of the loading sequence. The hook feeds it frame
 * deltas; tests feed it fixed ones.
 *
 * - Before the response, steps play at their nominal pace.
 * - After the response, the remainder plays at CATCH_UP_RATE (CACHED_RATE for cached audits).
 * - If the response is late, the sequence holds inside the final step.
 * - An error freezes the sequence on the step that owns it.
 */

export const CATCH_UP_RATE = 2.5;
export const CACHED_RATE = 4;
/** Frames longer than this (a background tab) advance by this much only. */
export const MAX_FRAME_MS = 64;

const LAST_STEP = PIPELINE_STEPS[PIPELINE_STEPS.length - 1];
export const HOLD_AT_MS = PIPELINE_TOTAL_MS - LAST_STEP.ms * 0.25;

export interface PipelineSignal {
  responded: boolean;
  cached: boolean;
  failedStepId: string | null;
}

export interface PipelineTimeline {
  /** Nominal milliseconds into the sequence. */
  position: number;
  /** Wall-clock milliseconds since the sequence started. */
  elapsed: number;
  holding: boolean;
  failedStepIndex: number | null;
}

export type PipelineStatus = "pending" | "active" | "done" | "failed";

export interface PipelinePhaseState {
  status: PipelineStatus;
  /** 0–1 progress through the phase. */
  fraction: number;
  completedSteps: number;
}

export interface PipelineSnapshot {
  steps: PipelineStatus[];
  phases: PipelinePhaseState[];
  activePhaseIndex: number | null;
  /** 0–1 progress through the whole sequence. */
  progress: number;
  elapsed: number;
  holding: boolean;
  done: boolean;
  failed: boolean;
}

export function createTimeline(): PipelineTimeline {
  return { position: 0, elapsed: 0, holding: false, failedStepIndex: null };
}

export function isSettled(timeline: PipelineTimeline): boolean {
  return timeline.failedStepIndex !== null || timeline.position >= PIPELINE_TOTAL_MS;
}

export function advance(
  timeline: PipelineTimeline,
  deltaMs: number,
  signal: PipelineSignal,
): PipelineTimeline {
  if (isSettled(timeline)) return timeline;

  if (signal.failedStepId) {
    const index = PIPELINE_STEPS.findIndex((step) => step.id === signal.failedStepId);
    if (index >= 0) return { ...timeline, holding: false, failedStepIndex: index };
  }

  const delta = Math.min(MAX_FRAME_MS, Math.max(0, deltaMs));
  const rate = signal.responded ? (signal.cached ? CACHED_RATE : CATCH_UP_RATE) : 1;
  let position = Math.min(PIPELINE_TOTAL_MS, timeline.position + delta * rate);
  const holding = !signal.responded && position >= HOLD_AT_MS;
  if (holding) position = HOLD_AT_MS;

  return { position, elapsed: timeline.elapsed + delta, holding, failedStepIndex: null };
}

function stepStatus(timeline: PipelineTimeline, index: number): PipelineStatus {
  const { failedStepIndex, position } = timeline;
  if (failedStepIndex !== null) {
    if (index < failedStepIndex) return "done";
    return index === failedStepIndex ? "failed" : "pending";
  }
  const step = PIPELINE_STEPS[index];
  if (position >= step.start + step.ms) return "done";
  return position >= step.start ? "active" : "pending";
}

export function snapshot(timeline: PipelineTimeline): PipelineSnapshot {
  const steps = PIPELINE_STEPS.map((_, index) => stepStatus(timeline, index));

  const phases = PIPELINE_PHASES.map((_, phaseIndex): PipelinePhaseState => {
    const owned = PIPELINE_STEPS.flatMap((step, index) =>
      step.phaseIndex === phaseIndex ? [{ step, status: steps[index] }] : [],
    );
    const statuses = owned.map((entry) => entry.status);
    const completedSteps = statuses.filter((status) => status === "done").length;
    const active = owned.find((entry) => entry.status === "active");
    const activeFraction = active
      ? Math.min(1, (timeline.position - active.step.start) / active.step.ms)
      : 0;
    const status: PipelineStatus = statuses.includes("failed")
      ? "failed"
      : completedSteps === owned.length
        ? "done"
        : statuses.some((value) => value !== "pending")
          ? "active"
          : "pending";
    return { status, fraction: (completedSteps + activeFraction) / owned.length, completedSteps };
  });

  const activePhaseIndex = phases.findIndex(
    (phase) => phase.status === "active" || phase.status === "failed",
  );

  return {
    steps,
    phases,
    activePhaseIndex: activePhaseIndex >= 0 ? activePhaseIndex : null,
    progress: timeline.position / PIPELINE_TOTAL_MS,
    elapsed: timeline.elapsed,
    holding: timeline.holding,
    done: timeline.failedStepIndex === null && timeline.position >= PIPELINE_TOTAL_MS,
    failed: timeline.failedStepIndex !== null,
  };
}
