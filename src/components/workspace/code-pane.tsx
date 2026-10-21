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
    <div className={cn("relative overflow-auto bg-code", maxHeight, className)}>
      <div className="grid min-w-full font-mono text-[11.5px] leading-5">
        {lines.map((line, index) => (
          <div key={index} className="grid grid-cols-[auto_1fr] hover:bg-code-foreground/[0.04]">
            <span
              className="sticky left-0 border-r border-code-foreground/10 bg-code px-2 text-right text-code-muted/55 select-none"
              style={{ minWidth: `${width + 2.5}ch` }}
              aria-hidden="true"
            >
              {index + 1}
            </span>
            <span className="px-3 break-words whitespace-pre-wrap text-code-foreground/85">
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
    <div className={cn("overflow-hidden rounded-[3px] border border-line bg-code", className)}>
      <div className="flex items-center justify-between border-b border-code-foreground/10 px-3 py-1.5">
        <span className="font-mono text-[9px] tracking-[0.14em] text-code-muted uppercase">
          {language}
        </span>
        <CopyButton
          value={code}
          label="Copy fix"
          variant="ghost"
          className="h-6 px-1.5 text-code-muted hover:bg-code-foreground/10 hover:text-code-foreground"
        />
      </div>
      <LineNumberedCode value={code} maxHeight="max-h-72" />
    </div>
  );
}
