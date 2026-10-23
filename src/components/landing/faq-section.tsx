import { FAQ_ITEMS } from "@/lib/faq";
import { cn } from "@/lib/utils";

export function FaqList({ className }: { className?: string }) {
  return (
    <dl className={cn("divide-y divide-line border-y border-line", className)}>
      {FAQ_ITEMS.map((item) => (
        <div key={item.question} className="py-5">
          <dt className="text-sm font-medium text-foreground sm:text-base">{item.question}</dt>
          <dd className="mt-2 text-sm leading-relaxed text-muted">{item.answer}</dd>
        </div>
      ))}
    </dl>
  );
}

export function FaqSection({ className }: { className?: string }) {
  return (
    <section
      id="faq"
      aria-labelledby="faq-title"
      className={cn("scroll-mt-20 border-b border-line", className)}
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:py-20">
        <div className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:gap-12">
          <div>
            <p className="font-mono text-[10px] tracking-[0.2em] text-accent-strong uppercase">
              05 / FAQ
            </p>
            <h2 id="faq-title" className="mt-3 text-2xl font-medium tracking-tight sm:text-4xl">
              Questions teams ask before they ship.
            </h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted sm:text-base">
              Short answers about the audit model, the fetch budget and what the score means. The
              same text is published as FAQPage structured data.
            </p>
          </div>
          <FaqList />
        </div>
      </div>
    </section>
  );
}
