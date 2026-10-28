"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, CircleCheck, ClipboardList, MessageSquareText, NotebookText, Printer, UserCheck, Users, Waves, X, Plus, Eye, MoreHorizontal, LockKeyhole, FileText, Smile } from "lucide-react";
import { saveCompletedSessionCoachNote, saveSessionAttendance, updateCompletedSessionSummary } from "@/app/coach/sessions/actions";
import { formatMontrealDate } from "@/lib/timezone";
import { countPoolContexts } from "@/lib/pool-list";

type Session = {
  id: string;
  date: Date;
  notes: string | null;
  week: { group: { name: string } };
  blocks: Array<{
    id: string;
    position: number;
    title: string;
    type: string;
    assignments: Array<{ id: string; sessionBlockId: string; athleteId: string; athlete: { id: string; user: { firstName: string; lastName: string } } }>;
    drylandExercises: Array<{ exerciseId: string; sets: number | null; reps: number | null; exercise: { name: string } }>;
    poolTraining: { sections: Array<{ id: string; label: string | null; height: string; dives: Array<{ id: string; diveCode: string; repetitions: number }> }> } | null;
  }>;
  completions: Array<{ athleteId: string; status: string; note: string | null; rating: string | null }>;
  coachNotes: Array<{ athleteId: string; note: string }>;
  absences: Array<{ athleteId: string }>;
  diveLogs: Array<{ athleteId: string; poolDiveId: string; repetitionsCompleted: number }>;
  exerciseLogs: Array<{ athleteId: string; exerciseId: string; completed: boolean }>;
};
type AthleteRow = {
  id: string; firstName: string; lastName: string; status: string;
  plannedDryland: number; actualDryland: number; plannedPool: number; actualPool: number;
  nextStep: string; percent: number;
};

const kindOrder = ["WARMUP", "DRYLAND", "POOL", "COOLDOWN", "CUSTOM"] as const;
const kindNames: Record<string, string> = { WARMUP: "Échauffement", DRYLAND: "Dryland", POOL: "Piscine", COOLDOWN: "Retour au calme", CUSTOM: "Autres blocs" };

function plannedPool(block: Session["blocks"][number]) {
  return (block.poolTraining?.sections ?? []).reduce((total, section) => total + Math.max(1, countPoolContexts(section.label ?? section.height)) * section.dives.reduce((sum, dive) => sum + dive.repetitions, 0), 0);
}

function plannedDryland(block: Session["blocks"][number]) {
  return block.drylandExercises.reduce((sum, item) => sum + (item.sets ?? 1) * (item.reps ?? 0), 0);
}

function pct(actual: number, planned: number) {
  return planned > 0 ? Math.min(100, Math.round(actual / planned * 100)) : 0;
}

