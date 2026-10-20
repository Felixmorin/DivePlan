"use client";

import { Fragment, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronDown, Copy, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { copyCompetitionDiveList, createCompetitionDiveList, deleteCompetitionDiveList, removeCompetitionDive, renameCompetitionDiveList, reorderCompetitionDives, setActiveCompetitionDiveList, updateCompetitionDiveDetails, updateCompetitionDiveStatus } from "@/app/coach/athletes/actions";
import { worldAquaticsDifficulty } from "@/lib/world-aquatics-dd";

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

const diveStatusColors: Record<Dive["status"], string> = {
  READY: "#08b98d",
  TO_WORK_ON: "#f4b740",
  DIFFICULT: "#ef5364",
  NOT_READY: "#94a3b8"
};

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
  const [copyFromListId, setCopyFromListId] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [editingDiveId, setEditingDiveId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [diveStatuses, setDiveStatuses] = useState<Record<string, Dive["status"]>>({});
  const selectedList = lists.find((list)=>list.id===selectedListId) ?? lists[0];
  const isActive = selectedList?.position === 0;
  const listDives = dives.filter((dive)=>dive.listId===selectedList?.id);
  const availableHeights = heights.filter(({value})=>selectedList?.heights.includes(value) || listDives.some((dive)=>dive.height===value));
  const [activeHeight, setActiveHeight] = useState<string>(availableHeights[0]?.value ?? "ONE_METER");
  const selectedHeight = availableHeights.find(({value})=>value===activeHeight) ?? availableHeights[0];
  const visibleDives = selectedHeight ? listDives.filter((dive)=>dive.height===selectedHeight.value) : [];
  const statusSummary = (Object.keys(diveStatusLabels) as Dive["status"][]).map((status) => ({
    status,
    label: diveStatusLabels[status],
    count: listDives.filter((dive) => (diveStatuses[dive.id] ?? dive.status) === status).length
  }));
  const diveCount = listDives.length;
  let statusOffset = 0;
  const statusGradient = diveCount
    ? statusSummary.map(({status, count}) => {
        const start = statusOffset;
        statusOffset += (count / diveCount) * 100;
        return `${diveStatusColors[status]} ${start}% ${statusOffset}%`;
      }).join(", ")
    : "#e8eff4 0% 100%";
  const totalDifficulty = visibleDives.reduce((sum, dive) => sum + (dive.difficulty ?? 0), 0);

  async function createList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setError("");
    setPending(true);
    try {
      const created = copyFromListId ? await copyCompetitionDiveList(formData) : await createCompetitionDiveList(formData);
      setSelectedListId(created.id);
      setActiveHeight(String(formData.getAll("heights")[0] ?? "ONE_METER"));
      setCopyFromListId("");
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

  async function deleteSelectedList() {
    if (!selectedList || demo || pending) return;
    const diveCount = listDives.length;
    const diveLabel = diveCount === 1 ? "plongeon" : "plongeons";
    if (!window.confirm(`Supprimer la liste « ${selectedList.name} » et ses ${diveCount} ${diveLabel} ?`)) return;
    setPending(true);
    setError("");
    try {
      await deleteCompetitionDiveList(selectedList.id);
      const nextList = lists.find((list) => list.id !== selectedList.id);
      setSelectedListId(nextList?.id ?? "");
      setActiveHeight("ONE_METER");
      setEditingDiveId(null);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de supprimer cette liste.");
    } finally {
      setPending(false);
    }
  }

  async function renameList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedList || demo || pending) return;
    setPending(true);
    setError("");
    try {
      await renameCompetitionDiveList(new FormData(event.currentTarget));
      setRenameOpen(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de renommer cette liste.");
    } finally {
      setPending(false);
    }
  }

  async function changeDiveStatus(diveId: string, status: Dive["status"]) {
    const dive = dives.find((item) => item.id === diveId);
    if (!dive || demo || pending) return;
    const previousStatus = diveStatuses[diveId] ?? dive.status;
    setDiveStatuses((current) => ({ ...current, [diveId]: status }));
    setPending(true);
    setError("");
    try {
      const formData = new FormData();
      formData.set("diveId", diveId);
      formData.set("status", status);
      await updateCompetitionDiveStatus(formData);
      router.refresh();
    } catch (cause) {
      setDiveStatuses((current) => ({ ...current, [diveId]: previousStatus }));
      setError(cause instanceof Error ? cause.message : "Impossible d’enregistrer le statut.");
    } finally {
      setPending(false);
    }
  }

  async function saveDiveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      await updateCompetitionDiveDetails(formData);
      setEditingDiveId(null);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de modifier ce plongeon.");
    } finally {
      setPending(false);
    }
  }

  async function deleteDive(dive: Dive) {
    if (demo || pending || !window.confirm(`Supprimer le plongeon ${dive.code} ?`)) return;
    const formData = new FormData();
    formData.set("diveId", dive.id);
    setPending(true);
    setError("");
    try {
      await removeCompetitionDive(formData);
      setEditingDiveId(null);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de supprimer ce plongeon.");
    } finally {
      setPending(false);
    }
  }

  async function moveDive(index: number, direction: -1 | 1) {
    if (!selectedList || !selectedHeight || demo || pending) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= visibleDives.length) return;
    const ordered = [...visibleDives];
    [ordered[index], ordered[targetIndex]] = [ordered[targetIndex], ordered[index]];
    const formData = new FormData();
    formData.set("athleteId", athleteId);
    formData.set("listId", selectedList.id);
    formData.set("height", selectedHeight.value);
    formData.set("diveIds", JSON.stringify(ordered.map((dive) => dive.id)));
    setPending(true);
    setError("");
    try {
      await reorderCompetitionDives(formData);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de changer l’ordre des plongeons.");
    } finally {
      setPending(false);
    }
  }

  return <div className="coach-competition-tab">
    <section className="athlete-panel coach-competition-list-panel">
      <header className="coach-competition-heading"><div><div className="coach-competition-title-row"><h2>{selectedList?.name ?? "Liste de compétition"}</h2><button type="button" className="coach-competition-rename-icon" onClick={()=>{setError("");setRenameOpen(true);}} disabled={demo||!selectedList} aria-label="Renommer cette liste" title="Renommer cette liste"><Pencil className="h-3.5 w-3.5"/></button></div><p>Sélectionnez une liste et consultez les plongeons prévus pour les compétitions.</p></div><div className="coach-competition-list-controls"><label>Liste à consulter<select value={selectedList?.id??""} onChange={(event)=>{setSelectedListId(event.target.value);setActiveHeight("ONE_METER");}} disabled={!lists.length}><option value="" disabled>Aucune liste</option>{lists.map((list)=><option key={list.id} value={list.id}>{list.name}{list.position===0?" · Liste active":""}</option>)}</select><ChevronDown className="h-4 w-4"/></label><button type="button" className="coach-competition-create-button" onClick={()=>{setError("");setCopyFromListId("");setCreateOpen(true);}} disabled={demo}><Plus className="h-4 w-4"/> Créer une nouvelle liste</button></div></header>
      {availableHeights.length>0&&<nav className="coach-competition-heights" aria-label="Hauteur du plongeon">{availableHeights.map(({value,label})=><button key={value} type="button" aria-pressed={selectedHeight?.value===value} onClick={()=>setActiveHeight(value)}>{label}</button>)}</nav>}
      {selectedHeight ? (
        <div className="coach-competition-table-wrap">
          <table className="coach-competition-table">
            <thead><tr><th>#</th><th>Code</th><th>DD</th><th>Statut</th><th>Évaluation</th><th>Nb rep</th><th><span className="sr-only">Modifier</span></th></tr></thead>
            <tbody>{visibleDives.map((dive, index) => {
              const evaluated = dive.athleteEvaluation !== null && dive.athleteEvaluation !== undefined;
              const isEditing = editingDiveId === dive.id;
              return <Fragment key={dive.id}>
                <tr key={dive.id}>
                  <td>{index + 1}</td>
                  <td className="font-extrabold">{dive.code}{dive.height === "PLATFORM" && dive.platformHeight !== null && <small> · {dive.platformHeight} m</small>}</td>
                  <td>{dive.difficulty?.toFixed(1) ?? "—"}</td>
                  <td><select aria-label={`Statut du plongeon ${dive.code}`} className={`coach-dive-status-select status-${(diveStatuses[dive.id] ?? dive.status).toLowerCase()}`} value={diveStatuses[dive.id] ?? dive.status} disabled={demo || pending} onChange={(event) => void changeDiveStatus(dive.id, event.target.value as Dive["status"])}>{Object.entries(diveStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
                  <td><span className={`coach-dive-status ${evaluated ? "is-ready" : "needs-work"}`}>{evaluated ? `${dive.athleteEvaluation} / 5` : "À évaluer"}</span></td>
                  <td>{dive.volume}</td>
                  <td><button type="button" className="coach-dive-edit-trigger" onClick={()=>setEditingDiveId(isEditing?null:dive.id)} disabled={demo||pending} aria-label={`${isEditing?"Fermer":"Modifier"} le plongeon ${dive.code}`} title="Modifier le plongeon"><Pencil className="h-4 w-4"/></button></td>
                </tr>
                {isEditing&&<tr key={`${dive.id}-editor`} className="coach-dive-editor-row"><td colSpan={7}><form onSubmit={saveDiveEdit} className="coach-dive-editor-form"><input type="hidden" name="diveId" value={dive.id}/><label>Code<input name="diveCode" maxLength={12} required defaultValue={dive.code} onChange={(event)=>{const difficultyInput=event.currentTarget.form?.elements.namedItem("difficulty");if(difficultyInput instanceof HTMLInputElement){const difficulty=dive.height==="CUSTOM"?null:worldAquaticsDifficulty(event.currentTarget.value,dive.height);difficultyInput.value=difficulty===null?"":difficulty.toFixed(1);}}}/></label><label>DD<input name="difficulty" inputMode="decimal" defaultValue={dive.difficulty?.toFixed(1)??""} placeholder="—"/></label>{dive.height==="PLATFORM"&&<label>Hauteur<select name="platformHeight" required defaultValue={dive.platformHeight?.toString()??""}><option value="" disabled>Choisir</option><option value="5">5 m</option><option value="7.5">7,5 m</option><option value="10">10 m</option></select></label>}<div className="coach-dive-editor-actions"><button type="submit" disabled={pending}><Save className="h-3.5 w-3.5"/>{pending?"Enregistrement…":"Enregistrer"}</button><button type="button" onClick={()=>void moveDive(index,-1)} disabled={pending||index===0} aria-label="Monter le plongeon"><ArrowUp className="h-4 w-4"/></button><button type="button" onClick={()=>void moveDive(index,1)} disabled={pending||index===visibleDives.length-1} aria-label="Descendre le plongeon"><ArrowDown className="h-4 w-4"/></button><button type="button" className="is-danger" onClick={()=>void deleteDive(dive)} disabled={pending}><Trash2 className="h-4 w-4"/>Supprimer</button></div></form></td></tr>}
              </Fragment>;
            })}</tbody>
          </table>
        </div>
      ) : <p className="athlete-empty coach-competition-empty">Aucun plongeon n’est enregistré dans cette liste.</p>}
      {!lists.length&&<p className="athlete-empty coach-competition-empty">Aucune liste de compétition n’a encore été créée.</p>}
      {selectedList&&<footer className="coach-competition-list-footer"><span>{isActive?"Cette liste est visible par l’athlète.":"Cette liste est réservée au coach tant qu’elle n’est pas activée."}</span><div className="coach-competition-list-footer-actions"><button type="button" onClick={activateSelectedList} disabled={demo||isActive||pending} aria-pressed={isActive}>{isActive?"Liste active":"Définir comme liste active"}</button><button type="button" className="coach-competition-delete-list-button" onClick={()=>void deleteSelectedList()} disabled={demo||pending}><Trash2 className="h-4 w-4"/>Supprimer la liste</button></div></footer>}
      {error&&<p className="coach-competition-error" role="alert">{error}</p>}
    </section>
    <div className="coach-competition-insights">
      <section className="athlete-panel coach-competition-insight-card">
        <h3>Répartition des statuts</h3>
        <div className="coach-competition-status-summary">
          <div className="coach-competition-donut" style={{ background: `conic-gradient(${statusGradient})` }} aria-label={`Statuts de ${diveCount} plongeons`}>
            <div><strong>{diveCount}</strong><span>plongeons</span></div>
          </div>
          <ul className="coach-competition-status-legend">
            {statusSummary.map(({status, label, count}) => (
              <li key={status}><i style={{ backgroundColor: diveStatusColors[status] }}/><span>{label}</span><strong>{count} ({diveCount ? Math.round((count / diveCount) * 100) : 0} %)</strong></li>
            ))}
          </ul>
        </div>
      </section>
      <section className="athlete-panel coach-competition-insight-card coach-competition-dd-card">
        <h3>Somme des DD</h3>
        <strong className="coach-competition-dd-total">{totalDifficulty.toFixed(1)}</strong>
        <p>DD total ({visibleDives.length} {visibleDives.length === 1 ? "plongeon" : "plongeons"})</p>
        <div className="coach-competition-dd-range"><span>Plage recommandée</span><strong>N/A</strong></div>
        <div className="coach-competition-dd-track" aria-hidden="true"><i/></div>
      </section>
    </div>
    {createOpen&&<div className="coach-competition-modal-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)setCreateOpen(false);}}><section className="coach-competition-modal" role="dialog" aria-modal="true" aria-labelledby="create-competition-list-title"><header><div><h2 id="create-competition-list-title">Créer une liste de compétition</h2><p>Donnez-lui un nom, choisissez ses épreuves ou copiez une liste existante.</p></div><button type="button" onClick={()=>setCreateOpen(false)} aria-label="Fermer"><X className="h-5 w-5"/></button></header><form onSubmit={createList}><input type="hidden" name="athleteId" value={athleteId}/><label className="coach-competition-name-label">Nom de la liste<input name="name" maxLength={60} required autoFocus placeholder="Ex. Coupe du Québec"/></label>{lists.length>0&&<label className="coach-competition-copy-source"><span><Copy className="h-4 w-4"/> Copier les plongeons d’une liste existante <small>(facultatif)</small></span><select name="sourceListId" value={copyFromListId} onChange={(event)=>setCopyFromListId(event.target.value)}><option value="">Créer une liste vide</option>{lists.map((list)=><option key={list.id} value={list.id}>{list.name}</option>)}</select></label>}<fieldset><legend>{copyFromListId?"Épreuves copiées avec la liste":"Épreuves"}</legend>{heights.filter(({value})=>value!=="CUSTOM").map(({value,label})=><label key={value} className={`coach-competition-height-option ${copyFromListId?"is-disabled":""}`}><input type="checkbox" name="heights" value={value} defaultChecked={value==="ONE_METER"} disabled={Boolean(copyFromListId)}/><span>{label}</span></label>)}</fieldset>{error&&<p className="coach-competition-error" role="alert">{error}</p>}<footer><button type="button" className="coach-competition-cancel" onClick={()=>setCreateOpen(false)}>Annuler</button><button type="submit" className="coach-competition-submit" disabled={pending}><Plus className="h-4 w-4"/>{pending?"Création…":"Créer la liste"}</button></footer></form></section></div>}
    {renameOpen&&selectedList&&<div className="coach-competition-modal-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)setRenameOpen(false);}}><section className="coach-competition-modal" role="dialog" aria-modal="true" aria-labelledby="rename-competition-list-title"><header><div><h2 id="rename-competition-list-title">Renommer la liste</h2><p>Le nom sera visible dans le profil du coach et de l’athlète si cette liste est active.</p></div><button type="button" onClick={()=>setRenameOpen(false)} aria-label="Fermer"><X className="h-5 w-5"/></button></header><form onSubmit={renameList}><input type="hidden" name="listId" value={selectedList.id}/><label className="coach-competition-name-label">Nom de la liste<input name="name" maxLength={60} required autoFocus defaultValue={selectedList.name}/></label>{error&&<p className="coach-competition-error" role="alert">{error}</p>}<footer><button type="button" className="coach-competition-cancel" onClick={()=>setRenameOpen(false)}>Annuler</button><button type="submit" className="coach-competition-submit" disabled={pending}>{pending?"Enregistrement…":"Enregistrer"}</button></footer></form></section></div>}
  </div>;
}
