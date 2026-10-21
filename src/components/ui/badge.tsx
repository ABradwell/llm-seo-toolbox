import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-[3px] border px-1.5 py-0.5 font-mono text-[10px] leading-4 tracking-[0.08em] whitespace-nowrap uppercase",
  {
    variants: {
      variant: {
        default: "border-line bg-panel-2 text-muted",
        accent: "border-accent/40 bg-accent/10 text-accent-strong",
        pass: "border-pass/40 bg-pass/10 text-pass",
        warn: "border-warn/40 bg-warn/10 text-warn",
        fail: "border-fail/40 bg-fail/10 text-fail",
        outline: "border-line bg-transparent text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
