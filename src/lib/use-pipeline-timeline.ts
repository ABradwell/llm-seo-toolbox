"use client";

import { useEffect, useRef, useState } from "react";

import {
  advance,
  createTimeline,
  isSettled,
  snapshot,
  type PipelineSignal,
  type PipelineSnapshot,
} from "./pipeline-timeline";

/**
 * Drives the pipeline timeline with requestAnimationFrame. The sequence
 * starts on mount, so remount (via `key`) to replay it. `onComplete` fires
 * once when the sequence finishes, never after a failure.
 */
export function usePipelineTimeline(
  signal: PipelineSignal,
  onComplete?: () => void,
): PipelineSnapshot {
  const [timeline, setTimeline] = useState(createTimeline);
  const signalRef = useRef(signal);
  const completeRef = useRef(onComplete);

  useEffect(() => {
    signalRef.current = signal;
    completeRef.current = onComplete;
  });

  useEffect(() => {
    let current = createTimeline();
    let last = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const next = advance(current, now - last, signalRef.current);
      last = now;
      if (next !== current) {
        current = next;
        setTimeline(next);
      }
      if (isSettled(current)) {
        if (current.failedStepIndex === null) completeRef.current?.();
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return snapshot(timeline);
}
