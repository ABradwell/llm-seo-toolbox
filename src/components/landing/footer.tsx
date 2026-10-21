import { Coffee, Github, Triangle } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/logo";
import { siteConfig } from "@/lib/site";

const COLUMNS: {
  label: string;
  links: { label: string; href: string; external?: boolean }[];
}[] = [
  {
    label: "Product",
    links: [
      { label: "Audit workspace", href: "/app" },
      { label: "Live checklist", href: "/#checklist" },
      { label: "API", href: "/api/audit?url=example.com" },
    ],
  },
  {
    label: "Standards",
    links: [
      { label: "llms.txt", href: siteConfig.llmsTxtSpec, external: true },
      { label: "RFC 9309", href: siteConfig.rfc9309, external: true },
      { label: "schema.org", href: siteConfig.schema, external: true },
    ],
  },
  {
    label: "Project",
    links: [
      { label: "Source", href: siteConfig.github, external: true },
      { label: "Deploy on Vercel", href: siteConfig.vercelDeploy, external: true },
      { label: "Buy me a coffee", href: siteConfig.coffee, external: true },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
        <div className="grid gap-8 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-xs leading-relaxed text-muted">
              {siteConfig.description}
            </p>
            <div className="mt-4 flex items-center gap-3 font-mono text-[10px] text-muted">
              <a
                href={siteConfig.github}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 transition-colors hover:text-accent-strong"
              >
                <Github className="size-3" aria-hidden="true" />
                GitHub
              </a>
              <a
                href={siteConfig.coffee}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 transition-colors hover:text-accent-strong"
              >
                <Coffee className="size-3" aria-hidden="true" />
                BMC
              </a>
              <a
                href={siteConfig.vercelDeploy}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 transition-colors hover:text-accent-strong"
              >
                <Triangle className="size-3" aria-hidden="true" />
                Vercel
              </a>
            </div>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.label}>
              <p className="font-mono text-[10px] tracking-[0.16em] text-muted uppercase">
                {column.label}
              </p>
              <ul className="mt-3 space-y-2">
                {column.links.map((item) => (
                  <li key={item.label}>
                    {item.external ? (
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-[11px] text-muted transition-colors hover:text-accent-strong"
                      >
                        {item.label} ↗
                      </a>
                    ) : (
                      <Link
                        href={item.href}
                        className="font-mono text-[11px] text-muted transition-colors hover:text-accent-strong"
                      >
                        {item.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 font-mono text-[10px] text-muted/70">
          <p>GPL-3.0-only · © 2026 LLMReady contributors</p>
          <p className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-pass" aria-hidden="true" />
            CI: format · lint · typecheck · test · build · gitleaks
          </p>
        </div>
      </div>
    </footer>
  );
}
