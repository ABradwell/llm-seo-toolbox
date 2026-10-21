import { FileCode2, FileJson2, FileText } from "lucide-react";

const LLMS_SNIPPET = `# Acme Docs

> Everything developers need to build with Acme, in one file.

## Documentation
- [Getting started](https://docs.acme.com/start)
- [API reference](https://docs.acme.com/api)
- [Authentication](https://docs.acme.com/auth)

## Guides
- [Webhooks](https://docs.acme.com/guides/webhooks)
- [Rate limits](https://docs.acme.com/guides/rate-limits)`;

const FILES = [
  {
    icon: FileText,
    name: "/llms.txt",
    description: "A curated, markdown index of the pages that matter most to language models.",
  },
  {
    icon: FileCode2,
    name: "/robots.txt",
    description: "Explicit allow rules for GPTBot, ClaudeBot, Google-Extended, and friends.",
  },
  {
    icon: FileJson2,
    name: "JSON-LD",
    description: "Typed schema that turns your pages into facts agents can cite and reuse.",
  },
];

export function CodeShowcase() {
  return (
    <section className="border-t border-line bg-panel/30">
      <div className="mx-auto grid w-full max-w-7xl items-center gap-14 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:py-28">
        <div>
          <p className="font-mono text-[11px] tracking-[0.2em] text-acid uppercase">
            The manifest layer
          </p>
          <h2 className="mt-4 text-3xl font-medium tracking-tight sm:text-5xl">
            Give machines the shortcut they are looking for.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-muted">
            Crawlers will always fall back to guessing. A small set of open conventions lets you
            tell them exactly where your best content lives, what it covers, and what they may do
            with it.
          </p>

          <ul className="mt-9 space-y-6">
            {FILES.map((file) => (
              <li key={file.name} className="flex gap-4">
                <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg border border-line bg-panel-2">
                  <file.icon className="size-4 text-acid" aria-hidden="true" />
                </div>
                <div>
                  <p className="font-mono text-sm">{file.name}</p>
                  <p className="mt-1 max-w-md text-sm leading-relaxed text-muted">
                    {file.description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="overflow-hidden rounded-2xl border border-line bg-panel/80">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="font-mono text-xs text-muted">generated in the workspace</span>
            <div className="flex gap-1.5" aria-hidden="true">
              <span className="size-2 rounded-full bg-line" />
              <span className="size-2 rounded-full bg-line" />
              <span className="size-2 rounded-full bg-acid/70" />
            </div>
          </div>
          <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-relaxed text-foreground/90">
            <code>{LLMS_SNIPPET}</code>
          </pre>
          <div className="border-t border-line px-5 py-3 font-mono text-xs text-muted">
            Validated against the llms.txt convention · live preview · copy or download
          </div>
        </div>
      </div>
    </section>
  );
}
