import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils/cn";

const badgeVariants = cva("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide", {
  variants: {
    variant: {
      default: "bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]",
      approve: "bg-[hsl(var(--success)/0.2)] text-[hsl(var(--success))]",
      warn: "bg-[hsl(var(--warn)/0.2)] text-[hsl(var(--warn))]",
      require: "bg-purple-500/20 text-purple-300",
      block: "bg-[hsl(var(--danger)/0.2)] text-[hsl(var(--danger))]",
      info: "bg-blue-500/20 text-blue-300",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
