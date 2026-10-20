"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus, X } from "lucide-react";
import { createCompetitionDiveList, setActiveCompetitionDiveList, updateCompetitionDiveStatus } from "@/app/coach/athletes/actions";

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
  status: "READY" | "TO_WORK_ON" | "DIFFICULT" | "NOT_READY";
};

const diveStatusLabels = {
  READY: "Prêt",
  TO_WORK_ON: "À travailler",
  DIFFICULT: "Difficile",
  NOT_READY: "Pas prêt"
} as const;

const heights = [
  { value: "ONE_METER", label: "1 m" },
  { value: "THREE_METER", label: "3 m" },
  { value: "PLATFORM", label: "Plateforme" },
  { value: "CUSTOM", label: "Autre" }
] as const;

export function CoachCompetitionListsTab({ athleteId, lists, dives, demo }: {
  athleteId: string;
  lists: Array<{id:string;name:string;position:number;heights:Array<"ONE_METER"|"THREE_METER"|"PLATFORM"|"CUSTOM">}>;
  dives: Dive[];
  demo: boolean;
}) {
  const router = useRouter();
  const [selectedListId, setSelectedListId] = useState(lists.find((list)=>list.position===0)?.id ?? lists[0]?.id ?? "");
  const [createOpen, setCreateOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const selectedList = lists.find((list)=>list.id===selectedListId) ?? lists[0];
  const isActive = selectedList?.position === 0;
  const listDives = dives.filter((dive)=>dive.listId===selectedList?.id);
  const availableHeights = heights.filter(({value})=>selectedList?.heights.includes(value) || listDives.some((dive)=>dive.height===value));
  const [activeHeight, setActiveHeight] = useState<string>(availableHeights[0]?.value ?? "ONE_METER");
  const selectedHeight = availableHeights.find(({value})=>value===activeHeight) ?? availableHeights[0];
  const visibleDives = selectedHeight ? listDives.filter((dive)=>dive.height===selectedHeight.value) : [];

  async function createList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setError("");
    setPending(true);
    try {
      const created = await createCompetitionDiveList(formData);
      setSelectedListId(created.id);
      setActiveHeight(String(formData.getAll("heights")[0] ?? "ONE_METER"));
      setCreateOpen(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de créer la liste.");
    } finally {
      setPending(false);
    }
  }

  async function activateSelectedList() {
    if (!selectedList || demo || isActive || pending) return;
    setPending(true);
    setError("");
    try {
      await setActiveCompetitionDiveList(selectedList.id);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible d’activer cette liste.");
    } finally {
      setPending(false);
    }
  }

  return <div className="coach-competition-tab">
    <section className="athlete-panel coach-competition-list-panel">
      <header className="coach-competition-heading"><div><h2>Liste de plongeon de compétition</h2><p>Sélectionnez une liste et consultez les plongeons prévus pour les compétitions.</p></div><div className="coach-competition-list-controls"><label>Liste à consulter<select value={selectedList?.id??""} onChange={(event)=>{setSelectedListId(event.target.value);setActiveHeight("ONE_METER");}} disabled={!lists.length}><option value="" disabled>Aucune liste</option>{lists.map((list)=><option key={list.id} value={list.id}>{list.name}{list.position===0?" · Liste active":""}</option>)}</select><ChevronDown className="h-4 w-4"/></label><button type="button" className="coach-competition-create-button" onClick={()=>{setError("");setCreateOpen(true);}} disabled={demo}><Plus className="h-4 w-4"/> Créer une nouvelle liste</button></div></header>
      {availableHeights.length>0&&<nav className="coach-competition-heights" aria-label="Hauteur du plongeon">{availableHeights.map(({value,label})=><button key={value} type="button" aria-pressed={selectedHeight?.value===value} onClick={()=>setActiveHeight(value)}>{label}</button>)}</nav>}
      {selectedHeight ? (
        <div className="coach-competition-table-wrap">
          <table className="coach-competition-table">
            <thead><tr><th>#</th><th>Code</th><th>DD</th><th>Statut</th><th>Évaluation</th><th>Nb rep</th></tr></thead>
            <tbody>{visibleDives.map((dive, index) => {
              const evaluated = dive.athleteEvaluation !== null && dive.athleteEvaluation !== undefined;
              return <tr key={dive.id}>
                <td>{index + 1}</td>
                <td className="font-extrabold">{dive.code}{dive.height === "PLATFORM" && dive.platformHeight !== null && <small> · {dive.platformHeight} m</small>}</td>
                <td>{dive.difficulty?.toFixed(1) ?? "—"}</td>
                <td><form action={updateCompetitionDiveStatus} className="coach-dive-status-form"><input type="hidden" name="diveId" value={dive.id}/><select aria-label={`Statut du plongeon ${dive.code}`} className={`coach-dive-status-select status-${dive.status.toLowerCase()}`} name="status" defaultValue={dive.status} disabled={demo} onChange={(event) => event.currentTarget.form?.requestSubmit()}>{Object.entries(diveStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></form></td>
                <td><span className={`coach-dive-status ${evaluated ? "is-ready" : "needs-work"}`}>{evaluated ? `${dive.athleteEvaluation} / 5` : "À évaluer"}</span></td>
                <td>{dive.volume}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      ) : <p className="athlete-empty coach-competition-empty">Aucun plongeon n’est enregistré dans cette liste.</p>}
      {!lists.length&&<p className="athlete-empty coach-competition-empty">Aucune liste de compétition n’a encore été créée.</p>}
      {selectedList&&<footer className="coach-competition-list-footer"><span>{isActive?"Cette liste est visible par l’athlète.":"Cette liste est réservée au coach tant qu’elle n’est pas activée."}</span><button type="button" onClick={activateSelectedList} disabled={demo||isActive||pending} aria-pressed={isActive}>{isActive?"Liste active":"Définir comme liste active"}</button></footer>}
      {error&&<p className="coach-competition-error" role="alert">{error}</p>}
    </section>
    {createOpen&&<div className="coach-competition-modal-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)setCreateOpen(false);}}><section className="coach-competition-modal" role="dialog" aria-modal="true" aria-labelledby="create-competition-list-title"><header><div><h2 id="create-competition-list-title">Créer une liste de compétition</h2><p>Donnez-lui un nom et cochez les épreuves qu’elle contiendra.</p></div><button type="button" onClick={()=>setCreateOpen(false)} aria-label="Fermer"><X className="h-5 w-5"/></button></header><form onSubmit={createList}><input type="hidden" name="athleteId" value={athleteId}/><label className="coach-competition-name-label">Nom de la liste<input name="name" maxLength={60} required autoFocus placeholder="Ex. Coupe du Québec"/></label><fieldset><legend>Épreuves</legend>{heights.filter(({value})=>value!=="CUSTOM").map(({value,label})=><label key={value} className="coach-competition-height-option"><input type="checkbox" name="heights" value={value} defaultChecked={value==="ONE_METER"}/><span>{label}</span></label>)}</fieldset>{error&&<p className="coach-competition-error" role="alert">{error}</p>}<footer><button type="button" className="coach-competition-cancel" onClick={()=>setCreateOpen(false)}>Annuler</button><button type="submit" className="coach-competition-submit" disabled={pending}><Plus className="h-4 w-4"/>{pending?"Création…":"Créer la liste"}</button></footer></form></section></div>}
  </div>;
}
