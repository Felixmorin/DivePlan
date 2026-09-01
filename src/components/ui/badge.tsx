import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex min-h-6 items-center rounded-full px-2.5 py-1 text-xs font-black tracking-normal", {
  variants: {
    variant: {
      default: "bg-[var(--block-pool-bg)] text-[var(--block-pool-fg)]",
      success: "bg-[var(--color-success-soft)] text-[var(--color-success)]",
      warning: "bg-[var(--block-dryland-bg)] text-[var(--block-dryland-fg)]",
      action: "bg-[var(--color-action)] text-white",
      dark: "bg-[var(--color-navy)] text-white",
      outline: "border border-[var(--color-border)] bg-white text-[var(--color-ink-muted)]"
    }
  },
  defaultVariants: { variant: "default" }
});

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
