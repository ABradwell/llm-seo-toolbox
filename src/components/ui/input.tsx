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
      "h-10 w-full rounded-lg border border-line bg-panel-2 px-3 text-sm text-foreground transition-colors placeholder:text-muted/60 focus:border-acid/50 focus:outline-none",
      className,
    )}
    {...props}
  />
));

Input.displayName = "Input";
