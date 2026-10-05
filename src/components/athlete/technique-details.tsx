"use client";

import { useState } from "react";
import { Activity, ChevronDown, Goal, MoreHorizontal, Waves } from "lucide-react";

type TechniqueItem = {
  label: string;
  color: string;
  icon: "waves" | "activity" | "goal";
  dives: number;
};

type SkillDive = {
  category: string;
  code: string;
  name?: string;
  height: "ONE_METER" | "THREE_METER" | "PLATFORM" | "CUSTOM";
  heightLabel?: string | null;
  volume: number;
};

export function TechniqueDetails({ technique, skillDives, athleteId, updateFamilyAction, removeDiveAction, splitByHeight = false }: {
  technique: TechniqueItem[];
  skillDives: SkillDive[];
  athleteId?: string;
  updateFamilyAction?: (formData: FormData) => void | Promise<void>;
  removeDiveAction?: (formData: FormData) => void | Promise<void>;
  splitByHeight?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleTechnique = technique.filter((item) => item.dives > 0);
  const divesByCategory = new Map<string, SkillDive[]>();

  for (const dive of skillDives) {
    if (dive.volume <= 0) continue;
    divesByCategory.set(dive.category, [...(divesByCategory.get(dive.category) ?? []), dive]);
  }

  const iconMap = { waves: Waves, activity: Activity, goal: Goal };

  return (
    <>
      <div className="section-heading">
        <span className="section-icon cyan"><Goal size={22} /></span>
        <h2>Volume par famille</h2>
        <button className="details-toggle" type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
          {expanded ? "Masquer détails" : "Voir détails"} <ChevronDown className={expanded ? "rotated" : ""} size={17} />
        </button>
      </div>
      <div className="technique-list" id="technique">
        {visibleTechnique.length > 0 ? visibleTechnique.map(({ label, dives: techniqueDives, color, icon }) => {
          const Icon = iconMap[icon];
          return <div className="technique-group" key={label}>
            <div className="technique-row"><Icon size={22} style={{ color }} /><span>{label}</span><div className="technique-track"><i style={{ width: `${Math.round((techniqueDives / Math.max(...visibleTechnique.map((item) => item.dives), 1)) * 100)}%`, background: color }} /></div><b>{techniqueDives}</b></div>
            {expanded && (() => {
              const familyDives = divesByCategory.get(label) ?? [];
              const heights: SkillDive["height"][] = ["ONE_METER", "THREE_METER", "PLATFORM", "CUSTOM"];
              const columns = splitByHeight ? heights.map((height) => ({ height, dives: familyDives.filter((dive) => displayHeight(dive) === height) })) : [{ height: null, dives: familyDives }];
              return <div className={splitByHeight ? "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" : "technique-dives"} aria-label={`Plongeons de la catégorie ${label}`}>
                {familyDives.length > 0 ? columns.map(({ height, dives }) => <div key={height ?? "all"} className={splitByHeight ? "min-w-0 rounded-xl border border-[var(--color-border)] bg-white/70 p-3" : "contents"}>
                  {height && <h4 className="mb-2 text-xs font-black uppercase tracking-wide text-[var(--color-ink-muted)]">{heightLabel(height)}</h4>}
                  {dives.length ? dives.map((dive) => <DiveVolumeRow key={`${dive.height}-${dive.category}-${dive.code}`} dive={dive} athleteId={athleteId} updateFamilyAction={updateFamilyAction} removeDiveAction={removeDiveAction} />) : splitByHeight && <p className="text-xs text-[var(--color-ink-muted)]">Aucun plongeon</p>}
                </div>) : <p className="text-sm text-[var(--color-ink-muted)]">Aucun plongeon enregistré</p>}
              </div>;
            })()}
          </div>;
        }) : <p className="text-sm text-[var(--color-ink-muted)]">Aucun volume enregistré par famille.</p>}
      </div>
    </>
  );
}

function DiveVolumeRow({ dive, athleteId, updateFamilyAction, removeDiveAction }: {
  dive: SkillDive;
  athleteId?: string;
  updateFamilyAction?: (formData: FormData) => void | Promise<void>;
  removeDiveAction?: (formData: FormData) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const families = ["Avant", "Arriere", "Renverse", "Retourne", "Vrille", "Equilibre"];
  return <div className="technique-dive">
    <span><strong>{dive.code}</strong>{dive.heightLabel && <small className="ml-1 text-xs font-semibold text-[var(--color-ink-muted)]">({dive.heightLabel})</small>}{!athleteId && <small> · {heightLabel(dive.height)}</small>}</span><b>{dive.volume}</b>
    {athleteId && (updateFamilyAction || removeDiveAction) && <details className="relative ml-auto">
      <summary className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg text-[var(--color-ink-muted)] hover:bg-[var(--color-coach-bg)]" aria-label={`Options du plongeon ${dive.code}`}><MoreHorizontal size={19} /></summary>
      <div className="absolute right-0 top-9 z-20 w-36 rounded-xl border border-[var(--color-border)] bg-white p-1 shadow-xl">
        {updateFamilyAction && <button type="button" onClick={() => setEditing(true)} className="w-full rounded-lg px-3 py-2 text-left text-sm font-bold hover:bg-[var(--color-coach-bg)]">Modifier</button>}
        {removeDiveAction && <form action={removeDiveAction} onSubmit={(event) => { if (!window.confirm(`Supprimer le plongeon ${dive.code} et son volume enregistré pour cet athlète ?`)) event.preventDefault(); }}>
          <input type="hidden" name="athleteId" value={athleteId} /><input type="hidden" name="diveCode" value={dive.code} /><input type="hidden" name="height" value={dive.height} />
          <button type="submit" className="w-full rounded-lg px-3 py-2 text-left text-sm font-bold text-[var(--color-danger)] hover:bg-red-50">Supprimer</button>
        </form>}
      </div>
    </details>}
    {editing && athleteId && updateFamilyAction && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby={`edit-dive-title-${athleteId}-${dive.height}-${dive.code}`} className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-2xl">
        <h3 id={`edit-dive-title-${athleteId}-${dive.height}-${dive.code}`} className="text-lg font-black">Modifier le plongeon {dive.code}</h3>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">Choisissez sa famille.</p>
        <form action={updateFamilyAction} className="mt-5 space-y-4">
          <input type="hidden" name="athleteId" value={athleteId} /><input type="hidden" name="diveCode" value={dive.code} /><input type="hidden" name="height" value={dive.height} />
          <div><label className="mb-1 block text-sm font-bold" htmlFor={`edit-name-${athleteId}-${dive.height}-${dive.code}`}>Nom du plongeon</label><input id={`edit-name-${athleteId}-${dive.height}-${dive.code}`} name="diveName" type="text" required maxLength={80} defaultValue={dive.name ?? ""} className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-semibold" /></div>
          <label className="block text-sm font-bold" htmlFor={`edit-family-${athleteId}-${dive.height}-${dive.code}`}>Famille</label>
          <select id={`edit-family-${athleteId}-${dive.height}-${dive.code}`} name="family" defaultValue={dive.category} className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-semibold">{families.map((family) => <option key={family} value={family}>{family}</option>)}</select>
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setEditing(false)} className="rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-bold">Annuler</button><button type="submit" className="rounded-xl bg-[var(--color-brand)] px-4 py-2 text-sm font-black text-white">Enregistrer</button></div>
        </form>
      </section>
    </div>}
  </div>;
}

function heightLabel(height: SkillDive["height"]) {
  return height === "ONE_METER" ? "1 m" : height === "THREE_METER" ? "3 m" : height === "PLATFORM" ? "Plateforme" : "Autre";
}

function displayHeight(dive: SkillDive): SkillDive["height"] {
  if (/^(3mt|3m|5m|7[,.]5m|10m)$/.test((dive.heightLabel ?? "").toLowerCase().replace(/\s+/g, ""))) {
    return "PLATFORM";
  }
  return dive.height;
}

