import { ScoreRing } from "@/components/tool/score-ring";
import { Badge } from "@/components/ui/badge";
import { SAMPLE_TARGETS } from "@/lib/samples";
import { ScanForm } from "@/components/scan-form";

const MOCK_PILLARS = [
  { name: "Discovery", score: 88 },
  { name: "Access", score: 76 },
  { name: "Signal", score: 61 },
  { name: "Structure", score: 54 },
];

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden pt-16 pb-20 lg:pt-24 lg:pb-28">
      <div
        className="pointer-events-none absolute inset-0 -z-10 grid-lines [mask-image:radial-gradient(ellipse_at_top,black,transparent_72%)] opacity-60"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-acid/10 blur-[140px]"
        aria-hidden="true"
      />

      <div className="mx-auto grid w-full max-w-7xl items-center gap-16 px-4 sm:px-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rise-in">
          <Badge variant="accent" className="mb-7">
            <span className="size-1.5 animate-pulse rounded-full bg-acid" aria-hidden="true" />
            Open source · Free forever · No signup
          </Badge>

          <h1 className="text-[42px] leading-[1.02] font-medium tracking-[-0.03em] sm:text-6xl xl:text-[72px]">
            The web was written for eyes.
            <span className="font-serif text-acid italic"> LLMs read it differently.</span>
          </h1>

          <p className="mt-7 max-w-xl text-lg leading-relaxed text-muted">
            LLMReady audits how AI crawlers see your site, shows you exactly what they miss, and
            generates the manifests that make your content easier to quote, cite, and recommend.
          </p>

          <div className="mt-9 max-w-xl">
            <ScanForm size="hero" />
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="font-mono text-[11px] tracking-[0.16em] text-muted uppercase">
              Try a sample
            </span>
            {SAMPLE_TARGETS.map((target) => (
              <a
                key={target.url}
                href={`/app?url=${encodeURIComponent(target.url)}`}
                className="rounded-full border border-line bg-panel/60 px-3 py-1 font-mono text-xs text-muted transition-colors hover:border-acid/40 hover:text-foreground"
              >
                {target.name}
              </a>
            ))}
          </div>
        </div>

        <div className="rise-in [animation-delay:120ms]">
          <PreviewCard />
        </div>
      </div>
    </section>
  );
}

function PreviewCard() {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-line bg-panel/80 p-5 panel-glow backdrop-blur-sm sm:p-6">
      <div className="pointer-events-none absolute inset-0 dot-grid [mask-image:linear-gradient(to_bottom,black,transparent_70%)] opacity-[0.35]" />

      <div className="relative flex items-center gap-2 rounded-xl border border-line bg-background/70 px-3 py-2">
        <span className="size-2.5 rounded-full bg-fail" aria-hidden="true" />
        <span className="size-2.5 rounded-full bg-warn" aria-hidden="true" />
        <span className="size-2.5 rounded-full bg-pass" aria-hidden="true" />
        <span className="ml-2 truncate font-mono text-xs text-muted">
          llmready.app/report?url=docs.example.com
        </span>
      </div>

      <div className="relative mt-5 flex items-center gap-6">
        <ScoreRing score={74} size={132} strokeWidth={9} gradeLabel="Grade B" />
        <div>
          <p className="font-mono text-[11px] tracking-[0.16em] text-muted uppercase">
            Example report
          </p>
          <p className="mt-2 text-xl leading-snug font-medium">
            Nearly ready.
            <span className="block text-sm leading-relaxed font-normal text-muted">
              6 improvements found across 4 pillars.
            </span>
          </p>
        </div>
      </div>

      <div className="relative mt-6 space-y-3">
        {MOCK_PILLARS.map((pillar) => (
          <div key={pillar.name}>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">{pillar.name}</span>
              <span className="font-mono text-xs">{pillar.score}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-panel-2">
              <div
                className="h-full rounded-full bg-acid/80"
                style={{ width: `${pillar.score}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="relative mt-5 flex items-start gap-3 rounded-xl border border-line bg-panel-2/80 p-3">
        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-warn" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium">Publish /llms.txt</p>
          <p className="text-xs leading-relaxed text-muted">
            Crawlers have no curated entry point, so they guess which pages matter.
          </p>
        </div>
      </div>
    </div>
  );
}
