import { cn } from "@/lib/utils";

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-[var(--color-border)]", className)}>
      <div className="h-full rounded-full bg-[var(--color-success)] transition-all duration-[var(--duration-fast)]" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
