import { AI_CRAWLERS } from "@/lib/robots";

const GROUPS = [
  { intent: "search", label: "Search & citation" },
  { intent: "fetch", label: "On-demand fetch" },
  { intent: "training", label: "Training" },
] as const;

export function CrawlerStrip() {
  return (
    <section
      className="border-b border-ink/20 bg-accent-strong"
      aria-label="AI crawler user agents by intent"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3.5 sm:px-6">
        <span className="font-mono text-[10px] tracking-[0.16em] text-parchment uppercase">
          Increase your site&apos;s support for these AI crawlers:
        </span>
        {GROUPS.map((group) => (
          <span key={group.intent} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-[9px] tracking-[0.14em] text-parchment/70 uppercase">
              {group.label}
            </span>
            {AI_CRAWLERS.filter((crawler) => crawler.intent === group.intent).map((crawler) => (
              <span key={crawler.id} className="flex items-center gap-1.5 font-mono text-[11px]">
                <span className="size-1 rounded-[1px] bg-accent-light" aria-hidden="true" />
                <span className="text-parchment">{crawler.label}</span>
                <span className="text-[10px] text-parchment">{crawler.vendor}</span>
              </span>
            ))}
          </span>
        ))}
      </div>
    </section>
  );
}