export function CompletedSessionOverview({ session }: { session: Session }) {
  const [allOpen, setAllOpen] = useState<boolean | null>(true);
  const [editingSummary, setEditingSummary] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [presenceOpen, setPresenceOpen] = useState(false);
  const [absentAthleteIds, setAbsentAthleteIds] = useState<Set<string>>(() => new Set(session.absences.map(({ athleteId }) => athleteId)));
  const blocks = [...session.blocks].sort((a, b) => a.position - b.position);
  const athleteMap = new Map<string, AthleteRow>();
  for (const block of blocks) for (const { athlete } of block.assignments) {
    if (!athleteMap.has(athlete.id)) athleteMap.set(athlete.id, {
      id: athlete.id, firstName: athlete.user.firstName, lastName: athlete.user.lastName,
      status: absentAthleteIds.has(athlete.id) ? "SKIPPED" : session.completions.find((completion) => completion.athleteId === athlete.id)?.status ?? "NOT_STARTED",
      plannedDryland: 0, actualDryland: 0, plannedPool: 0, actualPool: 0,
      nextStep: "", percent: 0
    });
  }
  const athletes = [...athleteMap.values()];
  const athleteMessages = athletes.flatMap((athlete) => {
    const message = session.completions.find((completion) => completion.athleteId === athlete.id)?.note?.trim();
    return message ? [{ athlete, message }] : [];
  });
  const activeAthletes = athletes.filter((athlete) => athlete.status !== "SKIPPED");
  for (const block of blocks) {
    const poolPlanned = plannedPool(block);
    const drylandPlanned = plannedDryland(block);
    const exerciseIds = new Set(block.drylandExercises.map((item) => item.exerciseId));
    for (const { athleteId } of block.assignments) {
      const athlete = athleteMap.get(athleteId);
      if (!athlete) continue;
      if (block.type === "POOL") {
        athlete.plannedPool += poolPlanned;
        athlete.actualPool += session.diveLogs.filter((log) => log.athleteId === athleteId && block.poolTraining?.sections.some((section) => section.dives.some((dive) => dive.id === log.poolDiveId))).reduce((sum, log) => sum + log.repetitionsCompleted, 0);
      } else if (block.type === "DRYLAND") {
        athlete.plannedDryland += drylandPlanned;
        const completedIds = new Set(session.exerciseLogs.filter((log) => log.athleteId === athleteId && exerciseIds.has(log.exerciseId) && log.completed).map((log) => log.exerciseId));
        athlete.actualDryland += block.drylandExercises.filter((item) => completedIds.has(item.exerciseId)).reduce((sum, item) => sum + (item.sets ?? 1) * (item.reps ?? 0), 0);
      }
    }
  }
  for (const athlete of athletes) {
    athlete.percent = pct(athlete.actualPool, athlete.plannedPool);
    athlete.nextStep = athlete.plannedPool > athlete.actualPool ? `Reprendre ${athlete.plannedPool - athlete.actualPool} répétitions de plongeons au prochain entraînement` : "Maintenir la qualité d’exécution des plongeons";
  }
  const assigned = athletes.length;
  const absentCount = athletes.filter((athlete) => absentAthleteIds.has(athlete.id)).length;
  const present = assigned - absentCount;
  const attendanceLabel = absentCount ? `${present}/${assigned} (${absentCount} absent${absentCount === 1 ? "" : "s"})` : `${present}/${assigned}`;
  const plannedDry = activeAthletes.reduce((sum, athlete) => sum + athlete.plannedDryland, 0);
  const actualDry = activeAthletes.reduce((sum, athlete) => sum + athlete.actualDryland, 0);
  const plannedPoolReps = activeAthletes.reduce((sum, athlete) => sum + athlete.plannedPool, 0);
  const actualPoolReps = activeAthletes.reduce((sum, athlete) => sum + athlete.actualPool, 0);
  const ratingScale = ["Pas bien", "Difficile", "Moyen", "Bien", "Très bien"];
  const ratings = session.completions.map(({ rating }) => ratingScale.indexOf(rating ?? "") + 1).filter((rating) => rating > 0);
  const averageRating = ratings.length ? (ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(1) : "—";
  const plannedExercises = blocks.filter((block) => block.type === "DRYLAND").reduce((sum, block) => sum + block.drylandExercises.length * block.assignments.filter(({ athleteId }) => !absentAthleteIds.has(athleteId)).length, 0);
  const actualExercises = session.exerciseLogs.filter((log) => log.completed && !absentAthleteIds.has(log.athleteId)).length;
  const athleteCompletedBlock = (block: Session["blocks"][number], athleteId: string) => {
    if (block.type === "POOL") {
      const ids = new Set(block.poolTraining?.sections.flatMap((section) => section.dives.map((dive) => dive.id)) ?? []);
      const actual = session.diveLogs.filter((log) => log.athleteId === athleteId && ids.has(log.poolDiveId)).reduce((sum, log) => sum + log.repetitionsCompleted, 0);
      return plannedPool(block) > 0 && actual >= plannedPool(block);
    }
    if (block.type === "DRYLAND") return block.drylandExercises.length > 0 && block.drylandExercises.every((item) => session.exerciseLogs.some((log) => log.athleteId === athleteId && log.exerciseId === item.exerciseId && log.completed));
    return false;
  };
  const completedBlockIds = new Set(blocks.filter((block) => {
    const participating = block.assignments.filter(({ athleteId }) => athleteMap.get(athleteId)?.status !== "SKIPPED");
    return participating.length > 0 && participating.every(({ athleteId }) => athleteCompletedBlock(block, athleteId));
  }).map((block) => block.id));
  const attention = activeAthletes.filter((athlete) => athlete.plannedPool > 0 && athlete.percent < 80);
  const categories = kindOrder.map((type) => {
    const categoryBlocks = blocks.filter((block) => block.type === type);
    if (!categoryBlocks.length) return null;
    const planned = categoryBlocks.reduce((sum, block) => {
      const participants = block.assignments.filter(({ athleteId }) => athleteMap.get(athleteId)?.status !== "SKIPPED").length;
      return sum + (block.type === "POOL" ? plannedPool(block) * participants : block.type === "DRYLAND" ? plannedDryland(block) * participants : 0);
    }, 0);
    const actual = categoryBlocks.reduce((sum, block) => {
      if (block.type === "POOL") {
        const ids = new Set(block.poolTraining?.sections.flatMap((section) => section.dives.map((dive) => dive.id)) ?? []);
        return sum + session.diveLogs.filter((log) => ids.has(log.poolDiveId) && block.assignments.some((assignment) => assignment.athleteId === log.athleteId && athleteMap.get(assignment.athleteId)?.status !== "SKIPPED")).reduce((total, log) => total + log.repetitionsCompleted, 0);
      }
      if (block.type === "DRYLAND") {
        const repsByExercise = new Map(block.drylandExercises.map((item) => [item.exerciseId, (item.sets ?? 1) * (item.reps ?? 0)]));
        return sum + session.exerciseLogs.filter((log) => log.completed && repsByExercise.has(log.exerciseId) && block.assignments.some((assignment) => assignment.athleteId === log.athleteId && athleteMap.get(assignment.athleteId)?.status !== "SKIPPED")).reduce((total, log) => total + (repsByExercise.get(log.exerciseId) ?? 0), 0);
      }
      return sum;
    }, 0);
    const eligibleCount = categoryBlocks.filter((block) => block.assignments.some(({ athleteId }) => athleteMap.get(athleteId)?.status !== "SKIPPED")).length;
    return { type, label: kindNames[type], blocks: categoryBlocks, planned, actual, doneCount: categoryBlocks.filter((block) => completedBlockIds.has(block.id)).length, eligibleCount };
  }).filter((item): item is NonNullable<typeof item> => item !== null);
  return <>
    <div className="completed-overview">
      <div className="completed-breadcrumb"><Link href="/coach/sessions">Séances</Link><span>›</span><span>Séance du {formatMontrealDate(session.date, { day: "numeric", month: "long", year: "numeric" })}</span></div>
      <header className="completed-head"><div className="completed-title"><span className="completed-title-check"><Check /></span><div><h1>Séance terminée</h1><p>{formatMontrealDate(session.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}<span>·</span>{session.week.group.name}</p></div></div><div className="completed-actions"><details className="completed-more"><summary aria-label="Plus d’actions"><MoreHorizontal /></summary><div><button type="button" onClick={() => setPresenceOpen(true)}><UserCheck /> Gérer les présences</button><Link href={`/coach/sessions/${session.id}/print`}><Printer /> Exporter en PDF</Link></div></details><Link href="#session-content"><Eye /> Voir la séance</Link><Link className="completed-primary" href="/coach/sessions/new"><Plus /> Nouvelle séance</Link></div></header>
      <section className="completed-stats">
        <CompletedStat icon={<Users />} label="Athlètes" value={attendanceLabel} detail={`${assigned ? Math.round(present / assigned * 100) : 0}% présents`} />
        <CompletedStat icon={<CircleCheck />} label="Exercices complétés" value={`${actualExercises} / ${plannedExercises}`} detail={`${pct(actualExercises, plannedExercises)}% réalisés`} />
        <CompletedStat icon={<Waves />} label="Volume de la séance" value={`${actualPoolReps} / ${plannedPoolReps} plongeons`} detail={`Volume total : ${plannedPoolReps} · Moy. par athlète : ${assigned ? Math.round(plannedPoolReps / assigned) : 0}`} />
        <CompletedStat icon={<Smile />} label="Ressenti moyen" value={averageRating === "—" ? "—" : `${averageRating} / 5`} detail={ratings.length ? "Évaluation des athlètes" : "Aucun ressenti enregistré"} />
      </section>
      <div className="completed-split-panels"><section className="completed-panel completed-plan" id="group-summary"><header className="completed-panel-head"><h2><FileText /> Plan du groupe</h2><div><span>Réalisé</span><button type="button" aria-label="Modifier le plan du groupe" onClick={() => { setEditingSummary(true); setTimeout(() => document.getElementById("completed-summary-editor")?.scrollIntoView({ behavior: "smooth" }), 0); }}><NotebookText /></button></div></header><p>{session.notes?.trim() || "Plan orienté travail technique et préparation aux prochaines compétitions."}</p></section>
      <section className="completed-panel completed-messages"><header className="completed-panel-head"><h2><MessageSquareText /> Messages des athlètes</h2><span>{athleteMessages.length} nouveau{athleteMessages.length === 1 ? "" : "x"}</span></header>{athleteMessages.length ? <div className="completed-message-list">{athleteMessages.map(({ athlete, message }) => <article key={athlete.id}><b className="completed-avatar">{athlete.firstName[0]}{athlete.lastName[0]}</b><strong>{athlete.firstName} {athlete.lastName}</strong><p>{message}</p><time>—</time></article>)}</div> : <p className="completed-empty">Aucun message laissé par les athlètes pour cette séance.</p>}</section></div>
      <section className="completed-panel completed-content" id="session-content"><header className="completed-panel-head"><h2><ClipboardList /> Contenu de la séance</h2><button type="button" onClick={() => setAllOpen((open) => open === true ? false : true)}>{allOpen ? "Tout replier" : "Tout déplier"}</button></header>
        {categories.map((category) => <details className="completed-category" key={category.type} open={allOpen ?? false}><summary><span className={`completed-dot ${category.type.toLowerCase()}`} /><strong>{category.label}</strong><span>{category.blocks.length} bloc{category.blocks.length > 1 ? "s" : ""}</span><span className="completed-category-status"><CircleCheck /> {category.doneCount}/{category.eligibleCount} complétés</span><b>{category.actual}/{category.planned}</b> répétitions <ChevronDown /></summary>
          <div className="completed-block-list">{category.blocks.map((block) => {
            const blockPoolPlan = plannedPool(block);
            const blockDryPlan = plannedDryland(block);
            const participatingAssignments = block.assignments.filter(({ athleteId }) => athleteMap.get(athleteId)?.status !== "SKIPPED");
            const planned = (blockPoolPlan + blockDryPlan) * participatingAssignments.length;
            const poolIds = new Set(block.poolTraining?.sections.flatMap((section) => section.dives.map((dive) => dive.id)) ?? []);
            const actual = block.type === "POOL"
              ? session.diveLogs.filter((log) => poolIds.has(log.poolDiveId) && participatingAssignments.some((assignment) => assignment.athleteId === log.athleteId)).reduce((sum, log) => sum + log.repetitionsCompleted, 0)
              : block.type === "DRYLAND"
                ? session.exerciseLogs.filter((log) => log.completed && block.drylandExercises.some((item) => item.exerciseId === log.exerciseId) && participatingAssignments.some((assignment) => assignment.athleteId === log.athleteId)).reduce((sum, log) => { const item = block.drylandExercises.find((exercise) => exercise.exerciseId === log.exerciseId); return sum + (item?.sets ?? 1) * (item?.reps ?? 0); }, 0)
                : 0;
            const complete = completedBlockIds.has(block.id);
            const allAbsent = block.assignments.length > 0 && participatingAssignments.length === 0;
            return <details className="completed-block" key={block.id} open={allOpen ?? false}><summary><span className="completed-block-marker">▸</span><strong>{block.title}</strong><span className={allAbsent ? "completed-absent-status" : complete ? "completed-mini-status" : "incomplete-mini-status"}>{allAbsent ? "Absent" : complete ? "Terminé" : "Non complété"}</span><b>{actual}/{planned}</b> répétitions <ChevronDown /></summary>
              <div className="completed-block-body"><div className="completed-table-scroll"><table><thead><tr><th>Plongeons travaillés</th><th><span>Répétitions (fait / prévu)</span><small className="completed-total-repetitions">{actual} / {planned}</small></th></tr></thead><tbody>{block.assignments.map(({ athlete }) => {
                const absent = athleteMap.get(athlete.id)?.status === "SKIPPED";
                const athleteDiveLogs = session.diveLogs.filter((log) => log.athleteId === athlete.id && poolIds.has(log.poolDiveId));
                return <tr key={athlete.id} className={absent ? "completed-athlete-absent" : ""}><td colSpan={2}>{block.type === "POOL" ? <div className="completed-dive-rows">{(block.poolTraining?.sections ?? []).flatMap((section) => section.dives.map((dive) => {
                  const contextCount = Math.max(1, countPoolContexts(section.label ?? section.height));
                  const plannedRepetitions = dive.repetitions * contextCount;
                  const completedRepetitions = athleteDiveLogs.filter((log) => log.poolDiveId === dive.id).reduce((sum, log) => sum + log.repetitionsCompleted, 0);
                  const heightLabel = section.label ?? (section.height === "ONE_METER" ? "1 m" : section.height === "THREE_METER" ? "3 m" : section.height);
                  const completion = plannedRepetitions > 0 ? Math.min(100, Math.round(completedRepetitions / plannedRepetitions * 100)) : 0;
                  return <div className="completed-dive-row" key={dive.id}>
                    <span className="completed-dive-height">{heightLabel}</span><strong className="completed-dive-code">{dive.diveCode}</strong>
                    <span className="completed-dive-repetitions"><small>Répétitions (fait / prévu)</small><b>{absent ? `0 / ${plannedRepetitions}` : `${completedRepetitions} / ${plannedRepetitions}`}</b></span>
                    <span className={`completed-dive-indicator${completion >= 100 ? " is-complete" : ""}`} aria-label={absent ? "Athlète absent" : `${completion}% complété`}>{!absent && completion >= 100 ? <CircleCheck /> : absent ? "—" : `${completion}%`}</span>
                    <span className="completed-dive-progress" aria-hidden="true"><span style={{ width: `${absent ? 0 : completion}%` }} /></span>
                  </div>;
                }))}</div> : block.type === "DRYLAND" ? <div className="completed-dive-rows">{block.drylandExercises.map((item) => {
                  const plannedRepetitions = (item.sets ?? 1) * (item.reps ?? 0);
                  const completed = session.exerciseLogs.some((log) => log.athleteId === athlete.id && log.exerciseId === item.exerciseId && log.completed);
                  return <div className="completed-dive-row" key={item.exerciseId}>
                    <strong className="completed-dive-code">{item.exercise.name}</strong>
                    <span className="completed-dive-repetitions"><small>Répétitions (fait / prévu)</small><b>{absent ? `0 / ${plannedRepetitions}` : `${completed ? plannedRepetitions : 0} / ${plannedRepetitions}`}</b></span>
                    {absent && <span className="completed-absent-status">Absent</span>}
                  </div>;
                })}</div> : "—"}</td></tr>;
              })}</tbody></table></div></div>
            </details>;
          })}</div>
        </details>)}
      </section>
      <section className="completed-panel completed-followup" id="follow-up"><header className="completed-panel-head"><h2><Users /> Athlètes à suivre</h2></header><div className="completed-followup-grid">{(attention.length ? attention : activeAthletes.slice(0, 2)).map((athlete) => <div className="completed-followup-row" key={athlete.id}><b className="completed-avatar">{athlete.firstName[0]}{athlete.lastName[0]}</b><span><strong>{athlete.firstName} {athlete.lastName}</strong><small>{attention.includes(athlete) ? athlete.nextStep : "Bonne progression, à encourager sur la régularité."}</small></span><ChevronDown /></div>)}</div>{attention.length === 0 && activeAthletes.length === 0 && <p className="completed-empty">Aucun athlète à suivre.</p>}</section>
      <section className="completed-panel completed-private-notes"><header className="completed-panel-head"><h2><LockKeyhole /> Notes privées du coach</h2><button type="button" onClick={() => setNoteOpen((open) => !open)}><Plus /> Ajouter une note</button></header>{noteOpen && <form className="completed-note-form" action={saveCompletedSessionCoachNote}><input type="hidden" name="sessionId" value={session.id} /><label>Athlète<select name="athleteId" required defaultValue=""><option value="" disabled>Choisir un athlète</option>{athletes.map((athlete) => <option key={athlete.id} value={athlete.id}>{athlete.firstName} {athlete.lastName}</option>)}</select></label><label>Note privée<textarea name="note" required maxLength={2000} placeholder="Ajouter un point de suivi pour cet athlète…" /></label><button type="submit"><Check /> Enregistrer la note</button></form>}{session.coachNotes.length ? session.coachNotes.map(({ athleteId, note }) => { const athlete = athleteMap.get(athleteId); return <article className="completed-private-note" key={athleteId}><b className="completed-avatar">{athlete ? `${athlete.firstName[0]}${athlete.lastName[0]}` : "C"}</b><strong>{athlete ? `${athlete.firstName} ${athlete.lastName}` : "Coach"}</strong><p>{note}</p><span>Note privée</span><Link aria-label={`Voir la fiche de ${athlete ? `${athlete.firstName} ${athlete.lastName}` : "l’athlète"}`} href={athlete ? `/coach/athletes/${athleteId}` : "/coach/athletes"}><MoreHorizontal /></Link></article>; }) : <p className="completed-empty">Aucune note privée pour cette séance.</p>}</section>
      <section className="completed-panel completed-summary-editor" id="completed-summary-editor" hidden={!editingSummary}><h2><NotebookText /> Résumé et points à reprendre</h2><form id="completed-summary-form" action={updateCompletedSessionSummary}><input type="hidden" name="sessionId" value={session.id} /><textarea name="summary" defaultValue={session.notes ?? ""} maxLength={5000} placeholder="Ajoutez le bilan du groupe et les points à reprendre à la prochaine séance." /><button className="completed-save" type="submit"><Check /> Enregistrer le résumé</button></form></section>
    </div>
    {presenceOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPresenceOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="presence-dialog-title" className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <header className="flex items-start justify-between border-b border-slate-100 pb-3"><div><h2 id="presence-dialog-title" className="text-lg font-black text-slate-950">Gérer les présences</h2><p className="mt-1 text-xs font-semibold text-slate-500">{session.week.group.name} · Séance terminée</p></div><button type="button" aria-label="Fermer" onClick={() => setPresenceOpen(false)} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button></header>
        <form action={async (formData) => { await saveSessionAttendance(formData); setPresenceOpen(false); }} className="pt-3">
          <input type="hidden" name="sessionId" value={session.id} />
          {athletes.map((athlete) => {
            const absent = absentAthleteIds.has(athlete.id);
            return <label key={athlete.id} className="flex items-center gap-3 border-b border-slate-100 py-2.5 last:border-0"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-black text-blue-700">{athlete.firstName.slice(0, 1)}{athlete.lastName.slice(0, 1)}</span><strong className="min-w-0 flex-1 text-sm text-slate-900">{athlete.firstName} {athlete.lastName}</strong><select aria-label={`Présence de ${athlete.firstName} ${athlete.lastName}`} value={absent ? "absent" : "present"} onChange={(event) => setAbsentAthleteIds((current) => { const next = new Set(current); if (event.target.value === "absent") next.add(athlete.id); else next.delete(athlete.id); return next; })} className={`h-9 rounded-lg px-3 text-sm font-semibold ${absent ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}><option value="present">●　Présent</option><option value="absent">●　Absent</option></select>{absent && <input type="hidden" name="absentAthleteIds" value={athlete.id} />}</label>;
          })}
          <div className="mt-3 rounded-lg bg-blue-50 p-3 text-sm"><strong>{athletes.length - absentAthleteIds.size} présents · {absentAthleteIds.size} absent{absentAthleteIds.size === 1 ? "" : "s"}</strong><p className="mt-1 text-xs leading-5 text-blue-800">Les répétitions prévues des athlètes absents sont exclues des totaux.</p></div>
          <button type="button" onClick={() => setAbsentAthleteIds(new Set())} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-blue-200 text-sm font-bold text-blue-700 hover:bg-blue-50"><Users className="h-4 w-4" /> Tout le monde présent</button>
          <footer className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setPresenceOpen(false)} className="h-10 rounded-lg border border-slate-200 px-5 text-sm font-bold text-slate-700">Annuler</button><button type="submit" className="h-10 rounded-lg bg-blue-700 px-5 text-sm font-bold text-white hover:bg-blue-800">Enregistrer</button></footer>
        </form>
      </section>
    </div>}
  </>;
}

function CompletedStat({ icon, label, value, detail, warning = false }: { icon: React.ReactNode; label: string; value: string | number; detail: string; warning?: boolean }) {
  return <article className={`completed-stat ${warning ? "warning" : ""}`}><span>{icon}</span><label>{label}</label><strong>{value}</strong><small>{detail}</small></article>;
}

