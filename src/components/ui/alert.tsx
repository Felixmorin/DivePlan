import * as React from "react";
import { cn } from "@/lib/utils";

type AlertVariant = "default" | "success" | "warning" | "destructive";

const alertVariants: Record<AlertVariant, string> = {
  default: "border-[var(--color-border)] bg-[var(--color-surface-raised)] text-[var(--color-ink)]",
  success: "border-[var(--color-success)]/25 bg-[var(--color-success-soft)] text-[var(--color-success)]",
  warning: "border-[var(--color-warning)]/25 bg-[var(--block-dryland-bg)] text-[var(--block-dryland-fg)]",
  destructive: "border-[var(--color-danger)]/25 bg-red-50 text-[var(--color-danger)]"
};

export function Alert({ className, variant = "default", title, children, ...props }: React.HTMLAttributes<HTMLDivElement> & { variant?: AlertVariant; title?: string }) {
  return (
    <div role={variant === "destructive" ? "alert" : "status"} className={cn("rounded-[var(--radius-ui)] border p-4 text-sm", alertVariants[variant], className)} {...props}>
      {title && <div className="mb-1 font-black">{title}</div>}
      {children && <div className="leading-6 opacity-90">{children}</div>}
    </div>
  );
}
