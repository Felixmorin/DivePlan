import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex max-w-full min-h-11 items-center justify-center gap-2 rounded-xl text-center text-sm font-semibold leading-tight transition-all duration-[var(--duration-fast)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-[var(--color-brand)] text-[var(--color-navy)] shadow-sm hover:bg-[var(--color-brand-strong)] hover:text-white",
        action: "bg-[var(--color-action)] text-white shadow-[0_10px_22px_rgba(255,107,87,0.28)] hover:bg-[var(--color-action-strong)]",
        secondary: "bg-[var(--color-surface-raised)] text-[var(--color-navy)] hover:bg-white",
        outline: "border border-[var(--color-border)] bg-white text-[var(--color-navy)] hover:border-[var(--color-brand)] hover:bg-[var(--color-surface-raised)]",
        ghost: "text-[var(--color-ink-muted)] hover:bg-white/70 hover:text-[var(--color-navy)]",
        dark: "bg-white text-[var(--color-navy)] hover:bg-[var(--block-pool-bg)]",
        success: "bg-[var(--color-success)] text-white hover:bg-[#0f8f59]"
      },
      size: {
        default: "h-11 px-4 py-2",
        sm: "h-9 min-h-9 px-3",
        lg: "h-12 px-6 text-base",
        icon: "h-11 w-11"
      }
    },
    defaultVariants: { variant: "default", size: "default" }
  }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
