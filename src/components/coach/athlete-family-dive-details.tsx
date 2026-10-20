"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { AthleteProgressTotals } from "@/lib/athlete-session";

type FamilyDive = AthleteProgressTotals["skillDives"][number];

const heightGroups: Array<{ key: string; label: string }> = [
  { key: "ONE_METER", label: "1 m" },
  { key: "THREE_METER", label: "3 m" },
  { key: "PLATFORM", label: "Plateforme" },
  { key: "CUSTOM", label: "Autres" }
];

function heightGroup(dive: FamilyDive) {
  const label = (dive.heightLabel ?? "").toLowerCase().replace(/\s+/g, "").replace(",", ".");
  if (/^(3mt|5m|7\.5m|10m)$/.test(label)) return "PLATFORM";
  return dive.height;
}

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
        {expanded && <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {heightGroups.map(({ key, label }) => {
            const heightDives = familyDives.filter((dive) => heightGroup(dive) === key);
            if (!heightDives.length) return null;
            return <section key={key} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-600">{label}</h3>
              <ul className="space-y-1.5">
                {heightDives.map((dive) => <li key={`${dive.height}-${dive.code}-${dive.heightLabel ?? ""}`} className="flex items-center justify-between rounded-md bg-white px-3 py-2 text-xs">
                  <span className="min-w-0"><strong>{dive.code}</strong><span className="ml-2 text-slate-600">{dive.name}</span>{heightGroup(dive) === "PLATFORM" && dive.heightLabel && <small className="ml-2 text-slate-500">{dive.heightLabel}</small>}</span>
                  <b className="ml-3 shrink-0 text-slate-700">{dive.volume} rép.</b>
                </li>)}
              </ul>
            </section>;
          })}
        </div>}
      </div>;
    })}
  </div>;
}
