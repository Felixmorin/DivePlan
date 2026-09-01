import { Activity, Dumbbell, Sparkles, Waves } from "lucide-react";
import { cn } from "@/lib/utils";

type BlockType = "WARMUP" | "DRYLAND" | "POOL" | "COOLDOWN" | "CUSTOM" | "warmup" | "dryland" | "pool" | "cooldown" | "custom";

const blockMeta = {
  warmup: { label: "Echauffement", icon: Activity, className: "bg-[var(--block-warmup-bg)] text-[var(--block-warmup-fg)]" },
  dryland: { label: "Dryland", icon: Dumbbell, className: "bg-[var(--block-dryland-bg)] text-[var(--block-dryland-fg)]" },
  pool: { label: "Piscine", icon: Waves, className: "bg-[var(--block-pool-bg)] text-[var(--block-pool-fg)]" },
  cooldown: { label: "Retour au calme", icon: Activity, className: "bg-[var(--block-cooldown-bg)] text-[var(--block-cooldown-fg)]" },
  custom: { label: "Bloc", icon: Sparkles, className: "bg-[var(--block-custom-bg)] text-[var(--block-custom-fg)]" }
};

export function BlockTypeBadge({ type, className }: { type: BlockType | string; className?: string }) {
  const key = type.toLowerCase() as keyof typeof blockMeta;
  const meta = blockMeta[key] ?? blockMeta.custom;
  const Icon = meta.icon;

  return (
    <span className={cn("inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-black", meta.className, className)}>
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </span>
  );
}
