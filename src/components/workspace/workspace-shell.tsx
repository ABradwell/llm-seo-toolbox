import { Coffee, Github, Terminal } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/logo";
import { QuickAuditBar } from "@/components/landing/quick-audit-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { scoreTone } from "@/lib/score";
import { siteConfig } from "@/lib/site";

export interface WorkspaceScore {
  score: number;
  scope: "site" | "page";
}

export function WorkspaceHeader({
  defaultValue = "",
  score = null,
}: {
  defaultValue?: string;
  score?: WorkspaceScore | null;
}) {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-background/92 backdrop-blur-md">
      <div className="mx-auto flex h-12 w-full max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Logo />
        <span className="hidden h-4 w-px bg-line md:block" aria-hidden="true" />
        <div className="hidden flex-1 justify-center md:flex">
          <QuickAuditBar
            key={defaultValue}
            size="compact"
            defaultValue={defaultValue}
            className="max-w-sm"
            buttonLabel="audit"
          />
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {score ? (
            <Badge variant={scoreTone(score.score)}>
              {score.scope} {score.score}
            </Badge>
          ) : null}
          <Button asChild variant="ghost" size="sm" className="hidden lg:inline-flex">
            <a href={siteConfig.github} target="_blank" rel="noreferrer">
              <Github aria-hidden="true" />
              github
            </a>
          </Button>
          <Button asChild variant="ghost" size="sm" className="hidden lg:inline-flex">
            <a href={siteConfig.coffee} target="_blank" rel="noreferrer">
              <Coffee aria-hidden="true" />
              coffee
            </a>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/">
              <Terminal aria-hidden="true" />
              home
            </Link>
          </Button>
        </div>
      </div>
      <div className="border-t border-line px-4 py-2 md:hidden">
        <QuickAuditBar
          key={`mobile-${defaultValue}`}
          size="compact"
          defaultValue={defaultValue}
          buttonLabel="audit"
        />
      </div>
    </header>
  );
}

export function WorkspaceFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 font-mono text-[10px] text-muted sm:px-6">
        <p>LLMReady · GPL-3.0-only · v5</p>
        <nav className="flex flex-wrap items-center gap-3" aria-label="Workspace footer">
          <a
            href={siteConfig.llmsTxtSpec}
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-accent-strong"
          >
            llms.txt ↗
          </a>
          <a
            href={siteConfig.rfc9309}
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-accent-strong"
          >
            RFC 9309 ↗
          </a>
          <a
            href={siteConfig.github}
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-accent-strong"
          >
            GitHub ↗
          </a>
          <a
            href={siteConfig.coffee}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-accent-strong transition-opacity hover:opacity-80"
          >
            <Coffee className="size-3" aria-hidden="true" />
            Buy me a coffee
          </a>
        </nav>
      </div>
    </footer>
  );
}

export function WorkspaceShell({
  children,
  defaultValue = "",
  score = null,
}: {
  children: ReactNode;
  defaultValue?: string;
  score?: WorkspaceScore | null;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <WorkspaceHeader defaultValue={defaultValue} score={score} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      <WorkspaceFooter />
    </div>
  );
}
