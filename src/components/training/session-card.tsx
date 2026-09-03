import Link from "next/link";
import type { ReactNode } from "react";
import { Clock3, Printer, Users, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { StatusPill } from "./status-pill";

type SessionCardProps = {
  title: string;
  focus?: string;
  href: string;
  printHref?: string;
  status: string;
  group?: string;
  duration?: number;
  volume?: number;
  athleteCount?: number;
  className?: string;
  actions?: ReactNode;
};

export function SessionCard({ title, focus, href, printHref, status, group, duration, volume, athleteCount, className, actions }: SessionCardProps) {
  return (
    <article className={cn("rounded-[var(--radius-ui)] border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-card)] transition duration-[var(--duration-fast)] hover:-translate-y-0.5 hover:border-[var(--color-brand)]", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <StatusPill status={status} />
          <Link href={href} className="mt-3 block text-lg font-black leading-tight text-[var(--color-ink)] hover:text-[var(--color-brand-strong)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">
            {title}
          </Link>
          {focus && <p className="mt-1 text-sm leading-6 text-[var(--color-ink-muted)]">{group ? `${group} - ` : ""}{focus}</p>}
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm"><Link href={href}>Ouvrir</Link></Button>
          {printHref && <Button asChild variant="outline" size="icon" className="h-9 min-h-9 w-9" aria-label="Imprimer"><Link href={printHref}><Printer className="h-4 w-4" /></Link></Button>}
          {actions}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-xs font-bold text-[var(--color-ink-muted)]">
        {typeof duration === "number" && <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> {duration} min</span>}
        {typeof volume === "number" && <span className="inline-flex items-center gap-1"><Waves className="h-3.5 w-3.5" /> {volume} vol.</span>}
        {typeof athleteCount === "number" && <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {athleteCount}</span>}
      </div>
    </article>
  );
}
