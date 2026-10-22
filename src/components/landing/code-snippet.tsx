import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

interface CodeSnippetProps {
  label: string;
  code: string;
  note?: string;
  className?: string;
}

/** Copyable code panel used by the CLI and GitHub Action install sections. */
export function CodeSnippet({ label, code, note, className }: CodeSnippetProps) {
  return (
    <div
      className={cn(
        "min-w-0 overflow-hidden rounded-[4px] border border-ink/20 bg-code",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-code-foreground/10 bg-code-foreground/[0.04] px-3 py-1.5">
        <span className="flex items-center gap-2 font-mono text-[9px] tracking-[0.14em] text-code-muted uppercase">
          <span className="size-1.5 rounded-[1px] bg-accent-light" aria-hidden="true" />
          {label}
        </span>
        <CopyButton
          value={code}
          label="Copy"
          copiedLabel="Copied"
          className="h-6 px-1.5 text-code-muted hover:bg-code-foreground/10 hover:text-code-foreground"
        />
      </div>

      <pre className="overflow-x-auto p-3.5 font-mono text-[11px] leading-6 sm:text-[11.5px]">
        <code>
          {code.split("\n").map((line, index) => (
            <span
              key={`${index}-${line}`}
              className={cn(
                "block whitespace-pre",
                line.trimStart().startsWith("#") ? "text-code-muted/70" : "text-code-foreground/90",
              )}
            >
              {line || " "}
            </span>
          ))}
        </code>
      </pre>

      {note ? (
        <div className="border-t border-code-foreground/10 bg-code-foreground/[0.03] px-3.5 py-2 font-mono text-[10px] leading-relaxed text-code-muted">
          {note}
        </div>
      ) : null}
    </div>
  );
}
