"use client";

import { useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { addAthleteDiveRepetitions, removeAthleteDiveFromVolume, updateAthleteDiveFamily } from "@/app/coach/athletes/actions";
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

const families = [["Avant", "Avant"], ["Arriere", "Arrière"], ["Renverse", "Renversé"], ["Retourne", "Retourné"], ["Vrille", "Vrille"], ["Equilibre", "Équilibre"]];

function heightGroup(dive: FamilyDive) {
  const label = (dive.heightLabel ?? "").toLowerCase().replace(/\s+/g, "").replace(",", ".");
  if (/^(3mt|5m|7\.5m|10m)$/.test(label)) return "PLATFORM";
  return dive.height;
}

export function AthleteFamilyDiveDetails({ dives, totals, athleteId }: { dives: FamilyDive[]; totals: FamilyTotal[]; athleteId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [selectedDive, setSelectedDive] = useState("new");
  const [height, setHeight] = useState("ONE_METER");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ error?: string; success?: boolean }>({});
  const max = Math.max(1, ...totals.map((family) => family.volume));

  return <>
    <div className="athlete-panel-title">
      <h2>Charge d’entraînement par famille de plongeon</h2>
      <button type="button" className="flex items-center gap-1 text-xs font-bold text-sky-700 hover:text-sky-900" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        {expanded ? "Masquer détails" : "Voir détails"} <ChevronDown size={14} className={expanded ? "rotate-180" : ""} />
      </button>
    </div>
    <div className="mt-3">
      <button type="button" aria-expanded={adding} className="rounded border border-slate-300 px-3 py-2 text-sm font-bold text-sky-700 hover:bg-slate-50" onClick={() => { setAdding(!adding); setMessage({}); }}>Ajouter des répétitions</button>
      {adding && <form className="mt-3 flex flex-wrap items-end gap-3" action={(formData) => {
        formData.set("athleteId", athleteId);
        if (selectedDive !== "new") {
          const dive = dives[Number(selectedDive)];
          if (!dive) return;
          formData.set("diveCode", dive.code);
          formData.set("diveName", dive.name);
          formData.set("family", dive.category);
          formData.set("height", dive.height);
          formData.set("heightLabel", dive.heightLabel ?? "");
        }
        setMessage({});
        startTransition(async () => {
          try {
            const result = await addAthleteDiveRepetitions(formData);
            setMessage(result);
            if (result.success) setSelectedDive("new");
          }
          catch { setMessage({ error: "L’ajout a échoué. Réessaie." }); }
        });
      }}>
        <label className="min-w-0 max-w-full text-sm font-bold">Plongeon<select value={selectedDive} onChange={(event) => { setSelectedDive(event.target.value); setMessage({}); }} disabled={pending} className="mt-1 block h-10 max-w-full rounded border border-slate-300 bg-white px-2 font-normal"><option value="new">Nouveau plongeon</option>{dives.map((dive, index) => <option key={index} value={index}>{dive.code} — {dive.name} ({dive.heightLabel ?? heightGroups.find((group) => group.key === dive.height)?.label}, {dive.category})</option>)}</select></label>
        {selectedDive === "new" && <>
          <label className="text-sm font-bold">Code<input name="diveCode" required maxLength={12} disabled={pending} className="mt-1 block h-10 w-28 rounded border border-slate-300 px-2 font-normal" /></label>
          <label className="min-w-0 max-w-full text-sm font-bold">Nom<input name="diveName" required maxLength={80} disabled={pending} className="mt-1 block h-10 w-full rounded border border-slate-300 px-2 font-normal" /></label>
          <label className="text-sm font-bold">Famille<select name="family" disabled={pending} className="mt-1 block h-10 rounded border border-slate-300 bg-white px-2 font-normal">{families.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="text-sm font-bold">Hauteur<select name="height" value={height} onChange={(event) => setHeight(event.target.value)} disabled={pending} className="mt-1 block h-10 rounded border border-slate-300 bg-white px-2 font-normal">{heightGroups.map((group) => <option key={group.key} value={group.key}>{group.label}</option>)}</select></label>
          {height === "PLATFORM" && <label className="text-sm font-bold">Plateforme<select name="heightLabel" disabled={pending} className="mt-1 block h-10 rounded border border-slate-300 bg-white px-2 font-normal">{["3mt", "5m", "7.5m", "10m"].map((value) => <option key={value} value={value}>{value === "3mt" ? "3 m (tour)" : value.replace("m", " m")}</option>)}</select></label>}
          {height === "CUSTOM" && <label className="text-sm font-bold">Précision de hauteur<input name="heightLabel" required maxLength={80} disabled={pending} className="mt-1 block h-10 w-40 rounded border border-slate-300 px-2 font-normal" /></label>}
        </>}
        <label className="text-sm font-bold">Répétitions à ajouter<input name="repetitions" type="number" min="1" max="100000" step="1" required disabled={pending} className="mt-1 block h-10 w-40 rounded border border-slate-300 px-2 font-normal" /></label>
        <button type="submit" disabled={pending} className="h-10 rounded bg-slate-900 px-3 text-sm font-bold text-white disabled:opacity-50">{pending ? "Ajout…" : "Ajouter"}</button>
        <p className="w-full text-xs text-slate-600">Ajout libre au volume à la date du jour, sans séance associée.</p>
      </form>}
      {message.error && <p role="alert" className="mt-2 text-sm text-red-700">{message.error}</p>}
      {message.success && <p role="status" className="mt-2 text-sm text-green-700">Répétitions ajoutées.</p>}
    </div>
    {dives.length === 0 && <p className="athlete-empty">Aucune donnée de volume par famille. Ajoute un premier plongeon.</p>}
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
                {heightDives.map((dive) => <li key={JSON.stringify([dive.height, dive.code, dive.heightLabel, dive.name])} className="group relative flex min-w-0 items-center justify-start gap-2 py-1.5 pr-6 text-[10px] leading-tight">
                  <span className="min-w-0 truncate"><strong>{dive.code}</strong>{dive.name && dive.name !== dive.code && <span className="ml-1 text-slate-600">{dive.name}</span>}{(heightGroup(dive) === "PLATFORM" || heightGroup(dive) === "CUSTOM") && dive.heightLabel && <small className="ml-1 text-slate-500">({dive.heightLabel})</small>}</span>
                  <b className="shrink-0 whitespace-nowrap text-slate-700">{dive.volume} rép.</b>
                  <details className="absolute right-0 top-0.5 z-10">
                    <summary aria-label={`Modifier ${dive.code}`} title="Modifier ce plongeon" className="flex h-5 w-5 cursor-pointer list-none items-center justify-center rounded text-sm font-black text-slate-400 opacity-0 hover:bg-slate-100 hover:text-slate-800 focus:opacity-100 group-hover:opacity-100">···</summary>
                    <div className="absolute right-0 top-6 w-56 space-y-2 rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-xl" onClick={(event) => event.stopPropagation()}>
                      <form action={updateAthleteDiveFamily} className="space-y-2">
                        <input type="hidden" name="originalName" value={dive.name} /><input type="hidden" name="originalFamily" value={dive.category} />
                        <input type="hidden" name="athleteId" value={athleteId} /><input type="hidden" name="diveCode" value={dive.code} /><input type="hidden" name="height" value={dive.height} /><input type="hidden" name="heightLabel" value={dive.heightLabel ?? ""} />
                        <label className="block font-bold">Nom<input name="diveName" required maxLength={80} defaultValue={dive.name} className="mt-1 h-8 w-full rounded border px-2 font-normal" /></label>
                        <label className="block font-bold">Famille<select name="family" defaultValue={dive.category} className="mt-1 h-8 w-full rounded border bg-white px-2 font-normal">{families.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                        <label className="block font-bold">Répétitions totales<input name="repetitions" type="number" min="0" max="100000" required defaultValue={dive.volume} className="mt-1 h-8 w-full rounded border px-2 font-normal" /></label>
                        <button type="submit" className="w-full rounded bg-slate-900 px-3 py-2 font-bold text-white">Enregistrer</button>
                      </form>
                      <form action={removeAthleteDiveFromVolume} onSubmit={(event) => { if (!window.confirm(`Supprimer le plongeon ${dive.code} et son historique de répétitions pour cet athlète ?`)) event.preventDefault(); }}>
                        <input type="hidden" name="originalName" value={dive.name} /><input type="hidden" name="originalFamily" value={dive.category} />
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
