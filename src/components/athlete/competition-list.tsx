"use client";

import { BarChart3, ListChecks } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CompetitionConfidenceChart, type CompetitionConfidencePoint } from "@/components/athlete/competition-confidence-chart";

export type CompetitionDiveItem = {
  id: string;
  height: "ONE_METER" | "THREE_METER" | "PLATFORM" | "CUSTOM";
  code: string;
  difficulty: number | null;
  volume: number;
  latestConfidence?: number | null;
  confidenceHistory?: CompetitionConfidencePoint[];
};

const heights = [
  { value: "ONE_METER", label: "1 m" },
  { value: "THREE_METER", label: "3 m" },
  { value: "PLATFORM", label: "Plateforme" },
  { value: "CUSTOM", label: "Autre" }
] as const;

export function CompetitionList({ dives }: { dives: CompetitionDiveItem[] }) {
  const availableHeights = heights.filter(
    (height) => dives.some((dive) => dive.height === height.value)
  );
  const firstHeight = availableHeights.find((height) => dives.some((dive) => dive.height === height.value))?.value ?? "ONE_METER";

  return (
    <Tabs defaultValue={firstHeight} className="w-full">
      <TabsList aria-label="Choisir une hauteur" className={`grid w-full ${availableHeights.length === 2 ? "grid-cols-2" : "grid-cols-3"} gap-2 bg-transparent p-0`}>
        {availableHeights.map((height) => (
          <TabsTrigger
            key={height.value}
            value={height.value}
            className="h-11 rounded-full border border-cyan-200/15 bg-white/[0.04] px-2 text-sm text-white/55 shadow-none data-[state=active]:border-cyan-300/70 data-[state=active]:bg-cyan-300 data-[state=active]:text-[#06101d] data-[state=active]:shadow-[0_8px_24px_rgba(34,211,238,0.22)]"
          >
            {height.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {availableHeights.map((height) => {
        const filtered = dives.filter((dive) => dive.height === height.value);

        return (
          <TabsContent key={height.value} value={height.value} className="mt-3 overflow-hidden rounded-2xl border border-cyan-200/15 bg-[#0b1e30] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">
            {filtered.length > 0 ? (
              <div className="divide-y divide-white/8">
                {filtered.map((dive, index) => (
                  <div key={dive.id}>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3 px-4 py-3.5">
                      <span className="text-lg font-black tracking-tight text-white">{dive.code}</span>
                      <span className="text-sm font-semibold text-white/45">{dive.difficulty?.toFixed(1) ?? "—"}</span>
                      <span className="min-w-[3.5rem] text-right" aria-label={`${dive.volume} répétitions effectuées`}>
                        <strong className="block text-base font-black leading-none text-cyan-200">{dive.volume}</strong>
                        <span className="mt-1 block text-[11px] font-bold text-white/40">effectués</span>
                      </span>
                      <span className="min-w-9 text-center text-sm font-black text-amber-200" aria-label={dive.latestConfidence ? `Dernière confiance : ${dive.latestConfidence} sur 5` : "Aucune évaluation de confiance"}>{dive.latestConfidence ?? "—"}<span className="block text-[10px] font-bold text-white/40">confiance</span></span>
                    </div>
                    {dive.confidenceHistory && dive.confidenceHistory.length > 0 && <details className="border-t border-white/8 px-4 py-2">
                      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-xs font-bold text-cyan-200/75 marker:hidden"><BarChart3 className="h-4 w-4" /> Voir l’évolution de confiance</summary>
                      <div className="pt-2"><CompetitionConfidenceChart data={dive.confidenceHistory} initialDiveId={dive.id} athleteView /></div>
                    </details>}
                    <span className="sr-only">Plongeon {index + 1}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex min-h-32 flex-col items-center justify-center px-5 py-7 text-center">
                <ListChecks className="h-7 w-7 text-cyan-300/70" />
                <p className="mt-3 font-bold text-white">Liste à venir</p>
                <p className="mt-1 text-sm leading-5 text-white/45">Ton coach n’a pas encore ajouté de plongeon à cette hauteur.</p>
              </div>
            )}
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
