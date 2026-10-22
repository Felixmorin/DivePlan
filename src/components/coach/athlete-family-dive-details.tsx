"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { removeAthleteDiveFromVolume, updateAthleteDiveFamily } from "@/app/coach/athletes/actions";
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

export function AthleteFamilyDiveDetails({ dives, totals, athleteId }: { dives: FamilyDive[]; totals: FamilyTotal[]; athleteId: string }) {
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
          {expanded && familyDives.length > 0 && <div className="mt-2 grid grid-cols-4 gap-1 border-b border-slate-100 pb-3">
          {heightGroups.map(({ key, label }) => {
            const heightDives = familyDives.filter((dive) => heightGroup(dive) === key);
            if (!heightDives.length) return null;
            return <section key={key} className="min-w-0 rounded-lg border border-slate-100 bg-slate-50 p-2">
              <h3 className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-slate-600">{label}</h3>
              <ul className="divide-y divide-slate-100 rounded-md bg-white px-2">
                {heightDives.map((dive) => <li key={`${dive.height}-${dive.code}-${dive.heightLabel ?? ""}`} className="group relative flex min-w-0 items-center justify-start gap-2 py-1.5 pr-6 text-[10px] leading-tight">
                  <span className="min-w-0 truncate"><strong>{dive.code}</strong>{dive.name && dive.name !== dive.code && <span className="ml-1 text-slate-600">{dive.name}</span>}{(heightGroup(dive) === "PLATFORM" || heightGroup(dive) === "CUSTOM") && dive.heightLabel && <small className="ml-1 text-slate-500">({dive.heightLabel})</small>}</span>
                  <b className="shrink-0 whitespace-nowrap text-slate-700">{dive.volume} rép.</b>
                  <details className="absolute right-0 top-0.5 z-10">
                    <summary aria-label={`Modifier ${dive.code}`} title="Modifier ce plongeon" className="flex h-5 w-5 cursor-pointer list-none items-center justify-center rounded text-sm font-black text-slate-400 opacity-0 hover:bg-slate-100 hover:text-slate-800 focus:opacity-100 group-hover:opacity-100">···</summary>
                    <div className="absolute right-0 top-6 w-56 space-y-2 rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-xl" onClick={(event) => event.stopPropagation()}>
                      <form action={updateAthleteDiveFamily} className="space-y-2">
                        <input type="hidden" name="athleteId" value={athleteId} /><input type="hidden" name="diveCode" value={dive.code} /><input type="hidden" name="height" value={dive.height} /><input type="hidden" name="heightLabel" value={dive.heightLabel ?? ""} />
                        <label className="block font-bold">Nom<input name="diveName" required maxLength={80} defaultValue={dive.name} className="mt-1 h-8 w-full rounded border px-2 font-normal" /></label>
                        <label className="block font-bold">Famille<select name="family" defaultValue={dive.category} className="mt-1 h-8 w-full rounded border bg-white px-2 font-normal">{[["Avant","Avant"],["Arriere","Arrière"],["Renverse","Renversé"],["Retourne","Retourné"],["Vrille","Vrille"],["Equilibre","Équilibre"]].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                        <label className="block font-bold">Répétitions totales<input name="repetitions" type="number" min="0" max="100000" required defaultValue={dive.volume} className="mt-1 h-8 w-full rounded border px-2 font-normal" /></label>
                        <button type="submit" className="w-full rounded bg-slate-900 px-3 py-2 font-bold text-white">Enregistrer</button>
                      </form>
                      <form action={removeAthleteDiveFromVolume} onSubmit={(event) => { if (!window.confirm(`Supprimer le plongeon ${dive.code} et son historique de répétitions pour cet athlète ?`)) event.preventDefault(); }}>
                        <input type="hidden" name="athleteId" value={athleteId} /><input type="hidden" name="diveCode" value={dive.code} /><input type="hidden" name="height" value={dive.height} /><input type="hidden" name="heightLabel" value={dive.heightLabel ?? ""} />
                        <button type="submit" className="w-full rounded border border-red-200 px-3 py-2 font-bold text-red-700 hover:bg-red-50">Supprimer le plongeon</button>
                      </form>
                    </div>
                  </details>
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
