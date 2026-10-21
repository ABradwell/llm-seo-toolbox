"use client";

import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

export function LineNumberedCode({
  value,
  className,
  maxHeight = "max-h-[560px]",
  emptyLabel = "No content.",
}: {
  value: string;
  className?: string;
  maxHeight?: string;
  emptyLabel?: string;
}) {
  const lines = value.length > 0 ? value.split("\n") : [emptyLabel];
  const width = String(lines.length).length;

  return (
    <div className={cn("relative overflow-auto bg-[#0b0b0d]", maxHeight, className)}>
      <div className="grid min-w-full font-mono text-[11.5px] leading-5">
        {lines.map((line, index) => (
          <div key={index} className="grid grid-cols-[auto_1fr] hover:bg-panel-2/40">
            <span
              className="sticky left-0 border-r border-line bg-[#0b0b0d] px-2 text-right text-muted/35 select-none"
              style={{ minWidth: `${width + 2.5}ch` }}
              aria-hidden="true"
            >
              {index + 1}
            </span>
            <span className="px-3 break-words whitespace-pre-wrap text-foreground/85">
              {line || " "}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CodeBlock({
  code,
  language,
  className,
}: {
  code: string;
  language: string;
  className?: string;
}) {
  return (
    <div className={cn("overflow-hidden rounded-[3px] border border-line bg-[#0b0b0d]", className)}>
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <span className="font-mono text-[9px] tracking-[0.14em] text-muted uppercase">
          {language}
        </span>
        <CopyButton value={code} label="Copy fix" variant="ghost" className="h-6 px-1.5" />
      </div>
      <LineNumberedCode value={code} maxHeight="max-h-72" />
    </div>
  );
}
