import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-[3px] font-mono text-xs font-medium tracking-wide whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-accent text-[#0a0d09] hover:bg-accent-strong",
        secondary:
          "border border-line bg-panel-2 text-foreground hover:border-line-strong hover:bg-panel-3",
        outline: "border border-line bg-transparent text-foreground hover:border-accent/50",
        ghost: "text-muted hover:bg-panel-2 hover:text-foreground",
        danger: "border border-fail/40 bg-fail/10 text-fail hover:bg-fail/20",
        link: "text-accent underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-7 px-2.5 text-[11px] [&_svg]:size-3.5",
        default: "h-9 px-3.5 [&_svg]:size-4",
        lg: "h-11 px-5 text-sm [&_svg]:size-4",
        icon: "size-9 [&_svg]:size-4",
        "icon-sm": "size-7 [&_svg]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Component = asChild ? Slot : "button";
    return (
      <Component
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";

export { buttonVariants };
