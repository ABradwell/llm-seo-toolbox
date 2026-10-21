const STEPS = [
  {
    number: "01",
    title: "Scan any URL",
    body: "Enter a domain and LLMReady fetches it the way an AI crawler would: initial HTML only, no JavaScript execution, no browser niceties.",
  },
  {
    number: "02",
    title: "See what they miss",
    body: "Every pillar check reports pass, warning, or fail with the actual value behind it — blocked crawlers, missing manifests, heading jumps, script bloat.",
  },
  {
    number: "03",
    title: "Ship the fixes",
    body: "Generate a spec-compliant llms.txt, work through the prioritized fixes, and export the whole audit as JSON for your backlog.",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="relative scroll-mt-24 border-t border-line">
      <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:py-28">
        <div className="max-w-2xl">
          <p className="font-mono text-[11px] tracking-[0.2em] text-acid uppercase">How it works</p>
          <h2 className="mt-4 text-3xl font-medium tracking-tight sm:text-5xl">
            From crawl to citation in three moves.
          </h2>
        </div>

        <ol className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
          {STEPS.map((step, index) => (
            <li key={step.number} className="relative">
              <div className="flex items-center gap-4">
                <span className="font-mono text-sm text-acid">{step.number}</span>
                <span className="h-px flex-1 border-t border-line" aria-hidden="true" />
                {index < STEPS.length - 1 ? (
                  <span
                    className="hidden size-1.5 rounded-full bg-acid/40 md:block"
                    aria-hidden="true"
                  />
                ) : null}
              </div>
              <h3 className="mt-5 text-xl font-medium tracking-tight">{step.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
