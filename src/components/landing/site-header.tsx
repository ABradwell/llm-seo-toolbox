import { Github, SquareTerminal } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/site";

const NAV = [
  { href: "#pillars", label: "Pillars" },
  { href: "#how", label: "How it works" },
  { href: "#samples", label: "Samples" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-line/70 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />

        <nav className="hidden items-center gap-7 text-sm text-muted md:flex" aria-label="Main">
          {NAV.map((item) => (
            <a key={item.href} href={item.href} className="transition-colors hover:text-foreground">
              {item.label}
            </a>
          ))}
          <a
            href={siteConfig.llmsTxtSpec}
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-foreground"
          >
            llms.txt spec ↗
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <a href={siteConfig.github} target="_blank" rel="noreferrer">
              <Github aria-hidden="true" />
              Star
            </a>
          </Button>
          <Button asChild size="sm">
            <Link href="/app">
              <SquareTerminal aria-hidden="true" />
              Open workspace
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
