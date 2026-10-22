import { Coffee, Github, SquareTerminal, Triangle } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/site";

const NAV = [
  { href: "#cli", label: "cli" },
  { href: "#action", label: "action" },
  { href: siteConfig.llmsTxtSpec, label: "llms.txt", external: true },
  { href: siteConfig.rfc9309, label: "rfc 9309", external: true },
  { href: siteConfig.github, label: "github", external: true },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-12 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-5">
          <Logo />
          <span className="hidden h-4 w-px bg-line sm:block" aria-hidden="true" />
          <nav
            className="hidden items-center gap-4 font-mono text-[10px] tracking-[0.1em] text-muted uppercase md:flex"
            aria-label="Main navigation"
          >
            {NAV.map((item) => (
              <a
                key={item.label}
                href={item.href}
                {...(item.external ? { target: "_blank", rel: "noreferrer" } : {})}
                className="transition-colors hover:text-accent-strong"
              >
                {item.label}
                {item.external ? <span className="ml-0.5 text-muted/50">↗</span> : null}
              </a>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-1.5">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <a href={siteConfig.coffee} target="_blank" rel="noreferrer">
              <Coffee aria-hidden="true" />
              <span className="hidden lg:inline">coffee</span>
            </a>
          </Button>
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <a href={siteConfig.github} target="_blank" rel="noreferrer">
              <Github aria-hidden="true" />
              <span className="hidden lg:inline">star</span>
            </a>
          </Button>
          <Button asChild variant="ghost" size="sm" className="hidden xl:inline-flex">
            <a href={siteConfig.vercelDeploy} target="_blank" rel="noreferrer">
              <Triangle aria-hidden="true" />
              deploy
            </a>
          </Button>
          <Button asChild size="sm">
            <Link href="/app">
              <SquareTerminal aria-hidden="true" />
              workspace
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
