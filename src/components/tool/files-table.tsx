import { ArrowUpRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatBytes } from "@/lib/utils";
import type { DiscoveryFile } from "@/types/audit";

export function FilesTable({ files }: { files: DiscoveryFile[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-panel/60">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h3 className="text-base font-medium">Standard endpoints</h3>
          <p className="mt-1 text-sm text-muted">
            The machine-readable files crawlers and agents look for first.
          </p>
        </div>
        <Badge variant="default">{files.filter((file) => file.found).length} found</Badge>
      </div>

      <ul className="divide-y divide-line">
        {files.map((file) => (
          <li key={file.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
            <span
              className={
                file.found ? "size-1.5 rounded-full bg-pass" : "size-1.5 rounded-full bg-muted/40"
              }
              aria-hidden="true"
            />
            <span className="w-36 text-sm font-medium">{file.label}</span>
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted">
              {file.path}
            </span>
            <span className="font-mono text-xs text-muted">
              {file.found ? formatBytes(file.bytes) : "—"}
            </span>
            <Badge variant={file.found ? "pass" : "default"}>{file.note}</Badge>
            <a
              href={file.url}
              target="_blank"
              rel="noreferrer"
              className="text-muted transition-colors hover:text-acid"
              aria-label={`Open ${file.label}`}
            >
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
