"use client";

import { Download, FileCode2, FileText, Info } from "lucide-react";
import { useMemo, useState } from "react";

import { CopyButton } from "@/components/copy-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { downloadText } from "@/lib/download";
import { byteLength, buildLlmsFullTxt, buildLlmsTxt, groupPages } from "@/lib/llms";
import { formatBytes, formatNumber } from "@/lib/utils";
import type { AuditResult } from "@/types/audit";

type FileKind = "llms" | "full";

export function LlmsBuilder({ audit }: { audit: AuditResult }) {
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

  const fileName = fileKind === "llms" ? "llms.txt" : "llms-full.txt";
  const lines = generated.split("\n").length;
  const bytes = byteLength(generated);

  function toggleSection(name: string) {
    setSelectedSections((current) =>
      current.includes(name) ? current.filter((entry) => entry !== name) : [...current, name],
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <section className="space-y-6">
        <div className="rounded-2xl border border-line bg-panel/60 p-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl border border-line bg-panel-2">
              <FileText className="size-4 text-acid" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-base font-medium">Manifest source</h3>
              <p className="text-sm text-muted">Facts pulled from the audited page.</p>
            </div>
          </div>

          <div className="mt-6 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="site-name">Site name</Label>
              <Input
                id="site-name"
                value={siteName}
                onChange={(event) => setSiteName(event.target.value)}
                placeholder={audit.domain}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="site-description">One-line summary</Label>
              <Textarea
                id="site-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={`Key pages and documentation for ${audit.domain}.`}
                className="min-h-20"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="site-notes">Optional notes (markdown)</Label>
              <Textarea
                id="site-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder={"## Optional\n- [Contact](https://example.com/contact)"}
                className="min-h-20 font-mono text-xs"
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-panel/60 p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-medium">Included sections</h3>
            <Badge variant="default">{formatNumber(audit.pages.length)} pages</Badge>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Pages discovered through the sitemap and internal links, grouped by URL pattern.
          </p>

          {sections.length === 0 ? (
            <p className="mt-5 rounded-xl border border-dashed border-line p-4 text-sm text-muted">
              No crawlable pages were discovered. The manifest will link to the homepage only.
            </p>
          ) : (
            <div className="mt-5 flex flex-wrap gap-2">
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
                        ? "rounded-full border border-acid/50 bg-acid/10 px-3 py-1.5 text-sm text-foreground transition-colors"
                        : "rounded-full border border-line bg-panel-2/60 px-3 py-1.5 text-sm text-muted transition-colors hover:text-foreground"
                    }
                  >
                    {section.name}
                    <span className="ml-2 font-mono text-xs text-muted/70">
                      {section.pages.length}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-line bg-panel/40 p-5">
          <div className="flex items-center gap-2">
            <Info className="size-4 text-acid" aria-hidden="true" />
            <p className="text-sm font-medium">Spec checklist</p>
          </div>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted">
            <li>· One H1 with the project or site name.</li>
            <li>· A blockquote summary directly under it.</li>
            <li>· H2 sections containing markdown links to the important pages.</li>
            <li>· An optional notes section for context that does not fit the index.</li>
          </ul>
        </div>
      </section>

      <section className="flex min-h-[560px] flex-col overflow-hidden rounded-2xl border border-line bg-panel/70">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-center gap-1 rounded-lg border border-line bg-panel-2 p-1">
            {(["llms", "full"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => setFileKind(kind)}
                aria-pressed={fileKind === kind}
                className={
                  fileKind === kind
                    ? "rounded-md bg-acid px-3 py-1.5 font-mono text-xs text-[#0a0d09]"
                    : "rounded-md px-3 py-1.5 font-mono text-xs text-muted transition-colors hover:text-foreground"
                }
              >
                /{kind === "llms" ? "llms.txt" : "llms-full.txt"}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="mr-1 hidden font-mono text-xs text-muted sm:inline">
              {formatNumber(lines)} lines · {formatBytes(bytes)}
            </span>
            <CopyButton value={generated} />
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

        <div className="flex items-center gap-2 border-b border-line bg-background/50 px-5 py-2.5">
          <FileCode2 className="size-3.5 text-muted" aria-hidden="true" />
          <span className="truncate font-mono text-xs text-muted">
            https://{audit.domain}/{fileName}
          </span>
        </div>

        <pre className="flex-1 overflow-auto p-5 font-mono text-[13px] leading-relaxed whitespace-pre-wrap text-foreground/90">
          <code>{generated}</code>
        </pre>
      </section>
    </div>
  );
}
