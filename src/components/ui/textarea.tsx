import * as React from "react";

import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "min-h-24 w-full resize-y rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm leading-relaxed text-foreground transition-colors placeholder:text-muted/60 focus:border-acid/50 focus:outline-none",
      className,
    )}
    {...props}
  />
));

Textarea.displayName = "Textarea";
