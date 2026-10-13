"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AthletePoolInsight, PoolInsightHeight } from "@/lib/coach-pool-insights";

const heights: Array<{ id: PoolInsightHeight; label: string }> = [
  { id: "ONE_METER", label: "1 m" }, { id: "THREE_METER", label: "3 m" }, { id: "PLATFORM", label: "Plateforme" }, { id: "CUSTOM", label: "Autre" }
];

export function PoolAthleteInsightPanel({ insight }: { insight?: AthletePoolInsight }) {
  const [height, setHeight] = useState<PoolInsightHeight>("ONE_METER");
  const families = insight?.families ?? [];
  const familyMax = Math.max(1, ...families.map((item) => item.volume));
  const profileDives = insight?.competitionDives ?? [];
  const availableHeights = heights.filter((item) => profileDives.some((dive) => dive.height === item.id));
  const activeHeight = availableHeights.some((item) => item.id === height) ? height : availableHeights[0]?.id;
  const dives = activeHeight ? profileDives.filter((dive) => dive.height === activeHeight) : [];
  const maxVolume = Math.max(0, ...dives.map((dive) => dive.volume));
  const average = dives.filter((dive) => dive.averageRating !== null);
  const ratingCount = average.reduce((sum, dive) => sum + dive.ratingCount, 0);
  const averageRating = ratingCount ? average.reduce((sum, dive) => sum + (dive.averageRating ?? 0) * dive.ratingCount, 0) / ratingCount : null;

  return <Card className="xl:sticky xl:top-4">
    <CardHeader className="pb-3"><p className="text-xs font-black uppercase tracking-wide text-[var(--color-brand-strong)]">Historique</p><CardTitle className="text-lg">Profil piscine</CardTitle></CardHeader>
    <CardContent className="space-y-5">
      <section aria-labelledby="family-volumes-title">
        <h3 id="family-volumes-title" className="mb-3 text-sm font-black">Volume par famille</h3>
        {families.length ? <div className="space-y-2.5">{families.map(({ family, volume }) => <div key={family}>
          <div className="mb-1 flex justify-between gap-2 text-xs"><span className="font-semibold">{family}</span><strong>{volume}</strong></div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[var(--color-brand)]" style={{ width: `${Math.max(4, volume / familyMax * 100)}%` }} /></div>
        </div>)}</div> : <p className="text-xs leading-5 text-[var(--color-ink-muted)]">Aucun volume réalisé enregistré.</p>}
      </section>

      <section aria-labelledby="competition-volume-title" className="border-t border-[var(--color-border)] pt-4">
        <div className="mb-2 flex items-center justify-between gap-2"><h3 id="competition-volume-title" className="text-sm font-black">Liste de compétition</h3>{averageRating !== null && <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-black text-amber-800">Moy. {averageRating.toFixed(1)} / 5</span>}</div>
        {availableHeights.length > 0 && <div className="mb-3 flex flex-wrap gap-1" role="tablist" aria-label="Épreuve de compétition">{availableHeights.map((item) => <button key={item.id} type="button" role="tab" aria-selected={activeHeight === item.id} onClick={() => setHeight(item.id)} className={`rounded-lg px-2 py-1.5 text-xs font-bold ${activeHeight === item.id ? "bg-[var(--color-brand)] text-white" : "bg-slate-100 text-slate-600"}`}>{item.label}</button>)}</div>}
        {availableHeights.length === 0 ? <p className="text-xs leading-5 text-[var(--color-ink-muted)]">Aucune liste de compétition au profil.</p> : dives.length ? <>
          <div className="max-h-64 space-y-1 overflow-y-auto pr-1">{dives.map((dive) => {
            const ratio = maxVolume ? dive.volume / maxVolume : 0;
            const tone = ratio <= 1 / 3 ? "border-red-200 bg-red-50 text-red-900" : ratio <= 2 / 3 ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900";
            return <div key={dive.id} className={`flex items-center justify-between rounded-lg border px-2.5 py-2 text-xs ${tone}`}><strong>{dive.code}</strong><span className="font-bold">{dive.volume} rép.</span>{dive.averageRating !== null && <span title="Moyenne des évaluations de l’athlète">{dive.averageRating.toFixed(1)} ★</span>}</div>;
          })}</div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-semibold text-[var(--color-ink-muted)]"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-red-500"/>Peu</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-400"/>Moyen</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500"/>Beaucoup</span></div>
        </> : <p className="text-xs leading-5 text-[var(--color-ink-muted)]">Aucun plongeon dans cette épreuve.</p>}
        {averageRating === null && dives.length > 0 && <p className="mt-2 text-[11px] text-[var(--color-ink-muted)]">Aucune évaluation de l’athlète pour cette épreuve.</p>}
      </section>
    </CardContent>
  </Card>;
}
