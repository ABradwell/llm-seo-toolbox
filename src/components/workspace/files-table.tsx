import { ArrowUpRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatBytes } from "@/lib/utils";
import type { DiscoveryFile } from "@/types/audit";

export function FilesTable({ files }: { files: DiscoveryFile[] }) {
  return (
    <section className="overflow-hidden rounded-[4px] border border-line bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <h3 className="font-mono text-[11px] tracking-[0.1em] uppercase">Discovery surface</h3>
          <p className="mt-0.5 text-[11px] text-muted">
            The machine-readable endpoints the engine probed.
          </p>
        </div>
        <Badge variant="default">{files.filter((file) => file.found).length} found</Badge>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-left">
          <thead>
            <tr className="border-b border-line bg-panel-2/50 font-mono text-[9px] tracking-[0.12em] text-muted uppercase">
              <th className="px-4 py-2 font-normal">endpoint</th>
              <th className="px-4 py-2 font-normal">path</th>
              <th className="px-4 py-2 font-normal">status</th>
              <th className="px-4 py-2 font-normal">size</th>
              <th className="px-4 py-2 font-normal">note</th>
              <th className="px-4 py-2 font-normal" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {files.map((file) => (
              <tr key={file.id} className="hover:bg-panel-2/40">
                <td className="px-4 py-2.5 font-mono text-[11px] font-medium">{file.label}</td>
                <td className="max-w-[220px] truncate px-4 py-2.5 font-mono text-[10px] text-muted">
                  {file.path}
                </td>
                <td className="px-4 py-2.5 font-mono text-[10px]">
                  {file.found ? (
                    <span className="text-pass">{file.statusCode ?? 200}</span>
                  ) : (
                    <span className="text-muted/60">{file.statusCode ?? "—"}</span>
                  )}
                </td>
                <td className="px-4 py-2.5 font-mono text-[10px] text-muted">
                  {file.found ? formatBytes(file.bytes) : "—"}
                </td>
                <td className="px-4 py-2.5">
                  <Badge variant={file.found ? "pass" : "default"}>{file.note}</Badge>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex text-muted transition-colors hover:text-accent"
                    aria-label={`Open ${file.label}`}
                  >
                    <ArrowUpRight className="size-3.5" aria-hidden="true" />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
