import { AI_CRAWLERS } from "@/lib/robots";

export function CrawlerStrip() {
  return (
    <section
      className="border-b border-ink/20 bg-accent-strong"
      aria-label="AI crawler user agents"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3.5 sm:px-6">
        <span className="font-mono text-[10px] tracking-[0.16em] text-on-accent-strong uppercase">
          Increase your site&apos;s support for these AI crawlers:
        </span>
        {AI_CRAWLERS.map((crawler) => (
          <span key={crawler.id} className="flex items-center gap-1.5 font-mono text-[11px]">
            <span className="size-1 rounded-[1px] bg-on-accent-strong" aria-hidden="true" />
            <span className="text-on-accent-strong">{crawler.label}</span>
            <span className="text-[10px] text-on-accent-strong">{crawler.vendor}</span>
          </span>
        ))}
      </div>
    </section>
  );
}
