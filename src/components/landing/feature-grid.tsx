import { Bot, Braces, Compass, ScanText } from "lucide-react";

const PILLARS = [
  {
    number: "01",
    icon: Compass,
    title: "Discovery & Manifests",
    purpose: "Give crawlers a curated index instead of making them crawl everything.",
    checks: [
      "/llms.txt and /llms-full.txt",
      "XML sitemap structure",
      "robots.txt sitemap directives",
    ],
  },
  {
    number: "02",
    icon: Bot,
    title: "Crawler Access Rules",
    purpose: "Keep AI user agents welcome without giving up granular control.",
    checks: [
      "robots.txt for GPTBot & ClaudeBot",
      "Google-Extended & PerplexityBot",
      "noindex and crawl blockers",
    ],
  },
  {
    number: "03",
    icon: ScanText,
    title: "Semantic Signal-to-Noise",
    purpose: "Make sure the first HTML response is mostly meaning, not machinery.",
    checks: [
      "Heading hierarchy",
      "Text-to-DOM ratio",
      "SSR vs client rendering",
      "Script and style budget",
    ],
  },
  {
    number: "04",
    icon: Braces,
    title: "Structured Interfaces",
    purpose: "Let agents read your schema and take action without guessing.",
    checks: ["JSON-LD structured data", "OpenAPI descriptions", ".well-known discovery"],
  },
];

export function FeatureGrid() {
  return (
    <section
      id="pillars"
      className="mx-auto w-full max-w-7xl scroll-mt-24 px-4 py-20 sm:px-6 lg:py-28"
    >
      <div className="max-w-2xl">
        <p className="font-mono text-[11px] tracking-[0.2em] text-acid uppercase">
          The scoring model
        </p>
        <h2 className="mt-4 text-3xl font-medium tracking-tight sm:text-5xl">
          Four pillars. One score you can act on.
        </h2>
        <p className="mt-5 text-lg leading-relaxed text-muted">
          Every audit runs the same checks across discovery, access, semantic clarity, and
          structured interfaces — then turns the results into a 0–100 readiness score.
        </p>
      </div>

      <div className="mt-14 grid gap-5 md:grid-cols-2">
        {PILLARS.map((pillar) => (
          <article
            key={pillar.number}
            className="group relative overflow-hidden rounded-2xl border border-line bg-panel/60 p-6 transition-colors hover:border-acid/30 sm:p-7"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex size-11 items-center justify-center rounded-xl border border-line bg-panel-2">
                <pillar.icon className="size-5 text-acid" aria-hidden="true" />
              </div>
              <span className="font-mono text-sm text-muted/60">{pillar.number}</span>
            </div>

            <h3 className="mt-5 text-xl font-medium tracking-tight">{pillar.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{pillar.purpose}</p>

            <ul className="mt-5 space-y-2">
              {pillar.checks.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-muted">
                  <span
                    className="mt-[7px] size-1 shrink-0 rounded-full bg-acid/70"
                    aria-hidden="true"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
