import { FileCheck2, Radio } from "lucide-react";

import { LiveTerminal } from "@/components/landing/live-terminal";
import { QuickAuditBar } from "@/components/landing/quick-audit-bar";
import { Badge } from "@/components/ui/badge";

export function TerminalHero() {
  return (
    <section className="relative isolate overflow-hidden border-b border-parchment/10 bg-ink">
      <div
        className="pointer-events-none absolute inset-0 -z-10 terminal-grid [mask-image:radial-gradient(ellipse_at_top,black,transparent_78%)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -top-40 left-1/3 -z-10 h-80 w-[40rem] rounded-full bg-accent/[0.18] blur-[130px]"
        aria-hidden="true"
      />

      <div className="mx-auto grid w-full max-w-7xl items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:gap-16 lg:py-20">
        <div className="rise-in">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="border-accent-light/40 bg-accent-light/10 text-accent-light"
            >
              <Radio className="size-3" aria-hidden="true" />
              V2 · spec compliance
            </Badge>
            <span className="font-mono text-[10px] tracking-[0.12em] text-parchment/65 uppercase">
              open source · no signup
            </span>
          </div>

          <h1 className="mt-6 max-w-2xl text-[38px] leading-[1.04] font-medium tracking-[-0.035em] text-balance text-parchment sm:text-5xl xl:text-[62px]">
            Ship the specs AI crawlers
            <span className="text-accent-light"> actually read.</span>
          </h1>

          <div className="mt-7 max-w-xl">
            <QuickAuditBar size="hero" />
          </div>

          <p className="mt-5 max-w-xl text-sm leading-relaxed text-parchment/75 sm:text-base">
            <span className="font-medium text-parchment">LLMReady</span> audits{" "}
            <span className="font-mono text-parchment">/llms.txt</span>, RFC 9309 access rules,
            static HTML signal-to-noise and schema.org metadata — then shows the exact line and code
            that fixes each miss.
          </p>

          <dl className="mt-8 grid max-w-xl grid-cols-3 border-t border-parchment/15 pt-4">
            {[
              { value: "4", label: "protocol families" },
              { value: "20", label: "granular checks" },
              { value: "0", label: "signup / cookies" },
            ].map((item) => (
              <div key={item.label}>
                <dt className="font-mono text-[10px] tracking-[0.12em] text-parchment/60 uppercase">
                  {item.label}
                </dt>
                <dd className="mt-1 font-mono text-lg text-parchment">{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.14em] text-parchment/65 uppercase">
              <FileCheck2 className="size-3.5 text-accent-light" aria-hidden="true" />
              What the audit returns
            </span>
            <span className="font-mono text-[10px] text-parchment/50">JSON · matrix · fixes</span>
          </div>
          <LiveTerminal />
        </div>
      </div>
    </section>
  );
}
