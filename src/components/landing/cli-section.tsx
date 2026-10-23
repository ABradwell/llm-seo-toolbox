import { ArrowUpRight, FileJson, GitBranch, Terminal } from "lucide-react";

import { CodeSnippet } from "@/components/landing/code-snippet";
import { siteConfig } from "@/lib/site";

const INSTALL = [
  "git clone https://github.com/ABradwell/llm-seo-toolbox.git",
  "cd llm-seo-toolbox",
  "pnpm install",
  "pnpm build:cli",
].join("\n");

const RUN = [
  "pnpm cli example.com --min-score 75 --min-grade B",
  "",
  "# Machine-readable report for a script or CI job",
  "pnpm cli example.com --format json --output audit.json",
].join("\n");

const FEATURES = [
  {
    icon: Terminal,
    label: "Same engine",
    detail:
      "The 49 checks, site profiles and line-level fixes from the workspace, run locally against any public URL.",
  },
  {
    icon: FileJson,
    label: "Four formats",
    detail:
      "Table for a person, summary for CI logs, JSON for scripts and Markdown for a PR comment.",
  },
  {
    icon: GitBranch,
    label: "CI exit codes",
    detail:
      "Exit 0 when the thresholds pass, 1 when the site scores below and 2 when the audit cannot run.",
  },
];

export function CliSection() {
  return (
    <section id="cli" className="scroll-mt-20 border-b border-line">
      <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:py-20">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="font-mono text-[10px] tracking-[0.2em] text-accent-strong uppercase">
              03 / command line
            </p>
            <h2 className="mt-3 text-2xl font-medium tracking-tight sm:text-4xl">
              Audit from the terminal.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">
              The CLI wraps the same audit engine as the workspace. Clone the repository, build the
              bundle, then run the checks against any URL and gate a script on the score.
            </p>
          </div>

          <a
            href={`${siteConfig.github}#cli`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 font-mono text-[11px] text-accent-strong transition-opacity hover:opacity-75"
          >
            CLI reference
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </a>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-[1.02fr_0.98fr]">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] text-muted">
              <span className="tracking-[0.12em] uppercase">01 · install from source</span>
              <span>Node 20.9+ · pnpm 10+</span>
            </div>
            <CodeSnippet label="terminal · install" code={INSTALL} />
          </div>

          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] text-muted">
              <span className="tracking-[0.12em] uppercase">02 · audit a URL</span>
              <span>table · json · markdown · summary</span>
            </div>
            <CodeSnippet label="terminal · run" code={RUN} />
          </div>
        </div>

        <ul className="mt-6 grid gap-4 border-t border-line pt-6 sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, label, detail }) => (
            <li key={label} className="flex gap-3">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[2px] border border-line bg-panel">
                <Icon className="size-3.5 text-accent" aria-hidden="true" />
              </span>
              <div>
                <p className="font-mono text-[11px] text-foreground">{label}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">{detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
