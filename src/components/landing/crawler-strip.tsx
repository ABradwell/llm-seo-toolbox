import { AI_CRAWLERS } from "@/lib/robots";

export function CrawlerStrip() {
  return (
    <section className="border-b border-line bg-panel/40" aria-label="AI crawler user agents">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <span className="font-mono text-[10px] tracking-[0.16em] text-muted uppercase">
          RFC 9309 access evaluated for
        </span>
        {AI_CRAWLERS.map((crawler) => (
          <span key={crawler.id} className="flex items-center gap-1.5 font-mono text-[11px]">
            <span className="size-1 rounded-[1px] bg-accent" aria-hidden="true" />
            {crawler.label}
            <span className="text-[10px] text-muted/60">{crawler.vendor}</span>
          </span>
        ))}
      </div>
    </section>
  );
}
