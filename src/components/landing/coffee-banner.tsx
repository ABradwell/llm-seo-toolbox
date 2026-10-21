import { Coffee, Github } from "lucide-react";

import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/site";

export function CoffeeBanner() {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 pb-20 sm:px-6 lg:pb-28">
      <div className="relative overflow-hidden rounded-3xl border border-line bg-panel/70 p-8 sm:p-12">
        <div
          className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-acid/10 blur-[100px]"
          aria-hidden="true"
        />
        <div className="relative flex flex-wrap items-center justify-between gap-8">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-medium tracking-tight sm:text-4xl">
              Free forever. Funded by people it helped.
            </h2>
            <p className="mt-4 leading-relaxed text-muted">
              LLMReady is free software (GPL-3.0) with no paid tier, no tracking, and no upsell. If
              the audit saved you an afternoon, you can keep the next release coming.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <a href={siteConfig.coffee} target="_blank" rel="noreferrer">
                <Coffee aria-hidden="true" />
                Buy me a coffee
              </a>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <a href={siteConfig.github} target="_blank" rel="noreferrer">
                <Github aria-hidden="true" />
                Star on GitHub
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
