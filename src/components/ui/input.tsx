import * as React from "react";

import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type = "text", ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      "h-9 w-full rounded-[3px] border border-line bg-panel-2 px-2.5 font-mono text-sm text-foreground transition-colors placeholder:text-muted/50 focus:border-accent/60 focus:outline-none",
      className,
    )}
    {...props}
  />
));

Input.displayName = "Input";
