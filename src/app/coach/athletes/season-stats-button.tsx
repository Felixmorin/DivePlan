"use client";

import { useState } from "react";
import { Activity, CalendarCheck2, ChartColumnIncreasing, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type GroupStat = { name: string; athletes: number };

export function SeasonStatsButton({ season, groups, volume, completedSessions }: {
  season: string;
  groups: GroupStat[];
  volume: number;
  completedSessions: number;
}) {
  const [open, setOpen] = useState(false);

  return <>
    <Button type="button" variant="action" onClick={() => setOpen(true)}><ChartColumnIncreasing className="h-4 w-4" /> Statistiques de la saison</Button>
    {open && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="season-stats-title" className="w-full max-w-xl rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-wide text-[var(--color-brand-strong)]">Statistiques de saison</p><h2 id="season-stats-title" className="mt-1 text-2xl font-black">{season}</h2></div><button type="button" onClick={() => setOpen(false)} aria-label="Fermer" className="rounded-lg p-2 text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-raised)]"><X className="h-5 w-5" /></button></div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-[var(--color-surface-raised)] p-4"><div className="flex items-center gap-2 text-xs font-bold text-[var(--color-ink-muted)]"><Activity className="h-4 w-4" /> Volume total</div><p className="mt-2 text-2xl font-black">{volume.toLocaleString("fr-CA")}</p><p className="text-xs text-[var(--color-ink-muted)]">répétitions enregistrées</p></div>
          <div className="rounded-xl bg-[var(--color-surface-raised)] p-4"><div className="flex items-center gap-2 text-xs font-bold text-[var(--color-ink-muted)]"><CalendarCheck2 className="h-4 w-4" /> Séances complétées</div><p className="mt-2 text-2xl font-black">{completedSessions.toLocaleString("fr-CA")}</p><p className="text-xs text-[var(--color-ink-muted)]">pour tous les groupes</p></div>
        </div>
        <div className="mt-5"><h3 className="flex items-center gap-2 text-sm font-black"><Users className="h-4 w-4 text-[var(--color-brand-strong)]" /> Athlètes par groupe</h3>
          {groups.length ? <ul className="mt-2 divide-y divide-[var(--color-border)] rounded-xl border border-[var(--color-border)]">{groups.map((group) => <li key={group.name} className="flex items-center justify-between px-3 py-2.5 text-sm"><span>{group.name}</span><strong>{group.athletes}</strong></li>)}</ul> : <p className="mt-2 rounded-xl border border-[var(--color-border)] p-3 text-sm text-[var(--color-ink-muted)]">Aucun groupe configuré.</p>}
        </div>
      </section>
    </div>}
  </>;
}
