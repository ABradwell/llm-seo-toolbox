"use client";

import {
  AlertCircle,
  Eye,
  FileText,
  Gauge,
  Layers,
  ListChecks,
  RefreshCw,
  Terminal,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { AuditMatrix } from "@/components/workspace/audit-matrix";
import { LlmsTxtEditor } from "@/components/workspace/llms-txt-editor";
import { PageResultsTable } from "@/components/workspace/page-results-table";
import { PipelineLoader } from "@/components/workspace/pipeline-loader";
import { PlainReport } from "@/components/workspace/plain-report";
import { ScraperSimulator } from "@/components/workspace/scraper-simulator";
import {
  SiteClassificationPanel,
  type SiteTypeSelection,
} from "@/components/workspace/site-classification-panel";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { stepForError } from "@/lib/pipeline-steps";
import { SAMPLE_TARGETS } from "@/lib/samples";
import { isSiteType } from "@/lib/site-types";
import { prettyDomain } from "@/lib/url";
import { formatNumber } from "@/lib/utils";
import { applyView, parseView, type ViewMode } from "@/lib/view-mode";
import type { AuditApiError, AuditResult, AuditScope } from "@/types/audit";

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
  const scope: AuditScope = searchParams.get("scope") === "page" ? "page" : "site";
  const view = parseView(searchParams.get("view"));
  // Element to scroll to once the technical view has rendered.
  const pendingAnchor = useRef<string | null>(null);

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

  const requestKey = `${rawUrl}::${override ?? "auto"}::${scope}::${refreshToken}`;

  useEffect(() => {
    if (!rawUrl) return;

    const controller = new AbortController();
    let active = true;
    const typeQuery = override ? `&type=${encodeURIComponent(override)}` : "";

    fetch(`/api/audit?url=${encodeURIComponent(rawUrl)}${typeQuery}&scope=${scope}`, {
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
  }, [rawUrl, override, scope, requestKey]);

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

  const selectScope = useCallback(
    (next: AuditScope) => {
      if (!rawUrl || next === scope) return;
      const params = new URLSearchParams(searchParams.toString());
      if (next === "site") params.delete("scope");
      else params.set("scope", "page");
      setRevealedUrl("");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, rawUrl, router, scope, searchParams],
  );

  const selectView = useCallback(
    (next: ViewMode, anchorId?: string) => {
      pendingAnchor.current = anchorId ?? null;
      if (next === view) return;
      const params = applyView(new URLSearchParams(searchParams.toString()), next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams, view],
  );

  useEffect(() => {
    const anchorId = pendingAnchor.current;
    if (view !== "technical" || !anchorId) return;
    pendingAnchor.current = null;
    const frame = requestAnimationFrame(() => {
      document.getElementById(anchorId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [view]);

  return (
    <WorkspaceShell
      defaultValue={rawUrl}
      score={shownAudit ? { score: shownAudit.score, scope: shownAudit.scope } : null}
    >
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
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="font-mono text-[9px] tracking-[0.14em] text-muted uppercase">
                  view
                </span>
                <SegmentedControl
                  label="Report detail"
                  value={view}
                  onChange={(next) => selectView(next)}
                  options={[
                    { value: "plain", label: "plain language" },
                    { value: "technical", label: "technical" },
                  ]}
                />
                <span className="font-mono text-[9px] tracking-[0.14em] text-muted uppercase">
                  scope
                </span>
                <SegmentedControl
                  label="Audit scope"
                  value={scope}
                  onChange={selectScope}
                  options={[
                    { value: "site", label: "site" },
                    { value: "page", label: "page" },
                  ]}
                />
                <span className="font-mono text-[9px] text-muted/60">
                  {audit.scope === "site"
                    ? `${audit.coverage.analyzedPages}/${audit.coverage.sampleSize} sampled`
                    : "page scope"}{" "}
                  · {formatNumber(audit.coverage.inventorySize)} discovered · focus{" "}
                  {pathOf(audit.focusUrl)}
                </span>
              </div>
            </div>
            {loading ? (
              <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted">
                <RefreshCw className="size-3 animate-spin" aria-hidden="true" />
                refreshing
              </span>
            ) : (
              <span className="font-mono text-[10px] text-muted/60">
                {audit.coverage.analyzedPages} {audit.scope === "site" ? "sampled" : "page"} ·{" "}
                {audit.meta.pageCount} listed · {audit.files.filter((file) => file.found).length}{" "}
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
                {view === "plain" ? (
                  <ListChecks aria-hidden="true" />
                ) : (
                  <Gauge aria-hidden="true" />
                )}
                {view === "plain" ? "What to fix" : "Audit matrix"}
              </TabsTrigger>
              <TabsTrigger value="pages">
                <Layers aria-hidden="true" />
                {audit.scope === "site" ? "Sampled pages" : "Page results"}
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
              {view === "plain" ? (
                <PlainReport
                  audit={audit}
                  onRefresh={refresh}
                  refreshing={loading}
                  onShowTechnical={(anchorId) => selectView("technical", anchorId)}
                />
              ) : (
                <AuditMatrix audit={audit} onRefresh={refresh} refreshing={loading} />
              )}
            </TabsContent>

            <TabsContent value="pages">
              <PageResultsTable audit={audit} />
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
    </WorkspaceShell>
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

function pathOf(value: string): string {
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}` || "/";
  } catch {
    return value;
  }
}
