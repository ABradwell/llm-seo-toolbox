import { cn } from "@/lib/utils";

interface TerminalLine {
  kind: "command" | "pass" | "warn" | "info";
  text: string;
}

const LINES: TerminalLine[] = [
  { kind: "command", text: "$ pnpm cli https://nextjs.org/docs" },
  { kind: "pass", text: "GET /llms.txt            200  H1 + 142 markdown links" },
  { kind: "pass", text: "GET /llms-full.txt       200  1.8 MB unpaginated bundle" },
  { kind: "pass", text: "GET /robots.txt          200  GPTBot allow · ClaudeBot allow" },
  { kind: "pass", text: "GET /sitemap.xml         200  1,204 URLs · robots directive L12" },
  { kind: "pass", text: "GET / (initial HTML)      48 KB  SNR 71% · 12,840 chars" },
  { kind: "info", text: "classify                 docs · 86% · TechArticle + 9 /docs paths" },
  { kind: "warn", text: "schema.org               TechArticle found · FAQPage missing" },
  { kind: "info", text: "result                   18 pass · 2 warn · 0 fail  →  94 / A" },
];

export function LiveTerminal() {
  return (
    <div className="relative overflow-hidden rounded-[4px] border border-parchment/15 bg-code shadow-[0_30px_70px_-40px_rgba(0,0,0,0.65)]">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-20 scan-line bg-gradient-to-b from-accent-light/[0.08] to-transparent"
        aria-hidden="true"
      />
      <div className="flex items-center justify-between gap-3 border-b border-code-foreground/10 bg-code-foreground/[0.04] px-3 py-2">
        <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.14em] text-code-muted uppercase">
          <span className="size-1.5 rounded-full bg-accent-light" aria-hidden="true" />
          reference run
        </div>
        <span className="truncate font-mono text-[10px] text-code-muted/70">
          v3 · classify + audit
        </span>
      </div>

      <div className="relative min-h-[268px] scanlines p-4 font-mono text-[11.5px] leading-6 sm:text-[12px]">
        {LINES.map((line) => (
          <p
            key={line.text}
            className={cn(
              "break-words",
              line.kind === "command" && "text-code-foreground",
              line.kind === "pass" && "text-code-muted",
              line.kind === "warn" && "text-warn-light",
              line.kind === "info" && "text-accent-light",
            )}
          >
            {line.kind === "pass" ? (
              <span className="mr-2 text-pass-light">✓</span>
            ) : line.kind === "warn" ? (
              <span className="mr-2 text-warn-light">!</span>
            ) : line.kind === "command" ? (
              <span className="mr-2 text-accent-light">›</span>
            ) : (
              <span className="mr-2 text-accent-light">→</span>
            )}
            {line.text}
          </p>
        ))}
        <span
          className="mt-2 inline-block h-4 w-2 caret bg-accent-light align-middle"
          aria-hidden="true"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-code-foreground/10 bg-code-foreground/[0.03] px-3 py-2 font-mono text-[10px] text-code-muted">
        <span>llms.txt · RFC 9309 · schema.org</span>
        <span className="text-pass-light">20 checks / 1 request</span>
      </div>
    </div>
  );
}
