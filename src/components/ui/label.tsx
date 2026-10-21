import * as React from "react";

import { cn } from "@/lib/utils";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("font-mono text-[11px] tracking-[0.14em] text-muted uppercase", className)}
      {...props}
    />
  );
}
