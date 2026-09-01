import * as React from "react";
import { cn } from "@/lib/utils";

export function DialogSurface({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div role="dialog" aria-modal="true" className={cn("rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-soft)]", className)} {...props} />;
}

