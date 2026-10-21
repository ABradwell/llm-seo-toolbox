import { AlertTriangle, Check, Info, X } from "lucide-react";

import type { CheckStatus } from "@/types/audit";
import { cn } from "@/lib/utils";

export function StatusIcon({ status, className }: { status: CheckStatus; className?: string }) {
  const base = "size-3.5 shrink-0";

  switch (status) {
    case "pass":
      return <Check className={cn(base, "text-pass", className)} aria-hidden="true" />;
    case "warn":
      return <AlertTriangle className={cn(base, "text-warn", className)} aria-hidden="true" />;
    case "fail":
      return <X className={cn(base, "text-fail", className)} aria-hidden="true" />;
    default:
      return <Info className={cn(base, "text-muted", className)} aria-hidden="true" />;
  }
}

export function StatusLabel({ status }: { status: CheckStatus }) {
  return (
    <span
      className={cn(
        "font-mono text-[10px] tracking-[0.12em] uppercase",
        status === "pass" && "text-pass",
        status === "warn" && "text-warn",
        status === "fail" && "text-fail",
        status === "info" && "text-muted",
      )}
    >
      {status}
    </span>
  );
}
