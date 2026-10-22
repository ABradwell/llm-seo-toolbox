import { Coffee, Github } from "lucide-react";

import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/site";

export function CoffeeBanner() {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:py-20">
      <div className="overflow-hidden rounded-[4px] border border-ink bg-ink text-parchment">
        <div className="grid items-center gap-6 p-6 sm:p-8 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <p className="font-mono text-[10px] tracking-[0.2em] text-accent-light uppercase">
              support
            </p>
            <h2 className="mt-2 text-2xl font-medium tracking-tight sm:text-3xl">
              Free software, funded by people it helped.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-parchment/75">
              LLMReady is GPL-3.0, with no paid tier, accounts or tracking. If the audit saved you
              an afternoon, buy the next release a coffee.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Button
              asChild
              size="lg"
              className="bg-accent text-accent-contrast hover:bg-accent-hover"
            >
              <a href={siteConfig.coffee} target="_blank" rel="noreferrer">
                <Coffee aria-hidden="true" />
                Buy me a coffee
              </a>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-parchment/30 text-parchment hover:border-parchment hover:bg-parchment/10 hover:text-parchment"
            >
              <a href={siteConfig.github} target="_blank" rel="noreferrer">
                <Github aria-hidden="true" />
                Star the repo
              </a>
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-parchment/15 bg-parchment/[0.04] px-6 py-2.5 font-mono text-[10px] text-parchment/75 sm:px-8">
          <span>GPL-3.0-only · no analytics · no cookies</span>
          <span className="text-accent-light">raw HTML only · no JavaScript execution</span>
        </div>
      </div>
    </section>
  );
}
