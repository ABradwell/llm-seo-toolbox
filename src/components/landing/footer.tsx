import { Coffee, Github, Triangle } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/logo";
import { siteConfig } from "@/lib/site";

const REPO_URL = siteConfig.github;
const DEPLOY_URL = `https://vercel.com/new/clone?repository-url=${encodeURIComponent(REPO_URL)}`;

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
              {siteConfig.description}
            </p>
          </div>

          <div>
            <p className="font-mono text-[11px] tracking-[0.16em] text-muted uppercase">Product</p>
            <ul className="mt-4 space-y-3 text-sm">
              <li>
                <Link href="/app" className="transition-colors hover:text-acid">
                  Audit workspace
                </Link>
              </li>
              <li>
                <Link href="/#samples" className="transition-colors hover:text-acid">
                  Sample scans
                </Link>
              </li>
              <li>
                <Link href="/#pillars" className="transition-colors hover:text-acid">
                  Scoring model
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="font-mono text-[11px] tracking-[0.16em] text-muted uppercase">
              Standards
            </p>
            <ul className="mt-4 space-y-3 text-sm">
              <li>
                <a
                  href={siteConfig.llmsTxtSpec}
                  target="_blank"
                  rel="noreferrer"
                  className="transition-colors hover:text-acid"
                >
                  llms.txt proposal ↗
                </a>
              </li>
              <li>
                <a
                  href="https://www.rfc-editor.org/rfc/rfc9309"
                  target="_blank"
                  rel="noreferrer"
                  className="transition-colors hover:text-acid"
                >
                  RFC 9309 robots.txt ↗
                </a>
              </li>
              <li>
                <a
                  href="https://schema.org/"
                  target="_blank"
                  rel="noreferrer"
                  className="transition-colors hover:text-acid"
                >
                  schema.org ↗
                </a>
              </li>
            </ul>
          </div>

          <div>
            <p className="font-mono text-[11px] tracking-[0.16em] text-muted uppercase">
              Community
            </p>
            <ul className="mt-4 space-y-3 text-sm">
              <li>
                <a
                  href={REPO_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 transition-colors hover:text-acid"
                >
                  <Github className="size-4" aria-hidden="true" />
                  Star the repo
                </a>
              </li>
              <li>
                <a
                  href={siteConfig.coffee}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 transition-colors hover:text-acid"
                >
                  <Coffee className="size-4" aria-hidden="true" />
                  Buy me a coffee
                </a>
              </li>
              <li>
                <a
                  href={DEPLOY_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 transition-colors hover:text-acid"
                >
                  <Triangle className="size-4" aria-hidden="true" />
                  Deploy with Vercel
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
          <p className="font-mono text-xs text-muted">
            GPL-3.0 licensed · Built for the crawlers, not the vibes
          </p>
          <p className="flex items-center gap-2 font-mono text-xs text-muted">
            <span className="size-1.5 animate-pulse rounded-full bg-pass" aria-hidden="true" />
            Vercel-ready deployment
          </p>
        </div>
      </div>
    </footer>
  );
}
