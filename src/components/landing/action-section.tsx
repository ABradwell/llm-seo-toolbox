import { ArrowUpRight, ListChecks, MessageSquare, ShieldCheck } from "lucide-react";

import { CodeSnippet } from "@/components/landing/code-snippet";
import { Badge } from "@/components/ui/badge";
import { siteConfig } from "@/lib/site";

const WORKFLOW = [
  "name: LLMReady audit",
  "on: pull_request",
  "",
  "permissions:",
  "  contents: read",
  "  pull-requests: write",
  "",
  "jobs:",
  "  audit:",
  "    runs-on: ubuntu-latest",
  "    steps:",
  "      - uses: actions/checkout@v7",
  "      - uses: pnpm/action-setup@v6",
  "      - uses: actions/setup-node@v7",
  "        with:",
  "          node-version: 22",
  "          cache: pnpm",
  "      - run: pnpm install --frozen-lockfile",
  "      - run: pnpm build:action",
  "      - uses: ./actions/audit",
  "        with:",
  "          url: https://preview.example.com",
  '          min-score: "80"',
  '          min-grade: "B"',
].join("\n");

const PILLARS = [
  { label: "Discovery", score: "100" },
  { label: "Access", score: "80" },
  { label: "Parseability", score: "90" },
  { label: "Structured", score: "85" },
];

const FEATURES = [
  {
    icon: ListChecks,
    label: "Job summary",
    detail: "The full markdown report is written to the workflow run summary.",
  },
  {
    icon: MessageSquare,
    label: "One sticky comment",
    detail: "Created on the first run and updated in place on every following push.",
  },
  {
    icon: ShieldCheck,
    label: "Threshold gate",
    detail: "Fails the job when the score or grade misses min-score or min-grade.",
  },
];

export function ActionSection() {
  return (
    <section id="action" className="scroll-mt-20 border-b border-line">
      <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:py-20">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="font-mono text-[10px] tracking-[0.2em] text-accent-strong uppercase">
              04 / github action
            </p>
            <h2 className="mt-3 text-2xl font-medium tracking-tight sm:text-4xl">
              Gate the deploy, not the crawler.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">
              Run the same audit against a preview or production URL. The action writes the report
              to the job summary, keeps one pull request comment current and fails the job when the
              site misses your threshold.
            </p>
          </div>

          <a
            href={`${siteConfig.github}#github-action`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 font-mono text-[11px] text-accent-strong transition-opacity hover:opacity-75"
          >
            Action reference
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </a>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-[1.12fr_0.88fr]">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] text-muted">
              <span className="tracking-[0.12em] uppercase">.github/workflows/audit.yml</span>
              <span>Node 20.9+ · pnpm 10+</span>
            </div>
            <CodeSnippet
              label="workflow · pull request audit"
              code={WORKFLOW}
              note="The action ships from actions/audit, so the job checks out the repository and builds the bundle before referencing it locally."
            />
          </div>

          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] text-muted">
              <span className="tracking-[0.12em] uppercase">what lands on the PR</span>
              <span>example · sticky comment</span>
            </div>

            <div className="overflow-hidden rounded-[4px] border border-line bg-panel">
              <div className="flex items-center justify-between gap-2 border-b border-line px-3.5 py-2.5">
                <span className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase">
                  pull request comment
                </span>
                <Badge variant="pass">gate passed</Badge>
              </div>

              <div className="p-3.5">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-[2px] border border-line bg-panel-2/50 px-2.5 py-2">
                    <p className="font-mono text-[9px] tracking-[0.12em] text-muted uppercase">
                      score
                    </p>
                    <p className="mt-1 font-mono text-lg text-foreground">
                      88 <span className="text-[10px] text-muted">/ 100</span>
                    </p>
                  </div>
                  <div className="rounded-[2px] border border-line bg-panel-2/50 px-2.5 py-2">
                    <p className="font-mono text-[9px] tracking-[0.12em] text-muted uppercase">
                      grade
                    </p>
                    <p className="mt-1 font-mono text-lg text-foreground">
                      B <span className="text-[10px] text-muted">≥ B</span>
                    </p>
                  </div>
                </div>

                <ul className="mt-3 divide-y divide-[var(--line)]">
                  {PILLARS.map((pillar) => (
                    <li
                      key={pillar.label}
                      className="flex items-center justify-between gap-3 py-1.5 font-mono text-[10px]"
                    >
                      <span className="text-muted">{pillar.label}</span>
                      <span className="text-foreground/90">{pillar.score}/100</span>
                    </li>
                  ))}
                </ul>

                <p className="mt-3 font-mono text-[10px] text-muted/80">
                  One comment per pull request, updated on every push.
                </p>
              </div>
            </div>

            <ul className="mt-4 space-y-3">
              {FEATURES.map(({ icon: Icon, label, detail }) => (
                <li key={label} className="flex gap-2.5">
                  <Icon className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden="true" />
                  <div>
                    <p className="font-mono text-[11px] text-foreground">{label}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{detail}</p>
                  </div>
                </li>
              ))}
            </ul>

            <p className="mt-4 font-mono text-[10px] leading-relaxed text-muted/70">
              Outputs: <span className="text-foreground/80">score</span> ·{" "}
              <span className="text-foreground/80">grade</span> ·{" "}
              <span className="text-foreground/80">passed</span> ·{" "}
              <span className="text-foreground/80">report-json</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
