"use client";

import {
  AlertCircle,
  Coffee,
  Eye,
  FileText,
  Gauge,
  Github,
  RefreshCw,
  Terminal,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Logo } from "@/components/logo";
import { QuickAuditBar } from "@/components/landing/quick-audit-bar";
import { AuditMatrix } from "@/components/workspace/audit-matrix";
import { LlmsTxtEditor } from "@/components/workspace/llms-txt-editor";
import { PipelineLoader } from "@/components/workspace/pipeline-loader";
import { ScraperSimulator } from "@/components/workspace/scraper-simulator";
import {
  SiteClassificationPanel,
  type SiteTypeSelection,
} from "@/components/workspace/site-classification-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { stepForError } from "@/lib/pipeline-steps";
import { SAMPLE_TARGETS } from "@/lib/samples";
import { siteConfig } from "@/lib/site";
import { isSiteType } from "@/lib/site-types";
import { scoreTone } from "@/lib/score";
import { prettyDomain } from "@/lib/url";
import type { AuditApiError, AuditResult } from "@/types/audit";

interface WorkspaceError {
  code?: string;
  message: string;
  hint?: string;
}

interface FetchState {
  key: string;
  url: string;
  audit: AuditResult | null;
  error: WorkspaceError | null;
}

export function Workspace() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const rawUrl = searchParams.get("url")?.trim() ?? "";
  const rawType = searchParams.get("type") ?? "";
  const override = isSiteType(rawType) ? rawType : null;

  const [refreshToken, setRefreshToken] = useState(0);
  // The URL whose report the pipeline loader has handed off to. Refreshes and
  // site-type overrides on that URL keep the report on screen instead of replaying.
  const [revealedUrl, setRevealedUrl] = useState("");
  const [fetchState, setFetchState] = useState<FetchState>({
    key: "",
    url: "",
    audit: null,
    error: null,
  });

  const requestKey = `${rawUrl}::${override ?? "auto"}::${refreshToken}`;

  useEffect(() => {
    if (!rawUrl) return;

    const controller = new AbortController();
    let active = true;
    const typeQuery = override ? `&type=${encodeURIComponent(override)}` : "";

    fetch(`/api/audit?url=${encodeURIComponent(rawUrl)}${typeQuery}`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    })
      .then(async (response) => {
        const payload = (await response.json()) as AuditResult | AuditApiError;
        if (!active) return;

        if (!response.ok || "error" in payload) {
          setFetchState({
            key: requestKey,
            url: rawUrl,
            audit: null,
            error: {
              code: "error" in payload ? payload.error.code : undefined,
              message:
                "error" in payload
                  ? payload.error.message
                  : `The audit failed (HTTP ${response.status}).`,
              hint: "error" in payload ? payload.error.hint : undefined,
            },
          });
          return;
        }

        setFetchState({ key: requestKey, url: rawUrl, audit: payload, error: null });
      })
      .catch((cause: unknown) => {
        if (!active) return;
        if (cause instanceof Error && cause.name === "AbortError") return;
        setFetchState({
          key: requestKey,
          url: rawUrl,
          audit: null,
          error: {
            message: "The audit service could not be reached.",
            hint: "Check your connection and try again.",
          },
        });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [rawUrl, override, requestKey]);

  const settled = fetchState.key === requestKey;
  const sameTarget = fetchState.url === rawUrl;
  const audit = settled ? fetchState.audit : sameTarget ? fetchState.audit : null;
  const error = settled ? fetchState.error : null;
  const loading = Boolean(rawUrl) && !settled;
  const refresh = useCallback(() => setRefreshToken((token) => token + 1), []);
  const reveal = useCallback(() => setRevealedUrl(rawUrl), [rawUrl]);

  const reportVisible = Boolean(rawUrl && audit && revealedUrl === rawUrl);
  const shownAudit = reportVisible ? audit : null;
  const failedStepId = error ? stepForError(error.code) : null;
  const showLoader = Boolean(rawUrl) && !reportVisible && (!error || failedStepId !== null);

  const selectSiteType = useCallback(
    (selection: SiteTypeSelection) => {
      if (!rawUrl) return;
      const params = new URLSearchParams(searchParams.toString());
      if (selection === "auto") params.delete("type");
      else params.set("type", selection);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, rawUrl, router, searchParams],
  );

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 border-b border-line bg-background/92 backdrop-blur-md">
        <div className="mx-auto flex h-12 w-full max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Logo />
          <span className="hidden h-4 w-px bg-line md:block" aria-hidden="true" />
          <div className="hidden flex-1 justify-center md:flex">
            <QuickAuditBar
              key={rawUrl}
              size="compact"
              defaultValue={rawUrl}
              className="max-w-sm"
              buttonLabel="audit"
            />
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {shownAudit ? (
              <Badge variant={scoreTone(shownAudit.score)}>score {shownAudit.score}</Badge>
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
            key={`mobile-${rawUrl}`}
            size="compact"
            defaultValue={rawUrl}
            buttonLabel="audit"
          />
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {!rawUrl ? <EmptyState /> : null}

        {showLoader ? (
          <PipelineLoader
            key={requestKey}
            target={prettyDomain(rawUrl)}
            audit={settled ? fetchState.audit : null}
            failedStepId={failedStepId}
            onComplete={reveal}
          />
        ) : null}

        {rawUrl && !audit && !loading && error ? (
          <ErrorState error={error} onRetry={refresh} />
        ) : null}

        {reportVisible && audit ? (
          <>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-[9px] tracking-[0.16em] text-muted uppercase">
                  audit workspace / {audit.meta.cached ? "cached" : "live run"}
                </p>
                <h1 className="mt-1 truncate text-2xl font-medium tracking-tight sm:text-3xl">
                  {audit.domain}
                </h1>
                <p className="mt-1 line-clamp-1 text-xs text-muted">{audit.profile.title}</p>
              </div>
              {loading ? (
                <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted">
                  <RefreshCw className="size-3 animate-spin" aria-hidden="true" />
                  refreshing
                </span>
              ) : (
                <span className="font-mono text-[10px] text-muted/60">
                  {audit.meta.pageCount} pages · {audit.files.filter((file) => file.found).length}{" "}
                  discovery files
                </span>
              )}
            </div>

            <SiteClassificationPanel
              classification={audit.classification}
              selected={override ?? "auto"}
              onSelect={selectSiteType}
              busy={loading}
            />

            <Tabs defaultValue="audit" className="space-y-4">
              <TabsList>
                <TabsTrigger value="audit">
                  <Gauge aria-hidden="true" />
                  Audit matrix
                </TabsTrigger>
                <TabsTrigger value="builder">
                  <FileText aria-hidden="true" />
                  llms.txt editor
                </TabsTrigger>
                <TabsTrigger value="vision">
                  <Eye aria-hidden="true" />
                  Scraper simulator
                </TabsTrigger>
              </TabsList>

              <TabsContent value="audit">
                <AuditMatrix audit={audit} onRefresh={refresh} refreshing={loading} />
              </TabsContent>

              <TabsContent value="builder">
                <LlmsTxtEditor key={`builder-${audit.meta.crawledAt}`} audit={audit} />
              </TabsContent>

              <TabsContent value="vision">
                <ScraperSimulator key={`vision-${audit.meta.crawledAt}`} audit={audit} />
              </TabsContent>
            </Tabs>
          </>
        ) : null}
      </main>

      <WorkspaceFooter />
    </div>
  );
}

export function WorkspaceSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <div className="h-2.5 w-28 rounded-[2px] bg-panel-2" />
        <div className="h-7 w-56 rounded-[2px] bg-panel-2" />
      </div>
      <div className="h-56 rounded-[4px] border border-line bg-panel/50" />
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="h-72 rounded-[4px] border border-line bg-panel/50" />
        <div className="h-72 rounded-[4px] border border-line bg-panel/50" />
      </div>
      <p className="flex items-center justify-center gap-2 font-mono text-[10px] text-muted">
        <RefreshCw className="size-3 animate-spin" aria-hidden="true" />
        Fetching HTML, classification signals and discovery manifests…
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="grid items-center gap-10 py-6 lg:grid-cols-[1.05fr_0.95fr] lg:py-12">
      <div>
        <Badge variant="accent">free · open source · no signup</Badge>
        <h1 className="mt-4 text-3xl font-medium tracking-[-0.03em] sm:text-5xl">
          Audit any site against the
          <span className="text-accent-strong"> AI discovery specs.</span>
        </h1>
        <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted sm:text-base">
          Enter a domain to see whether crawlers can find your manifests, whether robots.txt lets
          them in, and what the initial HTML actually says.
        </p>
        <div className="mt-6 max-w-xl">
          <QuickAuditBar size="hero" />
        </div>
        <p className="mt-3 font-mono text-[10px] text-muted/60">
          no browser execution · no database · 30 audits/min per IP
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
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: WorkspaceError; onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-xl py-12">
      <div className="rounded-[4px] border border-line bg-panel p-6 text-center">
        <div className="mx-auto flex size-10 items-center justify-center rounded-[2px] border border-fail/30 bg-fail/10">
          <AlertCircle className="size-5 text-fail" aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-xl font-medium tracking-tight">Audit unavailable</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">{error.message}</p>
        {error.hint ? <p className="mt-1 text-xs text-muted/80">{error.hint}</p> : null}

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button onClick={onRetry}>
            <RefreshCw aria-hidden="true" />
            Try again
          </Button>
          <Button asChild variant="secondary">
            <Link href="/app">
              <Terminal aria-hidden="true" />
              Audit another site
            </Link>
          </Button>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2 font-mono text-[10px] text-muted/70">
          <span>Try a preset:</span>
          {SAMPLE_TARGETS.slice(0, 3).map((target) => (
            <a
              key={target.url}
              href={`/app?url=${encodeURIComponent(target.url)}`}
              className="underline-offset-4 transition-colors hover:text-accent-strong hover:underline"
            >
              {target.name}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function WorkspaceFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 font-mono text-[10px] text-muted sm:px-6">
        <p>LLMReady · GPL-3.0-only · v3</p>
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
