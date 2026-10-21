"use client";

import { AlertCircle, Eye, FileText, Gauge, Github, RefreshCw, Terminal } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Logo } from "@/components/logo";
import { ScanForm } from "@/components/scan-form";
import { AuditDashboard } from "@/components/tool/audit-dashboard";
import { LlmsBuilder } from "@/components/tool/llms-builder";
import { VisionSimulator } from "@/components/tool/vision-simulator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SAMPLE_TARGETS } from "@/lib/samples";
import { siteConfig } from "@/lib/site";
import { scoreTone } from "@/lib/score";
import type { AuditApiError, AuditResult } from "@/types/audit";

interface WorkspaceError {
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
  const rawUrl = searchParams.get("url")?.trim() ?? "";

  const [refreshToken, setRefreshToken] = useState(0);
  const [fetchState, setFetchState] = useState<FetchState>({
    key: "",
    url: "",
    audit: null,
    error: null,
  });

  const requestKey = `${rawUrl}::${refreshToken}`;

  useEffect(() => {
    if (!rawUrl) return;

    const controller = new AbortController();
    let active = true;

    fetch(`/api/audit?url=${encodeURIComponent(rawUrl)}`, {
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
  }, [rawUrl, requestKey]);

  const settled = fetchState.key === requestKey;
  const sameTarget = fetchState.url === rawUrl;
  const audit = settled ? fetchState.audit : sameTarget ? fetchState.audit : null;
  const error = settled ? fetchState.error : null;
  const loading = Boolean(rawUrl) && !settled;

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), []);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 border-b border-line bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Logo />
          <div className="hidden flex-1 justify-center md:flex">
            <ScanForm
              key={rawUrl}
              size="compact"
              defaultValue={rawUrl}
              className="max-w-md"
              buttonLabel="Audit"
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            {audit ? <Badge variant={scoreTone(audit.score)}>Score {audit.score}</Badge> : null}
            <Button asChild variant="ghost" size="sm" className="hidden lg:inline-flex">
              <a href={siteConfig.github} target="_blank" rel="noreferrer">
                <Github aria-hidden="true" />
                GitHub
              </a>
            </Button>
          </div>
        </div>
        <div className="px-4 pb-3 md:hidden">
          <ScanForm
            key={`mobile-${rawUrl}`}
            size="compact"
            defaultValue={rawUrl}
            buttonLabel="Audit"
          />
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {!rawUrl ? <EmptyState /> : null}

        {rawUrl && !audit && loading ? <WorkspaceSkeleton /> : null}

        {rawUrl && !audit && !loading && error ? (
          <ErrorState error={error} onRetry={refresh} />
        ) : null}

        {rawUrl && audit ? (
          <>
            <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0">
                <p className="font-mono text-[11px] tracking-[0.16em] text-muted uppercase">
                  Audit workspace
                </p>
                <h1 className="mt-2 truncate text-3xl font-medium tracking-tight sm:text-4xl">
                  {audit.domain}
                </h1>
                <p className="mt-2 line-clamp-1 text-sm text-muted">{audit.profile.title}</p>
              </div>
              {loading ? (
                <span className="flex items-center gap-2 font-mono text-xs text-muted">
                  <RefreshCw className="size-3.5 animate-spin" aria-hidden="true" />
                  Refreshing
                </span>
              ) : null}
            </div>

            <Tabs defaultValue="audit" className="space-y-6">
              <TabsList>
                <TabsTrigger value="audit">
                  <Gauge aria-hidden="true" />
                  Audit dashboard
                </TabsTrigger>
                <TabsTrigger value="builder">
                  <FileText aria-hidden="true" />
                  llms.txt builder
                </TabsTrigger>
                <TabsTrigger value="vision">
                  <Eye aria-hidden="true" />
                  Scraper vision
                </TabsTrigger>
              </TabsList>

              <TabsContent value="audit">
                <AuditDashboard audit={audit} onRefresh={refresh} refreshing={loading} />
              </TabsContent>

              <TabsContent value="builder">
                <LlmsBuilder key={`builder-${audit.meta.crawledAt}`} audit={audit} />
              </TabsContent>

              <TabsContent value="vision">
                <VisionSimulator key={`vision-${audit.meta.crawledAt}`} audit={audit} />
              </TabsContent>
            </Tabs>
          </>
        ) : null}
      </main>
    </div>
  );
}

export function WorkspaceSkeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-live="polite">
      <div className="space-y-3">
        <div className="h-3 w-32 rounded-full bg-panel-2" />
        <div className="h-8 w-64 rounded-lg bg-panel-2" />
      </div>
      <div className="h-72 rounded-3xl border border-line bg-panel/50" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-96 rounded-2xl border border-line bg-panel/50" />
        <div className="h-96 rounded-2xl border border-line bg-panel/50" />
      </div>
      <p className="flex items-center justify-center gap-2 font-mono text-xs text-muted">
        <RefreshCw className="size-3.5 animate-spin" aria-hidden="true" />
        Fetching HTML, robots.txt, llms.txt, sitemap.xml and structured data…
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="grid items-center gap-12 py-8 lg:grid-cols-[1.05fr_0.95fr] lg:py-14">
      <div>
        <Badge variant="accent">Free · Open source · No signup</Badge>
        <h1 className="mt-6 text-4xl font-medium tracking-[-0.03em] sm:text-5xl">
          Audit any site for
          <span className="font-serif text-acid italic"> LLM readiness.</span>
        </h1>
        <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted">
          Enter a domain to see how AI crawlers read it, which manifests are missing, and the exact
          fixes that raise your score.
        </p>
        <div className="mt-8 max-w-xl">
          <ScanForm size="hero" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {SAMPLE_TARGETS.map((target) => (
          <a
            key={target.url}
            href={`/app?url=${encodeURIComponent(target.url)}`}
            className="group rounded-2xl border border-line bg-panel/60 p-5 transition-colors hover:border-acid/40"
          >
            <p className="font-mono text-[10px] tracking-[0.16em] text-muted uppercase">
              {target.category}
            </p>
            <p className="mt-3 text-lg font-medium tracking-tight">{target.name}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">{target.blurb}</p>
          </a>
        ))}
      </div>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: WorkspaceError; onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-2xl py-16">
      <div className="rounded-3xl border border-line bg-panel/60 p-8 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-fail/30 bg-fail/10">
          <AlertCircle className="size-6 text-fail" aria-hidden="true" />
        </div>
        <h1 className="mt-6 text-2xl font-medium tracking-tight">Audit unavailable</h1>
        <p className="mt-3 leading-relaxed text-muted">{error.message}</p>
        {error.hint ? <p className="mt-2 text-sm text-muted/80">{error.hint}</p> : null}

        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Button onClick={onRetry}>
            <RefreshCw aria-hidden="true" />
            Try again
          </Button>
          <Button asChild variant="secondary">
            <a href="/app">
              <Terminal aria-hidden="true" />
              Audit another site
            </a>
          </Button>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-2 font-mono text-xs text-muted/70">
          <span>Try a sample instead:</span>
          {SAMPLE_TARGETS.slice(0, 3).map((target) => (
            <a
              key={target.url}
              href={`/app?url=${encodeURIComponent(target.url)}`}
              className="underline-offset-4 transition-colors hover:text-acid hover:underline"
            >
              {target.name}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
