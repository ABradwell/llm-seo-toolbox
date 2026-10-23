"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  /** Accessible name for the group. */
  label: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "flex items-center gap-0.5 rounded-[3px] border border-line bg-panel p-0.5",
        className,
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={
            value === option.value
              ? "rounded-[2px] bg-ink px-2 py-1 font-mono text-[9px] tracking-[0.08em] text-parchment uppercase"
              : "rounded-[2px] px-2 py-1 font-mono text-[9px] tracking-[0.08em] text-muted uppercase transition-colors hover:text-foreground"
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
