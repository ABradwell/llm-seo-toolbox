"use client";

import { Download, FileCode2, FileText, Info, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";

import { CopyButton } from "@/components/copy-button";
import { LineNumberedCode } from "@/components/workspace/code-pane";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { downloadText } from "@/lib/download";
import { byteLength, buildLlmsFullTxt, buildLlmsTxt, groupPages } from "@/lib/llms";
import { validateLlmsTxt } from "@/lib/llms-txt";
import { cn, formatBytes, formatNumber } from "@/lib/utils";
import type { AuditResult } from "@/types/audit";

type FileKind = "llms" | "full";

export function LlmsTxtEditor({ audit }: { audit: AuditResult }) {
  const sections = useMemo(() => groupPages(audit.pages), [audit.pages]);

  const [siteName, setSiteName] = useState(audit.profile.siteName || audit.domain);
  const [description, setDescription] = useState(audit.profile.description);
  const [notes, setNotes] = useState("");
  const [selectedSections, setSelectedSections] = useState<string[]>(
    sections.map((section) => section.name),
  );
  const [fileKind, setFileKind] = useState<FileKind>("llms");

  const generated = useMemo(() => {
    const input = {
      siteName: siteName.trim() || audit.domain,
      description,
      notes,
      pages: audit.pages,
      selectedSections,
      capturedMarkdown: audit.vision.markdown,
    };
    return fileKind === "llms" ? buildLlmsTxt(input) : buildLlmsFullTxt(input);
  }, [
    audit.domain,
    audit.pages,
    audit.vision.markdown,
    description,
    fileKind,
    notes,
    selectedSections,
    siteName,
  ]);

  const validation = useMemo(() => validateLlmsTxt(generated), [generated]);
  const issues = validation.issues;
  const fileName = fileKind === "llms" ? "llms.txt" : "llms-full.txt";
  const bytes = byteLength(generated);

  function toggleSection(name: string) {
    setSelectedSections((current) =>
      current.includes(name) ? current.filter((entry) => entry !== name) : [...current, name],
    );
  }

  return (
    <div className="grid gap-3 xl:grid-cols-[0.82fr_1.18fr]">
      <div className="space-y-3">
        <section className="rounded-[4px] border border-line bg-panel p-4">
          <div className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-[2px] border border-line bg-panel-2">
              <FileText className="size-3.5 text-accent" aria-hidden="true" />
            </span>
            <div>
              <h3 className="font-mono text-[11px] tracking-[0.1em] uppercase">Manifest source</h3>
              <p className="text-[10px] text-muted">
                Facts pulled from the site inventory and the focus page.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="site-name">site name</Label>
              <Input
                id="site-name"
                value={siteName}
                onChange={(event) => setSiteName(event.target.value)}
                placeholder={audit.domain}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="site-description">one-line summary</Label>
              <Textarea
                id="site-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={`Key pages and documentation for ${audit.domain}.`}
                className="min-h-16"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="site-notes">optional notes (markdown)</Label>
              <Textarea
                id="site-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder={"## Optional\n- [Contact](https://example.com/contact)"}
                className="min-h-16"
              />
            </div>
          </div>
        </section>

        <section className="rounded-[4px] border border-line bg-panel p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-mono text-[11px] tracking-[0.1em] uppercase">Included sections</h3>
            <Badge variant="default">{formatNumber(audit.pages.length)} pages</Badge>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-muted">
            Site inventory discovered through the sitemap and internal links, grouped by URL
            pattern. The sample is a separate, smaller set used for scoring.
          </p>

          {sections.length === 0 ? (
            <p className="mt-3 rounded-[2px] border border-dashed border-line p-3 text-[11px] text-muted">
              No crawlable pages were discovered. The manifest will link to the homepage only.
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {sections.map((section) => {
                const active = selectedSections.includes(section.name);
                return (
                  <button
                    key={section.name}
                    type="button"
                    onClick={() => toggleSection(section.name)}
                    aria-pressed={active}
                    className={
                      active
                        ? "rounded-[2px] border border-ink bg-ink px-2 py-1 font-mono text-[10px] text-parchment transition-colors"
                        : "rounded-[2px] border border-line bg-panel-2/60 px-2 py-1 font-mono text-[10px] text-muted transition-colors hover:text-foreground"
                    }
                  >
                    {section.name}
                    <span className={cn("ml-1.5", active ? "text-parchment/60" : "text-muted/60")}>
                      {section.pages.length}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-[4px] border border-line bg-panel/60 p-4">
          <div className="flex items-center gap-2">
            <Info className="size-3.5 text-accent" aria-hidden="true" />
            <p className="font-mono text-[10px] tracking-[0.1em] uppercase">Spec checklist</p>
          </div>
          <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-muted">
            <li>· One H1 with the project or site name.</li>
            <li>· A blockquote summary directly under it.</li>
            <li>· H2 sections containing markdown links to the important pages.</li>
            <li>· An optional notes section for context that does not fit the index.</li>
          </ul>
        </section>
      </div>

      <section className="flex min-h-[560px] min-w-0 flex-col overflow-hidden rounded-[4px] border border-line bg-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2.5">
          <div className="flex items-center gap-1 rounded-[3px] border border-line bg-panel-2 p-0.5">
            {(["llms", "full"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => setFileKind(kind)}
                aria-pressed={fileKind === kind}
                className={
                  fileKind === kind
                    ? "rounded-[2px] bg-ink px-2.5 py-1 font-mono text-[10px] text-parchment"
                    : "rounded-[2px] px-2.5 py-1 font-mono text-[10px] text-muted transition-colors hover:text-foreground"
                }
              >
                /{kind === "llms" ? "llms.txt" : "llms-full.txt"}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="mr-1 hidden font-mono text-[10px] text-muted sm:inline">
              {formatNumber(validation.lines)} lines · {formatBytes(bytes)}
            </span>
            <CopyButton value={generated} label="Copy" />
            <Button
              size="sm"
              onClick={() => downloadText(fileName, generated)}
              variant="secondary"
              type="button"
            >
              <Download aria-hidden="true" />
              Download
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 border-b border-line bg-background/60 px-3 py-1.5">
          <FileCode2 className="size-3 text-muted" aria-hidden="true" />
          <span className="truncate font-mono text-[10px] text-muted">
            https://{audit.domain}/{fileName}
          </span>
          <span className="ml-auto font-mono text-[9px] tracking-[0.1em] text-muted/60 uppercase">
            editor
          </span>
        </div>

        <LineNumberedCode value={generated} maxHeight="max-h-[520px]" className="flex-1" />

        <div className="border-t border-line bg-panel-2/40 px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge variant={validation.valid ? "pass" : "fail"}>
                {validation.valid ? "valid" : "issues"}
              </Badge>
              <span className="font-mono text-[10px] text-muted">
                H1 {validation.h1Line ? `L${validation.h1Line}` : "missing"} ·{" "}
                {formatNumber(validation.linkCount)} links · {validation.sections.length} sections
              </span>
            </div>
            <span className="inline-flex items-center gap-1 font-mono text-[9px] tracking-[0.1em] text-muted/60 uppercase">
              <Wand2 className="size-3" aria-hidden="true" />
              llmstxt.org validator
            </span>
          </div>

          {issues.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {issues.slice(0, 4).map((issue) => (
                <li
                  key={`${issue.code}-${issue.line ?? "file"}`}
                  className="flex items-start gap-1.5 font-mono text-[10px] leading-relaxed text-muted"
                >
                  <span className={issue.severity === "error" ? "text-fail" : "text-warn"}>
                    {issue.severity === "error" ? "×" : "!"}
                  </span>
                  <span>
                    {issue.line ? `L${issue.line}: ` : ""}
                    {issue.message}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 font-mono text-[10px] text-pass">
              H1, summary, sections and links satisfy the manifest structure.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
