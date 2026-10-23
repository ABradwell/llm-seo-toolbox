import { FaqList } from "@/components/landing/faq-section";
import { QuickAuditBar } from "@/components/landing/quick-audit-bar";
import { Badge } from "@/components/ui/badge";
import { SAMPLE_TARGETS } from "@/lib/samples";

export function AppEmptyState() {
  return (
    <div className="grid items-center gap-10 py-6 lg:grid-cols-[1.05fr_0.95fr] lg:py-12">
      <div>
        <Badge variant="accent">free · open source · no signup</Badge>
        <h1 className="mt-4 text-3xl font-medium tracking-[-0.03em] sm:text-5xl">
          Audit any site against the
          <span className="text-accent-strong"> AI discovery specs.</span>
        </h1>
        <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted sm:text-base">
          LLMReady audits any public site against the signals AI crawlers read first. Enter a domain
          to classify it, sample up to eight pages, and check /llms.txt, RFC 9309 robots.txt, static
          HTML parseability and profile-specific schema.org metadata. The report groups fixes by
          pillar and shows the exact line to change. No browser, no signup and no cookies are
          required.
        </p>
        <div className="mt-6 max-w-xl">
          <QuickAuditBar size="hero" />
        </div>
        <p className="mt-3 font-mono text-[10px] text-muted/60">
          no browser execution · no database · 30 credits/min per IP, site audits cost 3
        </p>
      </div>

      <div>
        <p className="font-mono text-[10px] tracking-[0.16em] text-muted uppercase">
          Standard presets
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {SAMPLE_TARGETS.map((target) => (
            <a
              key={target.url}
              href={`/app?url=${encodeURIComponent(target.url)}`}
              className="group rounded-[4px] border border-line bg-panel/70 p-3 transition-colors hover:border-accent/40"
            >
              <p className="flex items-center justify-between font-mono text-[9px] tracking-[0.1em] text-muted uppercase">
                {target.category}
                <span className="text-muted/50 transition-colors group-hover:text-accent-strong">
                  ↗
                </span>
              </p>
              <p className="mt-2 text-sm font-medium">{target.name}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">{target.blurb}</p>
            </a>
          ))}
        </div>
      </div>

      <div className="lg:col-span-2">
        <h2 className="text-xl font-medium tracking-tight sm:text-2xl">
          Frequently asked questions
        </h2>
        <FaqList className="mt-4" />
      </div>
    </div>
  );
}
