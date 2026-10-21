import { ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Bot, Braces, Compass, ScanText } from "lucide-react";

import { StatusIcon } from "@/components/status-icon";
import { Badge } from "@/components/ui/badge";
import { statusColor } from "@/lib/score";
import { cn } from "@/lib/utils";
import type { AuditPillar, PillarId } from "@/types/audit";

const PILLAR_ICONS: Record<PillarId, LucideIcon> = {
  discovery: Compass,
  access: Bot,
  semantic: ScanText,
  structured: Braces,
};

export function PillarCard({ pillar }: { pillar: AuditPillar }) {
  const Icon = PILLAR_ICONS[pillar.id];

  return (
    <article className="flex flex-col rounded-2xl border border-line bg-panel/60 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-line bg-panel-2">
            <Icon className="size-5 text-acid" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-base leading-tight font-medium">{pillar.name}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{pillar.description}</p>
          </div>
        </div>
        <div className="text-right">
          <p
            className="font-mono text-2xl leading-none"
            style={{ color: statusColor(scoreToStatus(pillar.score)) }}
          >
            {pillar.score}
          </p>
          <p className="mt-1 font-mono text-[10px] tracking-[0.14em] text-muted/70 uppercase">
            / 100
          </p>
        </div>
      </div>

      <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-panel-2">
        <div
          className="h-full rounded-full transition-[width] duration-700"
          style={{
            width: `${pillar.score}%`,
            background: statusColor(scoreToStatus(pillar.score)),
          }}
        />
      </div>

      <ul className="mt-5 divide-y divide-[var(--line)] border-t border-line">
        {pillar.checks.map((check) => (
          <li key={check.id}>
            <details className="group">
              <summary className="flex items-center gap-3 py-3.5">
                <StatusIcon status={check.status} />
                <span className="min-w-0 flex-1 text-sm font-medium">{check.label}</span>
                <span className="hidden truncate font-mono text-xs text-muted sm:block">
                  {check.summary}
                </span>
                <Badge
                  variant={
                    check.status === "pass"
                      ? "pass"
                      : check.status === "warn"
                        ? "warn"
                        : check.status === "fail"
                          ? "fail"
                          : "default"
                  }
                  className="hidden sm:inline-flex"
                >
                  {check.status}
                </Badge>
                <ChevronDown
                  className={cn(
                    "size-4 shrink-0 text-muted transition-transform group-open:rotate-180",
                  )}
                  aria-hidden="true"
                />
              </summary>
              <div className="pb-4 pl-7">
                <p className="text-sm leading-relaxed text-muted">{check.detail}</p>
                <p className="mt-1 font-mono text-xs text-muted sm:hidden">{check.summary}</p>
                {check.recommendation && check.status !== "pass" ? (
                  <p className="mt-3 border-l-2 border-l-acid/50 pl-3 text-sm leading-relaxed text-foreground/90">
                    {check.recommendation}
                  </p>
                ) : null}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </article>
  );
}

function scoreToStatus(score: number): "pass" | "warn" | "fail" {
  if (score >= 75) return "pass";
  if (score >= 50) return "warn";
  return "fail";
}
