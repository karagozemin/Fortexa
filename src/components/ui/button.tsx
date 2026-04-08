import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-xl text-sm font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
  {
    variants: {
      variant: {
        default:
          "border border-cyan-300/40 bg-cyan-300/[0.92] text-slate-950 shadow-[0_8px_24px_rgba(56,189,248,0.26)] hover:-translate-y-0.5 hover:bg-cyan-200",
        secondary:
          "border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.82)] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted)/1)]",
        outline:
          "border border-[hsl(var(--border))] bg-transparent text-[hsl(var(--foreground))] hover:border-cyan-300/40 hover:bg-cyan-400/10",
        danger: "border border-rose-400/30 bg-[hsl(var(--danger)/0.2)] text-rose-200 hover:bg-[hsl(var(--danger)/0.3)]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-lg px-3",
        lg: "h-11 px-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
