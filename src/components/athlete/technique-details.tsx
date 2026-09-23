"use client";

import { useState } from "react";
import { Activity, ChevronDown, Goal, Waves } from "lucide-react";

type TechniqueItem = {
  label: string;
  color: string;
  icon: "waves" | "activity" | "goal";
  dives: number;
};

type SkillDive = {
  category: string;
  code: string;
  name: string;
  height: "ONE_METER" | "THREE_METER" | "PLATFORM" | "CUSTOM";
  volume: number;
};

export function TechniqueDetails({ technique, skillDives, athleteId, updateFamilyAction }: {
  technique: TechniqueItem[];
  skillDives: SkillDive[];
  athleteId?: string;
  updateFamilyAction?: (formData: FormData) => void | Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const divesByCategory = new Map<string, SkillDive[]>();

  for (const dive of skillDives) {
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
        {technique.map(({ label, dives: techniqueDives, color, icon }) => {
          const Icon = iconMap[icon];
          return <div className="technique-group" key={label}>
            <div className="technique-row"><Icon size={22} style={{ color }} /><span>{label}</span><div className="technique-track"><i style={{ width: `${Math.round((techniqueDives / Math.max(...technique.map((item) => item.dives), 1)) * 100)}%`, background: color }} /></div><b>{techniqueDives}</b></div>
            {expanded && (
              <div className="technique-dives" aria-label={`Plongeons de la catégorie ${label}`}>
                {(divesByCategory.get(label) ?? []).length > 0 ? (divesByCategory.get(label) ?? []).map((dive) => <div className="technique-dive" key={`${dive.height}-${dive.category}-${dive.code}`}><span><strong>{dive.code}</strong> {dive.name} <small>· {heightLabel(dive.height)}</small></span><b>{dive.volume}</b>{athleteId && updateFamilyAction && <form action={updateFamilyAction} className="flex items-center gap-2"><input type="hidden" name="athleteId" value={athleteId} /><input type="hidden" name="diveCode" value={dive.code} /><input type="hidden" name="height" value={dive.height} /><label className="sr-only" htmlFor={`family-${athleteId}-${dive.height}-${dive.code}`}>Famille du plongeon {dive.code}</label><select id={`family-${athleteId}-${dive.height}-${dive.code}`} name="family" defaultValue={dive.category} className="rounded-lg border border-[var(--color-border)] bg-white px-2 py-1 text-xs font-bold">{["Avant", "Arriere", "Renverse", "Retourne", "Vrille", "Equilibre"].map((family) => <option key={family} value={family}>{family}</option>)}</select><button type="submit" className="rounded-lg bg-[var(--color-brand)] px-2 py-1 text-xs font-black text-white">Corriger</button></form>}</div>) : <p>Aucun plongeon enregistré</p>}
              </div>
            )}
          </div>;
        })}
      </div>
    </>
  );
}

function heightLabel(height: SkillDive["height"]) {
  return height === "ONE_METER" ? "1 m" : height === "THREE_METER" ? "3 m" : height === "PLATFORM" ? "Tremplin" : "Autre";
}
