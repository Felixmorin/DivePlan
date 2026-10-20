"use client";

import { useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { CompetitionDiveEditor } from "@/components/coach/competition-dive-editor";

type Dive = {
  id: string;
  listId: string;
  height: "ONE_METER" | "THREE_METER" | "PLATFORM" | "CUSTOM";
  platformHeight: number | null;
  code: string;
  name?: string;
  difficulty: number | null;
  volume: number;
  athleteEvaluation?: number | null;
};

const heights = [
  { value: "ONE_METER", label: "1 m" },
  { value: "THREE_METER", label: "3 m" },
  { value: "PLATFORM", label: "Plateforme" },
  { value: "CUSTOM", label: "Autre" }
] as const;

export function CoachCompetitionListsTab({ athleteId, lists, dives, demo }: {
  athleteId: string;
  lists: Array<{id:string;name:string}>;
  dives: Dive[];
  demo: boolean;
}) {
  const [activeListId, setActiveListId] = useState(lists[0]?.id ?? "");
  const activeList = lists.find((list)=>list.id===activeListId) ?? lists[0];
  const listDives = dives.filter((dive)=>dive.listId===activeList?.id);
  const availableHeights = heights.filter(({value})=>listDives.some((dive)=>dive.height===value));
  const [activeHeight, setActiveHeight] = useState<string>(availableHeights[0]?.value ?? "ONE_METER");
  const selectedHeight = availableHeights.find(({value})=>value===activeHeight) ?? availableHeights[0];
  const visibleDives = selectedHeight ? listDives.filter((dive)=>dive.height===selectedHeight.value) : [];

  return <div className="coach-competition-tab">
    <section className="athlete-panel coach-competition-list-panel">
      <header className="coach-competition-heading"><div><h2>Liste de plongeon de compétition</h2><p>Sélectionnez une liste et consultez les plongeons prévus pour les compétitions.</p></div><label>Liste active<select value={activeList?.id??""} onChange={(event)=>{setActiveListId(event.target.value);setActiveHeight("ONE_METER");}} disabled={!lists.length}><option value="" disabled>Aucune liste</option>{lists.map((list)=><option key={list.id} value={list.id}>{list.name}</option>)}</select><ChevronDown className="h-4 w-4"/></label></header>
      {availableHeights.length>0&&<nav className="coach-competition-heights" aria-label="Hauteur du plongeon">{availableHeights.map(({value,label})=><button key={value} type="button" aria-pressed={selectedHeight?.value===value} onClick={()=>setActiveHeight(value)}>{label}</button>)}</nav>}
      {selectedHeight ? (
        <div className="coach-competition-table-wrap">
          <table className="coach-competition-table">
            <thead><tr><th>#</th><th>Code</th><th>Nom du plongeon</th><th>DD</th><th>Évaluation</th><th>Nb rep</th></tr></thead>
            <tbody>{visibleDives.map((dive, index) => {
              const evaluated = dive.athleteEvaluation !== null && dive.athleteEvaluation !== undefined;
              return <tr key={dive.id}>
                <td>{index + 1}</td>
                <td className="font-extrabold">{dive.code}{dive.height === "PLATFORM" && dive.platformHeight !== null && <small> · {dive.platformHeight} m</small>}</td>
                <td>{dive.name?.trim() || `Saut ${dive.code}`}</td>
                <td>{dive.difficulty?.toFixed(1) ?? "—"}</td>
                <td><span className={`coach-dive-status ${evaluated ? "is-ready" : "needs-work"}`}>{evaluated ? `${dive.athleteEvaluation} / 5` : "À évaluer"}</span></td>
                <td>{dive.volume}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      ) : <p className="athlete-empty coach-competition-empty">Aucun plongeon n’est enregistré dans cette liste.</p>}
      {!lists.length&&<p className="athlete-empty coach-competition-empty">Aucune liste de compétition n’a encore été créée.</p>}
    </section>
    <details className="coach-competition-management"><summary><Plus className="h-4 w-4"/> Options de gestion des listes et des plongeons</summary><div><CompetitionDiveEditor athleteId={athleteId} lists={lists} dives={dives} demo={demo}/></div></details>
  </div>;
}
