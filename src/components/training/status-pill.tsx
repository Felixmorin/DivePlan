import { CheckCircle2, CircleDashed, Clock3, PauseCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const statusMap = {
  READY: { label: "Publiée", icon: CheckCircle2, className: "bg-[var(--block-pool-bg)] text-[var(--block-pool-fg)]" },
  Pret: { label: "Publiée", icon: CheckCircle2, className: "bg-[var(--block-pool-bg)] text-[var(--block-pool-fg)]" },
  COMPLETED: { label: "Terminée", icon: CheckCircle2, className: "bg-[var(--color-success-soft)] text-[var(--color-success)]" },
  Complete: { label: "Terminée", icon: CheckCircle2, className: "bg-[var(--color-success-soft)] text-[var(--color-success)]" },
  DRAFT: { label: "Brouillon", icon: CircleDashed, className: "bg-[var(--block-dryland-bg)] text-[var(--block-dryland-fg)]" },
  Brouillon: { label: "Brouillon", icon: CircleDashed, className: "bg-[var(--block-dryland-bg)] text-[var(--block-dryland-fg)]" },
  NOT_DONE: { label: "Non faite", icon: XCircle, className: "bg-[var(--color-danger)]/10 text-[var(--color-danger)]" },
  PUBLISHED: { label: "Publie", icon: Clock3, className: "bg-[var(--block-pool-bg)] text-[var(--block-pool-fg)]" },
  Planifie: { label: "Planifie", icon: Clock3, className: "bg-[var(--block-pool-bg)] text-[var(--block-pool-fg)]" },
  IN_PROGRESS: { label: "En cours", icon: Clock3, className: "bg-[var(--color-action)] text-white" },
  Repos: { label: "Repos", icon: PauseCircle, className: "bg-[var(--block-custom-bg)] text-[var(--block-custom-fg)]" }
};

export function StatusPill({ status, className }: { status: string; className?: string }) {
  const meta = statusMap[status as keyof typeof statusMap] ?? { label: status, icon: Clock3, className: "bg-[var(--block-custom-bg)] text-[var(--block-custom-fg)]" };
  const Icon = meta.icon;

  return (
    <span className={cn("inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-black", meta.className, className)}>
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </span>
  );
}
