import { ArrowUpRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { SAMPLE_TARGETS } from "@/lib/samples";

export function SampleSites() {
  return (
    <section
      id="samples"
      className="mx-auto w-full max-w-7xl scroll-mt-24 px-4 py-20 sm:px-6 lg:py-28"
    >
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <p className="font-mono text-[11px] tracking-[0.2em] text-acid uppercase">Sample scans</p>
          <h2 className="mt-4 text-3xl font-medium tracking-tight sm:text-5xl">
            Start from a known-good target.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-muted">
            Run a live audit against documentation sites with very different architectures and see
            where each one loses points.
          </p>
        </div>
      </div>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SAMPLE_TARGETS.map((target) => (
          <a
            key={target.url}
            href={`/app?url=${encodeURIComponent(target.url)}`}
            className="group flex flex-col rounded-2xl border border-line bg-panel/60 p-5 transition-colors hover:border-acid/40"
          >
            <div className="flex items-center justify-between">
              <Badge variant="default">{target.category}</Badge>
              <ArrowUpRight
                className="size-4 text-muted transition-colors group-hover:text-acid"
                aria-hidden="true"
              />
            </div>
            <p className="mt-5 text-lg font-medium tracking-tight">{target.name}</p>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{target.blurb}</p>
            <p className="mt-5 truncate font-mono text-xs text-muted/70">
              {new URL(target.url).hostname}
            </p>
          </a>
        ))}
      </div>
    </section>
  );
}
