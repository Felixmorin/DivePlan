"use client";

import { useState } from "react";
import { Activity, ChevronDown, Goal, Trash2, Waves } from "lucide-react";

type TechniqueItem = {
  label: string;
  color: string;
  icon: "waves" | "activity" | "goal";
  dives: number;
};

type SkillDive = {
  category: string;
  code: string;
  height: "ONE_METER" | "THREE_METER" | "PLATFORM" | "CUSTOM";
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
              const columns = splitByHeight ? heights.map((height) => ({ height, dives: familyDives.filter((dive) => dive.height === height) })) : [{ height: null, dives: familyDives }];
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
  return <div className="technique-dive"><span><strong>{dive.code}</strong>{!athleteId && <small> · {heightLabel(dive.height)}</small>}</span><b>{dive.volume}</b>{athleteId && updateFamilyAction && <form action={updateFamilyAction} className="flex items-center gap-2"><input type="hidden" name="athleteId" value={athleteId} /><input type="hidden" name="diveCode" value={dive.code} /><input type="hidden" name="height" value={dive.height} /><label className="sr-only" htmlFor={`family-${athleteId}-${dive.height}-${dive.code}`}>Famille du plongeon {dive.code}</label><select id={`family-${athleteId}-${dive.height}-${dive.code}`} name="family" defaultValue={dive.category} className="rounded-lg border border-[var(--color-border)] bg-white px-2 py-1 text-xs font-bold">{["Avant", "Arriere", "Renverse", "Retourne", "Vrille", "Equilibre"].map((family) => <option key={family} value={family}>{family}</option>)}</select><button type="submit" className="rounded-lg bg-[var(--color-brand)] px-2 py-1 text-xs font-black text-white">Corriger</button></form>}{athleteId && removeDiveAction && <form action={removeDiveAction} onSubmit={(event) => { if (!window.confirm(`Supprimer le plongeon ${dive.code} et son volume enregistré pour cet athlète ?`)) event.preventDefault(); }}><input type="hidden" name="athleteId" value={athleteId} /><input type="hidden" name="diveCode" value={dive.code} /><input type="hidden" name="height" value={dive.height} /><button type="submit" className="rounded-lg p-2 text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]" aria-label={`Supprimer le plongeon ${dive.code} de ${heightLabel(dive.height)}`} title="Supprimer ce plongeon et son volume"><Trash2 size={16} /></button></form>}</div>;
}

function heightLabel(height: SkillDive["height"]) {
  return height === "ONE_METER" ? "1 m" : height === "THREE_METER" ? "3 m" : height === "PLATFORM" ? "Plateforme" : "Autre";
}

