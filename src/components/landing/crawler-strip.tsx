import { AI_CRAWLERS } from "@/lib/robots";

export function CrawlerStrip() {
  return (
    <section className="border-y border-line bg-panel/40">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-8 gap-y-3 px-4 py-5 sm:px-6">
        <span className="font-mono text-[11px] tracking-[0.18em] text-muted uppercase">
          Audits access for
        </span>
        {AI_CRAWLERS.map((crawler) => (
          <span key={crawler.id} className="flex items-center gap-2 text-sm">
            <span className="size-1.5 rounded-full bg-acid" aria-hidden="true" />
            {crawler.label}
            <span className="text-xs text-muted/70">{crawler.vendor}</span>
          </span>
        ))}
      </div>
    </section>
  );
}
