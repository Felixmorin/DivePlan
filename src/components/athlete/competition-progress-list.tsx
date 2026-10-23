"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Waves } from "lucide-react";
import type { CompetitionDiveItem } from "@/components/athlete/competition-list";

const heights = [
  { key: "ONE_METER", label: "1 m" },
  { key: "THREE_METER", label: "3 m" },
  { key: "PLATFORM", label: "Plateforme" },
  { key: "CUSTOM", label: "Autres" }
] as const;
const repetitionsTarget = 5;

export function CompetitionProgressList({ dives }: { dives: CompetitionDiveItem[] }) {
  const available = heights.filter(({ key }) => dives.some((dive) => dive.height === key));
  const [selected, setSelected] = useState(available[0]?.key ?? "ONE_METER");
  const selectedHeight = heights.find((height) => height.key === selected)?.label ?? "1 m";
  const currentDives = dives.filter((dive) => dive.height === selected);
  const target = currentDives.length * repetitionsTarget;
  const completed = currentDives.reduce((sum, dive) => sum + Math.min(dive.volume, repetitionsTarget), 0);

  return <>
    <header className="competition-progress-header"><Link href="/athlete/profile" aria-label="Retour au profil"><ArrowLeft /></Link><h1>Ma liste</h1></header>
    <div className="competition-progress-tabs" role="tablist" aria-label="Hauteur de plongeon">
      {available.map(({ key, label }) => <button key={key} type="button" role="tab" aria-selected={selected === key} onClick={() => setSelected(key)}>{label}</button>)}
    </div>
    <section className="competition-progress-summary">
      <span><Waves /></span><div><strong>{currentDives.length} plongeons <i>·</i> {target} répétitions visées</strong><p>{completed} / {target} effectuées</p><div className="competition-progress-track"><i style={{ width: `${target ? Math.min(100, completed / target * 100) : 0}%` }} /></div></div><b>{target ? Math.round(completed / target * 100) : 0}%</b>
    </section>
    <section className="competition-progress-rows" aria-label={`Liste des plongeons ${selectedHeight}`}>
      {currentDives.map((dive) => {
        const done = Math.min(dive.volume, repetitionsTarget);
        return <article className={`competition-progress-row ${done >= repetitionsTarget ? "is-complete" : ""}`} key={dive.id}>
          <div className="competition-progress-code"><strong>{dive.code}</strong><span>{dive.volume} répétition{dive.volume === 1 ? "" : "s"}</span></div>
          <div className="competition-progress-detail"><span>{done} / {repetitionsTarget}</span><div><i style={{ width: `${done / repetitionsTarget * 100}%` }} /></div></div>
          {done >= repetitionsTarget && <span className="competition-progress-check"><Check /></span>}
          <span className="competition-progress-rating" aria-label={dive.latestConfidence === null || dive.latestConfidence === undefined ? "Aucune évaluation" : `Dernière évaluation : ${dive.latestConfidence} sur 5`}>{dive.latestConfidence ?? "—"}</span>
        </article>;
      })}
      {!currentDives.length && <p className="progress-details-empty">Aucun plongeon dans cette liste.</p>}
    </section>
  </>;
}
