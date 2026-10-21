import { cn } from "@/lib/utils";

interface TerminalLine {
  kind: "command" | "pass" | "warn" | "info";
  text: string;
}

const LINES: TerminalLine[] = [
  { kind: "command", text: "$ llmready scan https://nextjs.org/docs" },
  { kind: "pass", text: "GET /llms.txt            200  H1 + 142 markdown links" },
  { kind: "pass", text: "GET /llms-full.txt       200  1.8 MB unpaginated bundle" },
  { kind: "pass", text: "GET /robots.txt          200  GPTBot allow · ClaudeBot allow" },
  { kind: "pass", text: "GET /sitemap.xml         200  1,204 URLs · robots directive L12" },
  { kind: "pass", text: "GET / (initial HTML)      48 KB  SNR 71% · 12,840 chars" },
  { kind: "warn", text: "schema.org               TechArticle found · FAQPage missing" },
  { kind: "info", text: "result                   18 pass · 2 warn · 0 fail  →  94 / A" },
];

export function LiveTerminal() {
  return (
    <div className="relative overflow-hidden rounded-[4px] border border-line bg-panel/90">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-20 scan-line bg-gradient-to-b from-accent/[0.06] to-transparent"
        aria-hidden="true"
      />
      <div className="flex items-center justify-between gap-3 border-b border-line bg-panel-2/70 px-3 py-2">
        <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.14em] text-muted uppercase">
          <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
          reference run
        </div>
        <span className="truncate font-mono text-[10px] text-muted/70">v2 · standard checks</span>
      </div>

      <div className="relative min-h-[268px] scanlines p-4 font-mono text-[11.5px] leading-6 sm:text-[12px]">
        {LINES.map((line) => (
          <p
            key={line.text}
            className={cn(
              "break-words",
              line.kind === "command" && "text-foreground",
              line.kind === "pass" && "text-muted",
              line.kind === "warn" && "text-warn",
              line.kind === "info" && "text-accent",
            )}
          >
            {line.kind === "pass" ? (
              <span className="mr-2 text-pass">✓</span>
            ) : line.kind === "warn" ? (
              <span className="mr-2 text-warn">!</span>
            ) : line.kind === "command" ? (
              <span className="mr-2 text-accent">›</span>
            ) : (
              <span className="mr-2 text-accent">→</span>
            )}
            {line.text}
          </p>
        ))}
        <span
          className="mt-2 inline-block h-4 w-2 caret bg-accent align-middle"
          aria-hidden="true"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-panel-2/50 px-3 py-2 font-mono text-[10px] text-muted">
        <span>llms.txt · RFC 9309 · schema.org</span>
        <span className="text-pass">20 checks / 1 request</span>
      </div>
    </div>
  );
}
