"use client";

import { ListChecks } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type CompetitionDiveItem = {
  id: string;
  height: "ONE_METER" | "THREE_METER" | "PLATFORM" | "CUSTOM";
  code: string;
  name: string;
  difficulty: number | null;
};

const heights = [
  { value: "ONE_METER", label: "1 m" },
  { value: "THREE_METER", label: "3 m" },
  { value: "PLATFORM", label: "Plateforme" }
] as const;

export function CompetitionList({ dives }: { dives: CompetitionDiveItem[] }) {
  const firstHeight = heights.find((height) => dives.some((dive) => dive.height === height.value))?.value ?? "ONE_METER";

  return (
    <Tabs defaultValue={firstHeight} className="w-full">
      <TabsList aria-label="Choisir une hauteur" className="grid w-full grid-cols-3 gap-2 bg-transparent p-0">
        {heights.map((height) => (
          <TabsTrigger
            key={height.value}
            value={height.value}
            className="h-11 rounded-full border border-cyan-200/15 bg-white/[0.04] px-2 text-sm text-white/55 shadow-none data-[state=active]:border-cyan-300/70 data-[state=active]:bg-cyan-300 data-[state=active]:text-[#06101d] data-[state=active]:shadow-[0_8px_24px_rgba(34,211,238,0.22)]"
          >
            {height.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {heights.map((height) => {
        const filtered = dives.filter((dive) => dive.height === height.value);

        return (
          <TabsContent key={height.value} value={height.value} className="mt-3 overflow-hidden rounded-2xl border border-cyan-200/15 bg-[#0b1e30] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">
            {filtered.length > 0 ? (
              <div className="divide-y divide-white/8">
                {filtered.map((dive, index) => (
                  <div key={dive.id} className="grid grid-cols-[3.75rem_2.25rem_1fr] items-center gap-2 px-4 py-3.5">
                    <span className="text-lg font-black tracking-tight text-white">{dive.code}</span>
                    <span className="text-sm font-semibold text-white/45">{dive.difficulty?.toFixed(1) ?? "—"}</span>
                    <span className="min-w-0 text-sm font-medium leading-5 text-white/65">{dive.name}</span>
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
