"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { AthleteProgressTotals } from "@/lib/athlete-session";

type FamilyDive = AthleteProgressTotals["skillDives"][number];
type FamilyTotal = AthleteProgressTotals["skillData"][number];

const familyColors: Record<string, string> = {
  Avant: "#08c9c7",
  Arriere: "#ff655c",
  Renverse: "#36a0ff",
  Retourne: "#9147ed",
  Vrille: "#08a9c5",
  Equilibre: "#edb52b"
};

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

export function AthleteFamilyDiveDetails({ dives, totals }: { dives: FamilyDive[]; totals: FamilyTotal[] }) {
  const [expanded, setExpanded] = useState(false);
  const max = Math.max(1, ...totals.map((family) => family.volume));

  return <>
    <div className="athlete-panel-title">
      <h2>Charge d’entraînement par famille de plongeon</h2>
      <button type="button" className="flex items-center gap-1 text-xs font-bold text-sky-700 hover:text-sky-900" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        {expanded ? "Masquer détails" : "Voir détails"} <ChevronDown size={14} className={expanded ? "rotate-180" : ""} />
      </button>
    </div>
    <div className="mt-2 space-y-2">
      {totals.map((item) => {
        const family = item.name;
        const familyDives = dives.filter((dive) => dive.category === family && dive.volume > 0);
        return <div key={family}>
          <div className="athlete-family-row"><span>{family}</span><i><b style={{ width: `${Math.max(2, item.volume / max * 100)}%`, background: familyColors[family] ?? "#94a3b8" }} /></i><strong>{item.volume}</strong></div>
          {expanded && familyDives.length > 0 && <div className="mt-2 grid gap-3 border-b border-slate-100 pb-3 sm:grid-cols-2">
          {heightGroups.map(({ key, label }) => {
            const heightDives = familyDives.filter((dive) => heightGroup(dive) === key);
            if (!heightDives.length) return null;
            return <section key={key} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-600">{label}</h3>
              <ul className="space-y-1.5">
                {heightDives.map((dive) => <li key={`${dive.height}-${dive.code}-${dive.heightLabel ?? ""}`} className="flex items-center justify-between rounded-md bg-white px-3 py-2 text-xs">
                  <span className="min-w-0"><strong>{dive.code}</strong>{dive.name && dive.name !== dive.code && <span className="ml-2 text-slate-600">{dive.name}</span>}{heightGroup(dive) === "PLATFORM" && dive.heightLabel && <small className="ml-2 text-slate-500">{dive.heightLabel}</small>}</span>
                  <b className="ml-3 shrink-0 text-slate-700">{dive.volume} rép.</b>
                </li>)}
              </ul>
            </section>;
          })}
          </div>}
        </div>;
      })}
    </div>
  </>;
}
