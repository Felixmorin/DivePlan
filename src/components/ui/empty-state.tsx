import type * as React from "react";
import type { LucideIcon } from "lucide-react";
import { Waves } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({ title, description, icon: Icon = Waves, className, action }: { title: string; description?: string; icon?: LucideIcon; className?: string; action?: React.ReactNode }) {
  return (
    <div className={cn("rounded-[var(--radius-ui)] border border-dashed border-[var(--color-border-strong)] bg-white/70 p-8 text-center", className)}>
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--block-pool-bg)] text-[var(--block-pool-fg)]">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-lg font-black text-current">{title}</h3>
      {description && <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-current opacity-70">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
