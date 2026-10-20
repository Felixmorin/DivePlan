"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { AthleteProgressTotals } from "@/lib/athlete-session";

type FamilyDive = AthleteProgressTotals["skillDives"][number];

const heights: Record<FamilyDive["height"], string> = {
  ONE_METER: "1 m",
  THREE_METER: "3 m",
  PLATFORM: "Plateforme",
  CUSTOM: "Autre"
};

export function AthleteFamilyDiveDetails({ dives }: { dives: FamilyDive[] }) {
  const [expandedFamily, setExpandedFamily] = useState<string | null>(null);
  const families = ["Avant", "Arriere", "Renverse", "Retourne", "Vrille", "Equilibre"];

  return <div className="mt-3 space-y-2">
    {families.map((family) => {
      const familyDives = dives.filter((dive) => dive.category === family && dive.volume > 0);
      if (!familyDives.length) return null;
      const expanded = expandedFamily === family;
      return <div key={family} className="border-t border-slate-100 pt-2">
        <button type="button" className="flex items-center gap-1 text-xs font-bold text-sky-700 hover:text-sky-900" aria-expanded={expanded} onClick={() => setExpandedFamily(expanded ? null : family)}>
          {expanded ? "Masquer détail" : "Voir détail"} · {family} <ChevronDown size={14} className={expanded ? "rotate-180" : ""} />
        </button>
        {expanded && <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {familyDives.map((dive) => <li key={`${dive.height}-${dive.code}-${dive.heightLabel ?? ""}`} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
            <span className="min-w-0"><strong>{dive.code}</strong><span className="ml-2 text-slate-600">{dive.name}</span><small className="ml-2 text-slate-500">{dive.heightLabel || heights[dive.height]}</small></span>
            <b className="ml-3 shrink-0 text-slate-700">{dive.volume}</b>
          </li>)}
        </ul>}
      </div>;
    })}
  </div>;
}
