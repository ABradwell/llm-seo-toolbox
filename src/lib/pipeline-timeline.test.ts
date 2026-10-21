import { describe, expect, it } from "vitest";

import { PIPELINE_STEPS, PIPELINE_TOTAL_MS } from "./pipeline-steps";
import {
  CACHED_RATE,
  CATCH_UP_RATE,
  HOLD_AT_MS,
  MAX_FRAME_MS,
  advance,
  createTimeline,
  isSettled,
  snapshot,
  type PipelineSignal,
  type PipelineTimeline,
} from "./pipeline-timeline";

const FRAME = 16;
const inFlight: PipelineSignal = { responded: false, cached: false, failedStepId: null };

/** Plays the timeline frame by frame, switching to `after` once `respondAt` ms have elapsed. */
function play(respondAt: number, after: Partial<PipelineSignal> = {}, limitMs = 30_000) {
  let timeline = createTimeline();
  while (!isSettled(timeline) && timeline.elapsed < limitMs) {
    const responded = timeline.elapsed >= respondAt;
    timeline = advance(
      timeline,
      FRAME,
      responded ? { ...inFlight, responded, ...after } : inFlight,
    );
  }
  return timeline;
}

function runFor(ms: number, signal: PipelineSignal, from: PipelineTimeline = createTimeline()) {
  let timeline = from;
  for (let elapsed = 0; elapsed < ms; elapsed += FRAME) {
    timeline = advance(timeline, FRAME, signal);
  }
  return timeline;
}

describe("pipeline timeline", () => {
  it("starts with the first step active and nothing complete", () => {
    const state = snapshot(advance(createTimeline(), FRAME, inFlight));
    expect(state.steps[0]).toBe("active");
    expect(state.steps.slice(1).every((status) => status === "pending")).toBe(true);
    expect(state.activePhaseIndex).toBe(0);
    expect(state.done).toBe(false);
  });

  it("plays at nominal pace before the response arrives", () => {
    const timeline = runFor(1_000, inFlight);
    expect(timeline.position).toBeCloseTo(timeline.elapsed, 5);
  });

  it("holds inside the final step until the response arrives", () => {
    const timeline = runFor(PIPELINE_TOTAL_MS + 2_000, inFlight);
    const state = snapshot(timeline);
    expect(timeline.position).toBe(HOLD_AT_MS);
    expect(state.holding).toBe(true);
    expect(state.done).toBe(false);
    expect(state.steps.at(-1)).toBe("active");
  });

  it("finishes shortly after a slow response", () => {
    const timeline = play(7_000);
    const remaining = (PIPELINE_TOTAL_MS - HOLD_AT_MS) / CATCH_UP_RATE;
    expect(snapshot(timeline).done).toBe(true);
    expect(timeline.elapsed).toBeLessThanOrEqual(7_000 + remaining + FRAME * 2);
  });

  it("speeds up once a fast response arrives", () => {
    const timeline = play(900);
    expect(snapshot(timeline).done).toBe(true);
    expect(timeline.elapsed).toBeLessThan(PIPELINE_TOTAL_MS);
    expect(timeline.elapsed).toBeGreaterThan(
      900 + (PIPELINE_TOTAL_MS - 900) / CATCH_UP_RATE - FRAME,
    );
  });

  it("plays a cached audit at the cached rate", () => {
    const timeline = play(0, { cached: true });
    expect(timeline.elapsed).toBeLessThanOrEqual(PIPELINE_TOTAL_MS / CACHED_RATE + FRAME);
  });

  it("caps long frames so a background tab does not skip the sequence", () => {
    const timeline = advance(createTimeline(), 5_000, inFlight);
    expect(timeline.position).toBe(MAX_FRAME_MS);
  });

  it("freezes on the step that owns an error", () => {
    const failed = advance(runFor(200, inFlight), FRAME, {
      ...inFlight,
      failedStepId: "fetch-home",
    });
    const state = snapshot(failed);
    const index = PIPELINE_STEPS.findIndex((step) => step.id === "fetch-home");

    expect(isSettled(failed)).toBe(true);
    expect(state.failed).toBe(true);
    expect(state.done).toBe(false);
    expect(state.steps[index - 1]).toBe("done");
    expect(state.steps[index]).toBe("failed");
    expect(state.steps[index + 1]).toBe("pending");
    expect(state.phases[0].status).toBe("failed");
    expect(state.activePhaseIndex).toBe(0);
    expect(advance(failed, FRAME, inFlight)).toBe(failed);
  });

  it("ignores errors that have no step", () => {
    const timeline = advance(createTimeline(), FRAME, { ...inFlight, failedStepId: "unknown" });
    expect(timeline.failedStepIndex).toBeNull();
  });

  it("reports phase fractions that reach one as phases complete", () => {
    const collectMs = PIPELINE_STEPS.filter((step) => step.phaseIndex === 0).reduce(
      (total, step) => total + step.ms,
      0,
    );
    const state = snapshot(runFor(collectMs + FRAME, inFlight));
    expect(state.phases[0]).toMatchObject({ status: "done", fraction: 1, completedSteps: 4 });
    expect(state.phases[1].status).toBe("active");
    expect(state.phases[1].fraction).toBeGreaterThan(0);
    expect(state.phases[1].fraction).toBeLessThan(1);
  });
});
