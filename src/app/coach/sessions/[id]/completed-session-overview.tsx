"use client";

import { useState } from "react";
import Link from "next/link";
import { Activity, ArrowLeft, ArrowRight, BarChart3, Check, ChevronDown, CircleCheck, ClipboardList, Download, Flag, MessageSquareText, NotebookText, Printer, Target, Trophy, UserCheck, Users, Waves, X } from "lucide-react";
import type { getCoachSession } from "@/lib/coach-session";
import { saveSessionAttendance, updateCompletedSessionSummary } from "@/app/coach/sessions/actions";
import { formatMontrealDate } from "@/lib/timezone";
import { countPoolContexts } from "@/lib/pool-list";

type Session = Awaited<ReturnType<typeof getCoachSession>>;
type Timing = { athleteId: string; blockId: string; closedAt: Date | null };
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

export function CompletedSessionOverview({ session, timings }: { session: Session; timings: Timing[] }) {
  const [allOpen, setAllOpen] = useState<boolean | null>(null);
  const [editingSummary, setEditingSummary] = useState(false);
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
  const plannedReps = plannedDry + plannedPoolReps;
  const actualReps = actualDry + actualPoolReps;
  const athleteCompletedBlock = (block: Session["blocks"][number], athleteId: string) => {
    if (timings.some((timing) => timing.athleteId === athleteId && timing.blockId === block.id && timing.closedAt)) return true;
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
  const completedBlocks = completedBlockIds.size;
  const eligibleBlocks = blocks.filter((block) => block.assignments.some(({ athleteId }) => athleteMap.get(athleteId)?.status !== "SKIPPED")).length;
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
      <header className="completed-head"><div><h1>Séance terminée</h1><p>{formatMontrealDate(session.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}<span>·</span>{session.week.group.name}</p></div><span className="completed-status"><CircleCheck /> Terminée</span><div className="completed-actions"><button type="button" onClick={() => setPresenceOpen(true)}><UserCheck /> Présence</button><button type="button" onClick={() => { setEditingSummary(true); setTimeout(() => document.getElementById("completed-summary-editor")?.scrollIntoView({ behavior: "smooth" }), 0); }}><NotebookText /> Modifier le résumé</button><details><summary><Download /> Exporter <ChevronDown /></summary><div><Link href={`/coach/sessions/${session.id}/print`}><Printer /> Exporter en PDF</Link></div></details></div></header>
      <section className="completed-stats">
        <CompletedStat icon={<Users />} label="Présence" value={attendanceLabel} detail="athlètes présents" />
        <CompletedStat icon={<Target />} label="Répétitions complétées" value={`${actualReps}/${plannedReps}`} detail={`${pct(actualReps, plannedReps)}% du volume prévu`} />
        <CompletedStat icon={<Waves />} label="Plongeons réalisés" value={`${actualPoolReps}/${plannedPoolReps}`} detail={`${pct(actualPoolReps, plannedPoolReps)}% du nombre prévu`} />
        <CompletedStat icon={<ClipboardList />} label="Blocs complétés" value={`${completedBlocks}/${eligibleBlocks}`} detail={`${pct(completedBlocks, eligibleBlocks)}% des blocs`} />
        <CompletedStat icon={<Flag />} label="Points à suivre" value={attention.length} detail="à reprendre à la prochaine séance" warning />
      </section>
      <section className="completed-panel" id="group-summary"><h2><Activity /> Bilan du groupe</h2><div className="completed-insights">
        <article className="positive"><Trophy /><div><strong>Point positif</strong><p>{pct(actualReps, plannedReps)}% du volume prévu a été réalisé par le groupe.</p></div></article>
        <article className="improve"><Target /><div><strong>Point à travailler</strong><p>{attention.length ? `${attention.length} athlète${attention.length > 1 ? "s" : ""} à accompagner à la prochaine séance selon les répétitions réalisées.` : "Le groupe a atteint les objectifs de répétition prévus."}</p></div></article>
        <article className="engagement"><BarChart3 /><div><strong>Présence / engagement</strong><p>{present} athlète{present > 1 ? "s" : ""} présent{present > 1 ? "s" : ""} sur {assigned}{absentCount ? ` (${absentCount} absent${absentCount === 1 ? "" : "s"})` : ""}. {completedBlocks} bloc{completedBlocks > 1 ? "s" : ""} terminé{completedBlocks > 1 ? "s" : ""} sur {eligibleBlocks}.</p></div></article>
      </div></section>
      <section className="completed-panel"><header className="completed-panel-head"><h2><MessageSquareText /> Messages des athlètes</h2></header>{athleteMessages.length ? <div className="grid gap-2 sm:grid-cols-2">{athleteMessages.map(({ athlete, message }) => <article className="rounded-lg border border-slate-200 bg-slate-50 p-3" key={athlete.id}><strong className="text-sm">{athlete.firstName} {athlete.lastName}</strong><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{message}</p></article>)}</div> : <p className="completed-empty">Aucun message laissé par les athlètes pour cette séance.</p>}</section>
      <section className="completed-panel"><header className="completed-panel-head"><h2><Users /> Athlètes à suivre</h2><Link href="/coach/athletes">Voir tous les athlètes <ArrowRight /></Link></header>
        <div className="completed-table-scroll"><table className="completed-athlete-table"><thead><tr><th>Athlète</th><th>Données de la séance</th><th>À reprendre</th><th /></tr></thead><tbody>{attention.map((athlete) => <tr key={athlete.id}><td><b className="completed-avatar">{athlete.firstName[0]}{athlete.lastName[0]}</b><strong>{athlete.firstName} {athlete.lastName}</strong></td><td><strong>{athlete.actualPool}/{athlete.plannedPool} répétitions</strong><small>{athlete.actualPool} plongeons</small></td><td>{athlete.nextStep}</td><td><Link aria-label={`Voir ${athlete.firstName} ${athlete.lastName}`} href={`/coach/athletes/${athlete.id}`}>•••</Link></td></tr>)}{attention.length === 0 && <tr><td colSpan={4} className="completed-empty">Tous les athlètes ont atteint 80 % des plongeons prévus.</td></tr>}</tbody></table></div>
      </section>
      <section className="completed-panel completed-content"><header className="completed-panel-head"><h2><ClipboardList /> Contenu de la séance</h2><button type="button" onClick={() => setAllOpen((open) => open === true ? false : true)}>{allOpen ? "Tout replier" : "Tout déplier"}</button></header>
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
              <div className="completed-block-body"><div className="completed-table-scroll"><table><thead><tr><th>Athlète</th><th>Plongeons travaillés</th><th>Répétitions (fait / prévu)</th></tr></thead><tbody>{block.assignments.map(({ athlete }) => {
                const absent = athleteMap.get(athlete.id)?.status === "SKIPPED";
                const athleteDiveLogs = session.diveLogs.filter((log) => log.athleteId === athlete.id && poolIds.has(log.poolDiveId));
                const athleteExercises = session.exerciseLogs.filter((log) => log.athleteId === athlete.id && block.drylandExercises.some((item) => item.exerciseId === log.exerciseId));
                const athleteActual = block.type === "POOL" ? athleteDiveLogs.reduce((sum, log) => sum + log.repetitionsCompleted, 0) : block.type === "DRYLAND" ? athleteExercises.filter((log) => log.completed).reduce((sum, log) => { const item = block.drylandExercises.find((exercise) => exercise.exerciseId === log.exerciseId); return sum + (item?.sets ?? 1) * (item?.reps ?? 0); }, 0) : 0;
                const completedDiveIds = new Set(athleteDiveLogs.filter((log) => log.repetitionsCompleted > 0).map((log) => log.poolDiveId));
                const plannedDives = block.poolTraining?.sections.flatMap((section) => section.dives) ?? [];
                return <tr key={athlete.id} className={absent ? "completed-athlete-absent" : ""}><td><strong>{athlete.user.firstName} {athlete.user.lastName}</strong>{absent && <span className="completed-absent-status">Absent</span>}</td><td>{block.type === "POOL" ? <span className="completed-dive-chips">{plannedDives.map((dive) => <span className={completedDiveIds.has(dive.id) ? "is-complete" : ""} key={dive.id}>{completedDiveIds.has(dive.id) && <CircleCheck />}{dive.diveCode}</span>)}</span> : block.type === "DRYLAND" ? block.drylandExercises.map((item) => item.exercise.name).join(", ") : "—"}</td><td>{absent ? "Absent" : `${athleteActual} / ${blockPoolPlan + blockDryPlan}`}</td></tr>;
              })}</tbody></table></div></div>
            </details>;
          })}</div>
        </details>)}
      </section>
      <section className="completed-panel completed-followup" id="follow-up"><header className="completed-panel-head"><h2><Flag /> À reprendre à la prochaine séance</h2><button type="button" onClick={() => { setEditingSummary(true); setTimeout(() => document.getElementById("completed-summary-editor")?.scrollIntoView({ behavior: "smooth" }), 0); }}>＋ Ajouter un point</button></header>{attention.map((athlete) => <div className="completed-followup-row" key={athlete.id}><span className="completed-checkbox" /><span><strong>{athlete.nextStep}</strong><small>Pour {athlete.firstName} {athlete.lastName}</small></span></div>)}{attention.length === 0 && <p className="completed-empty">Aucun point à reprendre pour le moment.</p>}</section>
      <section className="completed-panel completed-summary-editor" id="completed-summary-editor" hidden={!editingSummary}><h2><NotebookText /> Résumé et points à reprendre</h2><form id="completed-summary-form" action={updateCompletedSessionSummary}><input type="hidden" name="sessionId" value={session.id} /><textarea name="summary" defaultValue={session.notes ?? ""} maxLength={5000} placeholder="Ajoutez le bilan du groupe et les points à reprendre à la prochaine séance." /></form></section>
      <footer className="completed-footer"><Link href="/coach/sessions"><ArrowLeft /> Retour aux séances</Link><button className="completed-save" type="submit" form="completed-summary-form"><Check /> Enregistrer le résumé</button></footer>
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

