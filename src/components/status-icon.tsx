import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

import type { CheckStatus } from "@/types/audit";
import { cn } from "@/lib/utils";

export function StatusIcon({ status, className }: { status: CheckStatus; className?: string }) {
  const base = "size-4 shrink-0";

  switch (status) {
    case "pass":
      return <CheckCircle2 className={cn(base, "text-pass", className)} aria-hidden="true" />;
    case "warn":
      return <AlertTriangle className={cn(base, "text-warn", className)} aria-hidden="true" />;
    case "fail":
      return <XCircle className={cn(base, "text-fail", className)} aria-hidden="true" />;
    default:
      return <Info className={cn(base, "text-muted", className)} aria-hidden="true" />;
  }
}
