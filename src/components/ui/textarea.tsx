import * as React from "react";

import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "min-h-24 w-full resize-y rounded-[3px] border border-line bg-panel-2 px-2.5 py-2 font-mono text-xs leading-relaxed text-foreground transition-colors placeholder:text-muted/50 focus:border-accent/60 focus:outline-none",
      className,
    )}
    {...props}
  />
));

Textarea.displayName = "Textarea";
