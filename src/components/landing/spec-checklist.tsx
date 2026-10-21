"use client";

import { ArrowRight, ExternalLink, Loader2, Play, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { StatusIcon } from "@/components/status-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SAMPLE_TARGETS, type SampleTarget } from "@/lib/samples";
import { siteConfig } from "@/lib/site";
import { cn } from "@/lib/utils";
import type { AuditApiError, AuditCheck, AuditResult, CheckStatus } from "@/types/audit";

interface ChecklistItem {
  id: string;
  label: string;
  expects: string;
  optional?: boolean;
}

const GROUPS: {
  id: "discovery" | "access" | "structure";
  label: string;
  spec: string;
  href: string;
  items: ChecklistItem[];
}[] = [
  {
    id: "discovery",
    label: "Discovery",
    spec: "llmstxt.org",
    href: siteConfig.llmsTxtSpec,
    items: [
      { id: "llms-txt", label: "/llms.txt", expects: "H1 + markdown index" },
      {
        id: "llms-full-txt",
        label: "/llms-full.txt",
        expects: "one unpaginated bundle",
        optional: true,
      },
      { id: "sitemap", label: "/sitemap.xml", expects: "URL set + Sitemap: directive" },
    ],
  },
  {
    id: "access",
    label: "Access",
    spec: "RFC 9309",
    href: siteConfig.rfc9309,
    items: [
      { id: "ai-policy", label: "AI policy", expects: "named crawler groups" },
      { id: "bot-google-extended", label: "Google-Extended", expects: "explicit allow / block" },
      { id: "bot-claudebot", label: "ClaudeBot", expects: "explicit allow / block" },
      { id: "bot-gptbot", label: "GPTBot", expects: "explicit allow / block" },
      { id: "x-robots-tag", label: "X-Robots-Tag", expects: "no blocking header" },
    ],
  },
  {
    id: "structure",
    label: "Structure",
    spec: "schema.org + HTML",
    href: siteConfig.schema,
    items: [
      { id: "heading-order", label: "Heading outline", expects: "H1 → H2 → H3, no skips" },
      { id: "snr", label: "Static SNR", expects: "≥ 65% readable signal" },
      { id: "ssr-content", label: "SSR payload", expects: "≥ 600 chars in HTML" },
      { id: "json-ld", label: "JSON-LD", expects: "valid @context + @type" },
      {
        id: "schema-types",
        label: "Schema types",
        expects: "TechArticle / FAQPage / SoftwareApplication",
      },
      { id: "openapi", label: "OpenAPI", expects: "/openapi.json", optional: true },
    ],
  },
];

type RunState =
  | { kind: "idle"; target: SampleTarget | null }
  | { kind: "loading"; target: SampleTarget }
  | { kind: "ready"; target: SampleTarget; audit: AuditResult }
  | { kind: "error"; target: SampleTarget; message: string };

export function SpecChecklist() {
  const [state, setState] = useState<RunState>({ kind: "idle", target: null });
  const controller = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );

  const checks = useMemo(() => {
    if (state.kind !== "ready") return new Map<string, AuditCheck>();
    const map = new Map<string, AuditCheck>();
    for (const pillar of state.audit.pillars) {
      for (const check of pillar.checks) map.set(check.id, check);
    }
    return map;
  }, [state]);

  async function run(target: SampleTarget) {
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    setState({ kind: "loading", target });

    try {
      const response = await fetch(`/api/audit?url=${encodeURIComponent(target.url)}`, {
        signal: next.signal,
        headers: { accept: "application/json" },
      });
      const payload = (await response.json()) as AuditResult | AuditApiError;

      if (!response.ok || "error" in payload) {
        setState({
          kind: "error",
          target,
          message:
            "error" in payload ? payload.error.message : `Audit failed (HTTP ${response.status}).`,
        });
        return;
      }

      setState({ kind: "ready", target, audit: payload });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setState({
        kind: "error",
        target,
        message: "The audit service could not be reached. Try again.",
      });
    }
  }

  const loading = state.kind === "loading";
  const activeTarget = state.target;

  return (
    <section id="checklist" className="scroll-mt-20 border-b border-line">
      <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:py-20">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="font-mono text-[10px] tracking-[0.2em] text-accent uppercase">
              02 / live specification checklist
            </p>
            <h2 className="mt-3 text-2xl font-medium tracking-tight sm:text-4xl">
              The core checks, against a real target.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">
              No abstract feature grid. Pick a standard preset and the same core checks that run in
              the workspace resolve here, with their protocol and pass condition.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {SAMPLE_TARGETS.map((target) => {
              const active = activeTarget?.url === target.url;
              return (
                <button
                  key={target.url}
                  type="button"
                  onClick={() => run(target)}
                  disabled={loading}
                  aria-pressed={active}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-[3px] border px-2.5 py-1.5 font-mono text-[11px] transition-colors disabled:opacity-60",
                    active
                      ? "border-accent/50 bg-accent/10 text-accent"
                      : "border-line bg-panel/70 text-muted hover:border-line-strong hover:text-foreground",
                  )}
                >
                  {loading && active ? (
                    <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                  ) : active && state.kind === "ready" ? (
                    <RotateCcw className="size-3" aria-hidden="true" />
                  ) : (
                    <Play className="size-3" aria-hidden="true" />
                  )}
                  {target.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-8 overflow-hidden rounded-[4px] border border-line bg-panel/50">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-panel-2/60 px-4 py-2.5 font-mono text-[10px] tracking-[0.1em] text-muted uppercase">
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  state.kind === "error"
                    ? "bg-fail"
                    : state.kind === "ready"
                      ? "bg-pass"
                      : loading
                        ? "animate-pulse bg-warn"
                        : "bg-muted/50",
                )}
                aria-hidden="true"
              />
              {state.kind === "ready"
                ? `${state.target.name} · ${state.audit.score}/100 · grade ${state.audit.grade}`
                : state.kind === "loading"
                  ? `Auditing ${state.target.url}`
                  : state.kind === "error"
                    ? "Live check failed"
                    : "Ready · select a preset"}
            </span>
            {state.kind === "ready" ? (
              <Link
                href={`/app?url=${encodeURIComponent(state.target.url)}`}
                className="inline-flex items-center gap-1 text-accent hover:underline"
              >
                Open full matrix
                <ArrowRight className="size-3" aria-hidden="true" />
              </Link>
            ) : (
              <span>same engine as /app</span>
            )}
          </div>

          {state.kind === "error" ? (
            <div className="border-b border-line bg-fail/5 px-4 py-3 font-mono text-xs text-fail">
              {state.message}
            </div>
          ) : null}

          <div className="grid lg:grid-cols-3">
            {GROUPS.map((group, index) => (
              <div
                key={group.id}
                className={cn(
                  "min-w-0 border-line",
                  index > 0 && "border-t lg:border-t-0 lg:border-l",
                )}
              >
                <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[10px] text-muted/60">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <h3 className="font-mono text-[11px] tracking-[0.14em] uppercase">
                      {group.label}
                    </h3>
                  </div>
                  <a
                    href={group.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-[10px] text-muted transition-colors hover:text-accent"
                  >
                    {group.spec}
                    <ExternalLink className="size-2.5" aria-hidden="true" />
                  </a>
                </div>

                <ul className="divide-y divide-[var(--line)]">
                  {group.items.map((item) => {
                    const check = checks.get(item.id);
                    return (
                      <li key={item.id} className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          {check ? (
                            <StatusIcon status={check.status} />
                          ) : (
                            <span
                              className="size-1.5 rounded-full bg-muted/40"
                              aria-hidden="true"
                            />
                          )}
                          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/90">
                            {item.label}
                          </span>
                          {check ? (
                            <Badge variant={badgeFor(check.status)} className="shrink-0">
                              {check.status}
                            </Badge>
                          ) : (
                            <span className="shrink-0 font-mono text-[9px] tracking-[0.12em] text-muted/50 uppercase">
                              {item.optional ? "optional" : "pending"}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-3 pl-[22px]">
                          <p className="truncate font-mono text-[10px] text-muted/70">
                            {check ? check.summary : item.expects}
                          </p>
                          {check?.evidence?.line ? (
                            <span className="shrink-0 font-mono text-[9px] text-muted/50">
                              {check.evidence.file}:{check.evidence.line}
                            </span>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 font-mono text-[10px] text-muted/70">
          <span>
            The checklist is live, not mocked: results stream from <code>/api/audit</code>.
          </span>
          <Button asChild variant="ghost" size="sm">
            <Link href="/app">
              Audit your own site
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function badgeFor(status: CheckStatus): "pass" | "warn" | "fail" | "default" {
  if (status === "pass") return "pass";
  if (status === "warn") return "warn";
  if (status === "fail") return "fail";
  return "default";
}
