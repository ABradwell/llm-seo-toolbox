import { Coffee, Github } from "lucide-react";

import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/site";

export function CoffeeBanner() {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:py-20">
      <div className="overflow-hidden rounded-[4px] border border-line bg-panel">
        <div className="grid items-center gap-6 p-6 sm:p-8 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <p className="font-mono text-[10px] tracking-[0.2em] text-accent uppercase">support</p>
            <h2 className="mt-2 text-2xl font-medium tracking-tight sm:text-3xl">
              Free software, funded by people it helped.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
              LLMReady is GPL-3.0, with no paid tier, accounts or tracking. If the audit saved you
              an afternoon, buy the next release a coffee.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Button asChild size="lg">
              <a href={siteConfig.coffee} target="_blank" rel="noreferrer">
                <Coffee aria-hidden="true" />
                Buy me a coffee
              </a>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <a href={siteConfig.github} target="_blank" rel="noreferrer">
                <Github aria-hidden="true" />
                Star the repo
              </a>
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-panel-2/40 px-6 py-2.5 font-mono text-[10px] text-muted sm:px-8">
          <span>GPL-3.0-only · no analytics · no cookies</span>
          <span className="text-pass">all checks run against the initial HTML response</span>
        </div>
      </div>
    </section>
  );
}
