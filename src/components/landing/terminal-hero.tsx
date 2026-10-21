import { ArrowUpRight, FileCheck2, Radio } from "lucide-react";

import { LiveTerminal } from "@/components/landing/live-terminal";
import { QuickAuditBar } from "@/components/landing/quick-audit-bar";
import { Badge } from "@/components/ui/badge";
import { SAMPLE_TARGETS } from "@/lib/samples";

export function TerminalHero() {
  return (
    <section className="relative isolate overflow-hidden border-b border-line">
      <div
        className="pointer-events-none absolute inset-0 -z-10 terminal-grid [mask-image:radial-gradient(ellipse_at_top,black,transparent_75%)] opacity-70"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -top-32 left-1/3 -z-10 h-72 w-[36rem] rounded-full bg-accent/[0.07] blur-[120px]"
        aria-hidden="true"
      />

      <div className="mx-auto grid w-full max-w-7xl items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:gap-16 lg:py-20">
        <div className="rise-in">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="accent">
              <Radio className="size-3" aria-hidden="true" />
              V2 · spec compliance
            </Badge>
            <span className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase">
              open source · no signup
            </span>
          </div>

          <h1 className="mt-6 max-w-2xl text-[38px] leading-[1.04] font-medium tracking-[-0.035em] text-balance sm:text-5xl xl:text-[62px]">
            Ship the specs AI crawlers
            <span className="text-accent"> actually read.</span>
          </h1>

          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
            LLMReady audits <span className="font-mono text-foreground">/llms.txt</span>, RFC 9309
            access rules, static HTML signal-to-noise and schema.org metadata — then shows the exact
            line and code that fixes each miss.
          </p>

          <div className="mt-7 max-w-xl">
            <QuickAuditBar size="hero" />
          </div>

          <div className="mt-6">
            <p className="font-mono text-[10px] tracking-[0.16em] text-muted uppercase">
              Standard presets
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SAMPLE_TARGETS.map((target) => (
                <a
                  key={target.url}
                  href={`/app?url=${encodeURIComponent(target.url)}`}
                  className="group inline-flex items-center gap-1.5 rounded-[3px] border border-line bg-panel/70 px-2 py-1 font-mono text-[11px] text-muted transition-colors hover:border-accent/40 hover:text-foreground"
                >
                  {target.name}
                  <ArrowUpRight
                    className="size-2.5 opacity-50 transition-opacity group-hover:opacity-100"
                    aria-hidden="true"
                  />
                </a>
              ))}
            </div>
          </div>

          <dl className="mt-8 grid max-w-xl grid-cols-3 border-t border-line pt-4">
            {[
              { value: "4", label: "protocol families" },
              { value: "20", label: "granular checks" },
              { value: "0", label: "signup / cookies" },
            ].map((item) => (
              <div key={item.label}>
                <dt className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase">
                  {item.label}
                </dt>
                <dd className="mt-1 font-mono text-lg text-foreground">{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.14em] text-muted uppercase">
              <FileCheck2 className="size-3.5 text-accent" aria-hidden="true" />
              What the audit returns
            </span>
            <span className="font-mono text-[10px] text-muted/60">JSON · matrix · fixes</span>
          </div>
          <LiveTerminal />
        </div>
      </div>
    </section>
  );
}
