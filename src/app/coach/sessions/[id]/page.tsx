import Link from "next/link";
import { AlertTriangle, CalendarDays, Check, CheckCircle2, ChevronRight, Clock3, Copy, Edit, FileText, Layers3, MapPin, MoreVertical, NotebookText, Play, Printer, Save, Send, Trash2, Users, Waves, XCircle } from "lucide-react";
import { deleteTrainingSession, duplicateTrainingSession, markAthleteSessionCompleted, markTrainingSessionNotDone, publishTrainingSession, saveSessionAsTemplate, setAthleteSessionAbsence, startTrainingSession } from "@/app/coach/sessions/actions";
import { PoolSectionEditor } from "./pool-section-editor";
import { DraftSessionBlocks } from "./draft-session-blocks";
import { CompletedSessionOverview } from "./completed-session-overview";
import { AthleteAvatarGroup } from "@/components/coach/athlete-avatar-group";
import { PoolProgressTracker } from "@/components/coach/pool-progress-tracker";
import { CoachShell } from "@/components/coach/coach-shell";
import { resolveAvatarUrls } from "@/lib/avatar-storage";
import { BlockTypeBadge } from "@/components/training/block-type-badge";
import { StatusPill } from "@/components/training/status-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAthleteAverageGoldenRepsByTraining, getAthleteAverageRepsByTraining, getCoachSession } from "@/lib/coach-session";
import { formatMontrealDate, formatMontrealTime } from "@/lib/timezone";
import { countPoolContexts } from "@/lib/pool-list";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCoachSession(id);
  if (session.status === "DRAFT" || session.status === "READY") {
    const [planningEventRows, coachRows, athleteCountRows] = await Promise.all([
      query<{ location: string | null }>(`SELECT location FROM "PlanningEvent" WHERE id=$1`, [session.planningEventId]),
      query<{ firstName: string; lastName: string }>(`SELECT u."firstName",u."lastName" FROM "Coach" c JOIN "User" u ON u.id=c."userId" WHERE c.id=$1`, [session.coachId]),
      query<{ count: number | string }>(`SELECT count(*) AS count FROM "Athlete" WHERE "groupId"=$1 AND active=true`, [session.week.group.id])
    ]);
    const coach = coachRows.rows[0];
    return <DraftSessionOverview session={session} published={session.status === "READY"} location={planningEventRows.rows[0]?.location ?? null} coachName={coach ? `${coach.firstName} ${coach.lastName}` : "À confirmer"} groupAthleteCount={Number(athleteCountRows.rows[0]?.count ?? 0)} />;
  }
  if (session.status === "COMPLETED") {
    const [coachNoteRows, timingRows] = await Promise.all([
      query<{ athleteId: string; note: string }>(`SELECT "athleteId",note FROM "CoachAthleteSessionNote" WHERE "sessionId"=$1`, [session.id]),
      query<{ athleteId: string; blockId: string; closedAt: Date | null }>(`SELECT "athleteId","blockId","closedAt" FROM "AthleteBlockTiming" WHERE "blockId"=ANY($1::text[])`, [session.blocks.map((block) => block.id)])
    ]);
    return <CoachShell active="Seances"><CompletedSessionOverview session={session} coachNotes={coachNoteRows.rows} timings={timingRows.rows} /></CoachShell>;
  }
  const coachNotes = (await query<{athleteId:string;note:string}>(`SELECT "athleteId",note FROM "CoachAthleteSessionNote" WHERE "sessionId"=$1`, [session.id])).rows;
  const rawAthletes = session.blocks.flatMap((block) =>
    block.assignments.map((assignment) => ({
      id: assignment.athlete.id,
      firstName: assignment.athlete.user.firstName,
      lastName: assignment.athlete.user.lastName,
      avatar: assignment.athlete.user.avatar
    }))
  );
  const distinctAthletes = Array.from(new Map(rawAthletes.map((athlete) => [athlete.id, athlete])).values());
  const athleteAvatarUrls = await resolveAvatarUrls(distinctAthletes.map((athlete) => athlete.avatar));
  const uniqueAthletes = distinctAthletes.map((athlete, index) => ({ ...athlete, avatar: athleteAvatarUrls[index] }));
  const athleteAverageReps = await getAthleteAverageRepsByTraining(uniqueAthletes.map((athlete) => athlete.id), session.id);
  const athleteAverageGoldenReps = await getAthleteAverageGoldenRepsByTraining(uniqueAthletes.map((athlete) => athlete.id), session.id);
  const hasStarted =
    session.completions.some((completion) => completion.startedAt || completion.status !== "NOT_STARTED") ||
    session.diveLogs.length > 0 ||
    session.exerciseLogs.length > 0;
  const athleteComparisons = buildAthleteComparisons(session, athleteAverageReps);
  const resultSummary = summarizeResults(athleteComparisons);
  const evaluationBlock = session.blocks.find((block) => block.competitionEvaluation);
  const competitionEvaluationMoment = session.competitionEvaluationAtStart
    ? "Au début de l’entraînement"
    : evaluationBlock
      ? `Pendant le bloc « ${evaluationBlock.title} »`
      : null;
  const firstPoolSectionId = session.blocks.flatMap((block) => block.poolTraining?.sections ?? [])[0]?.id;
  const lastStartedDiveByAthlete = new Map<string, { diveId: string; incomplete: boolean }>();
  for (const block of session.blocks) {
    for (const section of block.poolTraining?.sections ?? []) {
      const multiplier = Math.max(1, countPoolContexts(section.label ?? section.height));
      for (const assignment of block.assignments) {
        for (const dive of section.dives) {
          const log = session.diveLogs.find((item) => item.athleteId === assignment.athleteId && item.poolDiveId === dive.id);
          const completed = log?.repetitionsCompleted ?? 0;
          if (completed > 0) {
            lastStartedDiveByAthlete.set(assignment.athleteId, {
              diveId: dive.id,
              incomplete: completed < dive.repetitions * multiplier
            });
          }
        }
      }
    }
  }
  const activeDiveIds = Object.fromEntries(
    Array.from(lastStartedDiveByAthlete.entries())
      .filter(([, state]) => state.incomplete)
      .map(([athleteId, state]) => [athleteId, state.diveId])
  );

  return (
    <CoachShell active="Seances">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <StatusPill status={session.status} />
          <h1 className="mt-2 text-3xl font-black">{session.title}</h1>
        </div>
        <div className="flex gap-2">
          <form action={duplicateTrainingSession}>
            <input type="hidden" name="sessionId" value={session.id} />
            <Button type="submit" variant="outline"><Copy className="h-4 w-4" /> Dupliquer</Button>
          </form>
          {hasStarted ? (
            <Button variant="outline" disabled title="Modification bloquee apres demarrage"><AlertTriangle className="h-4 w-4" /> Modification bloquee</Button>
          ) : (
            <Button asChild variant="outline"><Link href={`/coach/sessions/${session.id}/edit`}><Edit className="h-4 w-4" /> Modifier</Link></Button>
          )}
          <Button asChild><Link href={`/coach/sessions/${session.id}/print`}><Printer className="h-4 w-4" /> Imprimer</Link></Button>
          {session.status !== "NOT_DONE" && session.status !== "CANCELLED" && (
            <form action={markTrainingSessionNotDone}>
              <input type="hidden" name="sessionId" value={session.id} />
              <Button type="submit" variant="outline"><XCircle className="h-4 w-4" /> Non faite</Button>
            </form>
          )}
          <form action={deleteTrainingSession}>
            <input type="hidden" name="sessionId" value={session.id} />
            <Button type="submit" variant="outline" title={hasStarted ? "Supprimer la seance et ses donnees athletes" : "Supprimer la seance"}><Trash2 className="h-4 w-4" /> Supprimer</Button>
          </form>
        </div>
      </div>
      {hasStarted && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-[var(--color-action)]/30 bg-[var(--color-action)]/10 p-3 text-sm font-semibold text-[var(--color-action-strong)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Seance deja commencee: la modification est bloquee pour garder les donnees realisees comparables au plan original. La suppression reste possible et effacera les donnees athletes associees.
        </div>
      )}
      <div className={`mb-4 flex items-start gap-3 rounded-2xl border p-4 ${competitionEvaluationMoment ? "border-[var(--color-success)]/30 bg-[var(--color-success)]/10" : "border-[var(--color-border)] bg-white"}`}>
        {competitionEvaluationMoment
          ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-success)]" />
          : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-ink-muted)]" />}
        <div>
          <p className="font-black">Évaluation de la liste de compétition : {competitionEvaluationMoment ? "prévue" : "non prévue"}</p>
          {competitionEvaluationMoment && <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{competitionEvaluationMoment}. Les athlètes pourront évaluer les plongeons de leur liste de compétition.</p>}
        </div>
      </div>
      <Card className="mb-4">
        <CardHeader><CardTitle>Enregistrer comme modele</CardTitle></CardHeader>
        <CardContent>
          <form action={saveSessionAsTemplate} className="grid gap-3 md:grid-cols-[1fr_auto]">
            <input type="hidden" name="sessionId" value={session.id} />
            <input name="name" defaultValue={session.title} className="h-11 rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm font-semibold focus:outline-none focus:shadow-[var(--focus-ring)]" required />
            <Button type="submit" variant="action"><Save className="h-4 w-4" /> Sauver le modele</Button>
          </form>
        </CardContent>
      </Card>
      <Card className="mb-4">
        <CardHeader><CardTitle>Présences</CardTitle><p className="text-sm text-[var(--color-ink-muted)]">Coche les athlètes absents à cette séance.</p></CardHeader>
        <CardContent>
          <details>
          <summary className="mb-3 cursor-pointer text-sm font-bold text-[var(--color-ink-muted)]">Liste des athlètes ({uniqueAthletes.length})</summary>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {uniqueAthletes.map((athlete) => {
            const absent = session.absences.some((absence) => absence.athleteId === athlete.id);
            return <form key={athlete.id} action={setAthleteSessionAbsence} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--color-border)] p-3">
              <span className="font-bold">{athlete.firstName} {athlete.lastName}</span>
              <input type="hidden" name="sessionId" value={session.id} />
              <input type="hidden" name="athleteId" value={athlete.id} />
              <div className="flex items-center gap-2"><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="absent" defaultChecked={absent} /> Absent</label><Button type="submit" size="sm" variant="outline">Enregistrer</Button></div>
            </form>;
          })}
          {uniqueAthletes.length === 0 && <p className="text-sm text-[var(--color-ink-muted)]">Aucun athlète assigné à cette séance.</p>}
          </div>
          </details>
        </CardContent>
      </Card>
      <Card className="mb-4">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Resultats de seance</CardTitle>
              <p className="text-sm text-[var(--color-ink-muted)]">Prevu vs realise lisible des que les athletes enregistrent leur seance.</p>
            </div>
            {resultSummary.hasResults ? <Badge variant="success">Retours disponibles</Badge> : <Badge variant="warning">En attente des athletes</Badge>}
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-3 md:grid-cols-6">
            <ResultSummaryTile label="Athletes termines" value={`${resultSummary.completedAthletes}/${resultSummary.totalAthletes}`} tone={resultSummary.completedAthletes === resultSummary.totalAthletes && resultSummary.totalAthletes > 0 ? "success" : "neutral"} />
            <ResultSummaryTile label="Reps dryland" value={`${resultSummary.actualDrylandReps}/${resultSummary.plannedDrylandReps}`} tone="neutral" />
            <ResultSummaryTile label="Reps piscine" value={`${resultSummary.actualPoolReps}/${resultSummary.plannedPoolReps}`} tone="neutral" />
            <ResultSummaryTile label="Progression dryland" value={`${resultSummary.drylandProgress}%`} tone={progressTone(resultSummary.drylandProgress, resultSummary.hasResults)} />
            <ResultSummaryTile label="Progression piscine" value={`${resultSummary.poolProgress}%`} tone={progressTone(resultSummary.poolProgress, resultSummary.hasResults)} />
            <ResultSummaryTile label="A revoir" value={resultSummary.needsAttention} tone={resultSummary.needsAttention > 0 ? "warning" : "success"} />
          </div>
          <div className="space-y-3">
            {athleteComparisons.map((athlete) => (
              <div key={athlete.id} className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-black">{athlete.name}</div>
                    <div className="mt-1 text-sm text-[var(--color-ink-muted)]">
                      {athlete.completedExercises}/{athlete.plannedExercises} exercices completes · {athlete.actualDrylandReps}/{athlete.plannedDrylandReps} reps dryland · {athlete.actualPoolReps}/{athlete.plannedPoolReps} reps piscine
                    </div>
                  </div>
                  <StatusPill status={athlete.status} />
                </div>
                {athlete.status !== "COMPLETED" && (
                  <form action={markAthleteSessionCompleted} className="mt-3">
                    <input type="hidden" name="sessionId" value={session.id} />
                    <input type="hidden" name="athleteId" value={athlete.id} />
                    <Button type="submit" size="sm" variant="outline"><CheckCircle2 className="h-4 w-4" /> Marquer comme terminée</Button>
                  </form>
                )}
                <div className="mt-3 grid gap-2 md:grid-cols-5">
                  <ComparisonMetric label="Exercices" value={`${athlete.completedExercises}/${athlete.plannedExercises}`} />
                  <ComparisonMetric label="Dryland" value={`${athlete.actualDrylandReps}/${athlete.plannedDrylandReps}`} />
                  <ComparisonMetric label="Piscine" value={`${athlete.actualPoolReps}/${athlete.plannedPoolReps}`} />
                  <ComparisonMetric label="Moy. volume piscine / entraînement" value={`${athlete.averageRepsPerTraining} reps`} />
                  <ComparisonMetric label="Rating" value={athlete.rating} />
                  <ComparisonMetric label="Progression" value={`${athlete.progress}%`} />
                  <ComparisonMetric label="Golden reps" value={session.diveLogs.filter((log) => log.athleteId === athlete.id).reduce((sum, log) => sum + log.goldenRepetitions, 0)} />
                  <ComparisonMetric label="Moy. golden / entraînement" value={athleteAverageGoldenReps.get(athlete.id) ?? 0} />
                </div>
                {athlete.notes.length > 0 ? (
                  <details className="mt-3 rounded-2xl bg-[var(--color-surface-raised)] p-3">
                    <summary className="cursor-pointer font-bold">Commentaires ({athlete.notes.length})</summary>
                    <div className="mt-2 space-y-2">
                    {athlete.notes.map((note) => (
                      <div key={note.key} className="flex gap-2 rounded-2xl bg-[var(--color-surface-raised)] p-3 text-sm text-[var(--color-ink-muted)]">
                        <NotebookText className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-brand-strong)]" />
                        <span><span className="font-black text-[var(--color-ink)]">{note.label}: </span>{note.text}</span>
                      </div>
                    ))}
                    </div>
                  </details>
                ) : (
                  <div className="mt-3 flex items-center gap-2 rounded-2xl bg-[var(--color-surface-raised)] p-3 text-sm font-semibold text-[var(--color-ink-muted)]">
                    <CheckCircle2 className="h-4 w-4 text-[var(--color-success)]" />
                    Aucune note athlete.
                  </div>
                )}
              </div>
            ))}
            {athleteComparisons.length === 0 && <p className="text-sm text-[var(--color-ink-muted)]">Aucun athlete assigne a cette seance.</p>}
          </div>
        </CardContent>
      </Card>
      <div className="space-y-4">
        {session.blocks.map((block) => {
          const assignedIds = block.assignments.map((assignment) => assignment.athleteId);

          return (
            <Card key={block.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <BlockTypeBadge type={block.type} />
                    <CardTitle className="mt-2">{block.title}</CardTitle>
                  </div>
                  <div className="flex items-center gap-3"><span className="text-sm font-semibold text-[var(--color-ink-muted)]">Attribue a {assignedIds.length}</span><AthleteAvatarGroup ids={assignedIds} athletes={uniqueAthletes} /></div>
                </div>
              </CardHeader>
              <CardContent>
                {block.description && <p className="mb-4 whitespace-pre-line text-sm leading-6 text-[var(--color-ink-muted)]">{block.description}</p>}
                {block.poolTraining ? block.assignments.flatMap(({ athlete }) => {
                  const note = coachNotes.find((item) => item.athleteId === athlete.id)?.note;
                  return note ? [<div key={`coach-note-${athlete.id}`} className="mb-3 rounded-xl border border-[var(--color-action)]/25 bg-[var(--color-action)]/5 p-3"><p className="text-xs font-black uppercase text-[var(--color-action-strong)]">Note personnelle · {athlete.user.firstName} · visible par le coach seulement</p><p className="mt-1 whitespace-pre-line text-sm">{note}</p></div>] : [];
                }) : null}
                {block.drylandExercises.length > 0 && <div className="grid gap-2 md:grid-cols-3">{block.drylandExercises.map((item) => <div key={`${item.exerciseId}-${item.order}`} className="rounded-2xl bg-[var(--color-surface-raised)] p-3"><div className="font-bold">{item.exercise.name}</div><div className="text-sm text-[var(--color-ink-muted)]">{item.sets ?? 1} x {item.reps ?? `${item.duration ?? 30} sec`}</div></div>)}</div>}
                {block.poolTraining && <details className="mt-3">
                  <summary className="cursor-pointer rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm font-bold text-[var(--color-ink-muted)]">Liste de plongeons ({block.poolTraining.sections.reduce((sum, section) => sum + section.dives.length, 0)} plongeons · {block.estimatedVolume} répétitions)</summary>
                  <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)]"><table className="w-full min-w-[680px] text-sm"><thead className="bg-[var(--color-navy)] text-left text-white"><tr><th className="p-3">Hauteur(s)</th><th className="p-3">Plongeons</th><th className="p-3">Répétitions</th><th className="p-3 text-right">Total</th><th className="p-3 text-center">Modifier</th></tr></thead><tbody>{block.poolTraining.sections.map((section) => {
                    const context = section.label ?? poolHeightContext(section.height);
                    const multiplier = Math.max(1, countPoolContexts(context));
                    const actualCorrections = session.completions
                      .filter((completion) => completion.status === "COMPLETED" && block.assignments.some((assignment) => assignment.athleteId === completion.athleteId))
                      .flatMap((completion) => section.dives.flatMap((dive) => {
                        const log = session.diveLogs.find((item) => item.athleteId === completion.athleteId && item.poolDiveId === dive.id);
                        return log?.actualDiveCode ? [{ athleteId: completion.athleteId, firstName: completion.athlete.user.firstName, diveId: dive.id, diveCode: log.actualDiveCode, repetitions: log.repetitionsCompleted, plannedRepetitions: dive.repetitions * multiplier }] : [];
                      }));
                    return <tr key={section.id} className="border-t border-[var(--color-border)]">
                      <td className="p-3 font-black">{context}</td>
                      <td className="p-3 font-bold">
                        <div className="flex flex-wrap gap-x-2">{section.dives.map((dive) => <span key={dive.id} className={dive.postSessionModified ? "text-red-600" : ""}>{dive.diveCode}</span>)}</div>
                        {actualCorrections.length > 0 && <div className="mt-2 space-y-1 text-xs font-bold text-red-600">
                          {actualCorrections.map((correction) => <div key={`${correction.athleteId}-${correction.diveId}`}>{correction.firstName} · {correction.repetitions}/{correction.plannedRepetitions} · {correction.diveCode}</div>)}
                        </div>}
                      </td>
                      <td className="p-3"><div className="flex flex-wrap gap-x-2">{section.dives.map((dive) => <span key={dive.id} className={dive.postSessionModified ? "text-red-600 font-bold" : ""}>{dive.repetitions}</span>)}</div></td>
                      <td className="p-3 text-right font-black">{multiplier * section.dives.reduce((sum, dive) => sum + dive.repetitions, 0)}</td>
                      <td className="p-2 text-center"><PoolSectionEditor sessionId={session.id} sectionId={section.id} context={context} dives={section.dives.map(({ id, diveCode, repetitions }) => ({ id, diveCode, repetitions }))} actualCorrections={actualCorrections} canEditPlan={(session.status === "READY" || session.status === "COMPLETED") && (session.status === "COMPLETED" || !hasStarted || session.completions.some((completion) => completion.status === "IN_PROGRESS" || completion.status === "COMPLETED"))} /></td>
                    </tr>;
                  })}</tbody><tfoot className="border-t-2 border-[var(--color-navy)] bg-[var(--color-surface-raised)] font-black"><tr><td className="p-3" colSpan={3}>Total général</td><td className="p-3 text-right">{block.estimatedVolume}</td><td /></tr></tfoot></table></div>
                </details>}
                  {block.poolTraining?.sections.map((section) => (
                    <div key={`pool-tools-${section.id}`} className="mt-4">
                    <PoolProgressTracker
                      key={`progress-${section.id}`}
                      sectionLabel={section.label ?? section.height}
                      showLegend={section.id === firstPoolSectionId}
                      activeDiveIds={activeDiveIds}
                      athletes={block.assignments.map(({ athlete }) => ({ id: athlete.id, firstName: athlete.user.firstName, lastName: athlete.user.lastName }))}
                      dives={section.dives.map(({ id, diveCode, repetitions }) => ({ id, diveCode, repetitions }))}
                      logs={session.diveLogs.map(({ athleteId, poolDiveId, repetitionsCompleted, goldenRepetitions }) => ({ athleteId, poolDiveId, repetitionsCompleted, goldenRepetitions }))}
                    />
                    </div>
                  ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </CoachShell>
  );
}

type DraftOverviewSession = Awaited<ReturnType<typeof getCoachSession>>;

function DraftSessionOverview({ session, published, location, coachName, groupAthleteCount }: { session: DraftOverviewSession; published: boolean; location: string | null; coachName: string; groupAthleteCount: number }) {
  const blocks = [...session.blocks].sort((a, b) => a.position - b.position);
  const athletes = new Set(blocks.flatMap((block) => block.assignments.map((assignment) => assignment.athleteId)));
  const plannedDiveReps = blocks.reduce((total, block) => total + (block.poolTraining?.sections.reduce((sectionTotal, section) => sectionTotal + Math.max(1, countPoolContexts(section.label ?? section.height)) * section.dives.reduce((sum, dive) => sum + dive.repetitions, 0), 0) ?? 0), 0);
  const isReadyToPublish = athletes.size > 0 && blocks.length > 0 && plannedDiveReps > 0;
  const poolReps = blocks.filter((block) => block.type === "POOL").reduce((total, block) => total + (block.estimatedVolume ?? 0), 0);

  return <CoachShell active="Seances">
    <div className="draft-overview">
      <div className="draft-crumb"><Link href="/coach/sessions">Séances</Link><ChevronRight />{session.title}</div>
      <header className="draft-head">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1>{session.title}</h1><span className={`draft-status ${published ? "draft-status-published" : ""}`}><span /> {published ? "Publiée" : "Brouillon"}</span></div>
          <div className="draft-meta"><span><CalendarDays />{formatMontrealDate(session.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span><span><Clock3 />{formatMontrealTime(session.date)} – {formatMontrealTime(new Date(session.date.getTime() + session.duration * 60_000))} ({session.duration >= 60 ? `${Math.floor(session.duration / 60)} h ${String(session.duration % 60).padStart(2, "0")}` : `${session.duration} min`})</span><span><Users />{session.week.group.name}</span>{location && <span><MapPin />{location}</span>}</div>
        </div>
        <div className="draft-actions"><details className="draft-more"><summary aria-label="Autres actions"><MoreVertical /></summary><div><Link href={`/coach/sessions/${session.id}/print`}><Printer /> Imprimer</Link><form action={duplicateTrainingSession}><input type="hidden" name="sessionId" value={session.id} /><button><Copy /> Dupliquer</button></form><form action={deleteTrainingSession}><input type="hidden" name="sessionId" value={session.id} /><button className="text-red-600"><Trash2 /> Supprimer la séance</button></form></div></details>
          <Button asChild variant="outline"><Link href={`/coach/sessions/${session.id}/edit`}><Edit /> Modifier</Link></Button>
          {published ? <form action={startTrainingSession}><input type="hidden" name="sessionId" value={session.id} /><Button type="submit" variant="action"><Play /> Démarrer la séance</Button></form> : <form action={publishTrainingSession}><input type="hidden" name="sessionId" value={session.id} /><Button type="submit" variant="action"><Send /> Publier la séance</Button></form>}
        </div>
      </header>
      <div className="draft-layout">
        <main className="draft-main">
          <section className="draft-stats" aria-label="Résumé de la séance">
            <DraftStat icon={<Users />} value={athletes.size} label="athlètes" />
            <DraftStat icon={<Waves />} value={poolReps} label="plongeons planifiés" />
            <DraftStat icon={<Clock3 />} value={`${Math.floor(session.duration / 60)} h ${String(session.duration % 60).padStart(2, "0")}`} label="Durée estimée" />
            <DraftStat icon={<Layers3 />} value={blocks.length} label="blocs" detail={`${blocks.filter((block) => block.type === "WARMUP").length} échauffement, ${blocks.filter((block) => block.type === "DRYLAND").length} dryland, ${blocks.filter((block) => block.type === "POOL").length} piscine`} />
          </section>
          <h2 className="draft-plan-title" id="draft-plan">Plan de la séance</h2>
          <DraftSessionBlocks blocks={blocks} />
        </main>
        <aside className="draft-sidebar">
          <section className="draft-side-card"><h2>Détails de la séance <span className={`draft-status ${published ? "draft-status-published" : ""}`}><span /> {published ? "Publiée" : "Brouillon"}</span></h2><DraftDetail icon={<CalendarDays />} label="Date" value={formatMontrealDate(session.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} /><DraftDetail icon={<Clock3 />} label="Heure" value={`${formatMontrealTime(session.date)} – ${formatMontrealTime(new Date(session.date.getTime() + session.duration * 60_000))}`} sub={`Durée : ${session.duration} min`} /><DraftDetail icon={<Users />} label="Groupe" value={session.week.group.name} sub={`${athletes.size} athlètes`} /><DraftDetail icon={<MapPin />} label="Lieu" value={location || "À confirmer"} /><DraftDetail icon={<Waves />} label="Entraîneur" value={coachName} /></section>
          <section className="draft-side-card"><h2><FileText /> {published ? "Préparation" : "Liste de vérification avant publication"}</h2>{published && <div className="draft-ready-summary"><div className="draft-progress-ring"><span>100%</span></div><span><strong>Séance prête</strong><small>Tous les éléments sont configurés pour démarrer la séance.</small></span></div>}<DraftCheck label="Groupe assigné" value={`${athletes.size}/${groupAthleteCount || athletes.size} athlètes`} ok={athletes.size > 0 && athletes.size >= groupAthleteCount} /><DraftCheck label="Blocs configurés" value={`${blocks.length} blocs`} ok={blocks.length > 0} /><DraftCheck label="Listes de plongeons prêtes" value={`${plannedDiveReps} plongeons`} ok={plannedDiveReps > 0} />{published ? <><DraftCheck label="Lieu et heure définis" value={location ? "Définis" : "Lieu à confirmer"} ok={Boolean(location)} /><DraftCheck label="Séance publiée" value="" ok /></> : <><DraftCheck label="Date définie" value={formatMontrealDate(session.date)} ok /><div className={`draft-ready ${isReadyToPublish ? "" : "draft-incomplete"}`}><CheckCircle2 /><span><strong>{isReadyToPublish ? "Prête à publier" : "À compléter"}</strong><small>{isReadyToPublish ? "Vous pouvez publier la séance pour la rendre disponible à l’équipe." : "Ajoutez un groupe, des blocs et des plongeons avant de publier."}</small></span></div></>}</section>
          <section className="draft-side-card"><h2><NotebookText /> Notes</h2><p className="draft-note-text">{session.notes || "Aucune note pour cette séance."}</p><Button asChild variant="outline"><Link href={`/coach/sessions/${session.id}/edit`}>Ajouter une note</Link></Button></section>
          <section className="draft-side-card draft-links"><h2><Layers3 /> Liens rapides</h2><Link href="/coach/planning"><CalendarDays /> Voir dans le calendrier</Link><Link href={`/coach/sessions/${session.id}/edit`}><Copy /> Dupliquer la séance</Link><Link href={`/coach/sessions/${session.id}/print`}><Printer /> Exporter / imprimer</Link></section>
        </aside>
      </div>
    </div>
  </CoachShell>;
}

function DraftStat({ icon, value, label, detail }: { icon: React.ReactNode; value: string | number; label: string; detail?: string }) {
  return <div className="draft-stat"><span className="draft-stat-icon">{icon}</span><span><strong>{value}</strong><small>{label}{detail && <em>{detail}</em>}</small></span></div>;
}

function DraftDetail({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return <div className="draft-detail"><span>{icon}{label}</span><strong>{value}{sub && <small>{sub}</small>}</strong></div>;
}

function DraftCheck({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return <div className="draft-check"><span className={ok ? "ok" : "todo"}>{ok ? <Check /> : <AlertTriangle />}</span><strong>{label}</strong><small>{value}</small></div>;
}

function ComparisonMetric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-2xl bg-[var(--color-surface-raised)] p-3"><div className="text-xs font-bold uppercase text-[var(--color-ink-muted)]">{label}</div><div className="mt-1 text-xl font-black">{value}</div></div>;
}

function ResultSummaryTile({ label, value, tone }: { label: string; value: string | number; tone: "success" | "warning" | "neutral" }) {
  const toneClass =
    tone === "success"
      ? "border-[var(--color-success)]/25 bg-[var(--color-success-soft)]"
      : tone === "warning"
        ? "border-[var(--color-action)]/25 bg-[var(--color-action)]/10"
        : "border-[var(--color-border)] bg-[var(--color-surface-raised)]";

  return (
    <div className={`rounded-[var(--radius-panel)] border p-4 ${toneClass}`}>
      <div className="text-xs font-black uppercase text-[var(--color-ink-muted)]">{label}</div>
      <div className="mt-2 text-3xl font-black text-[var(--color-ink)]">{value}</div>
    </div>
  );
}

function poolHeightContext(height: string) {
  if (height === "ONE_METER") return "1m";
  if (height === "THREE_METER") return "3m";
  if (height === "PLATFORM") return "Plateforme";
  return "Section personnalisée";
}

function progressTone(progress: number, hasResults: boolean): "success" | "warning" | "neutral" {
  return progress >= 85 ? "success" : hasResults ? "warning" : "neutral";
}

type CoachSession = Awaited<ReturnType<typeof getCoachSession>>;

function buildAthleteComparisons(session: CoachSession, athleteAverageReps: Map<string, number>) {
  const athletes = new Map<
    string,
    {
      id: string;
      name: string;
      status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED";
      plannedExercises: number;
      completedExercises: number;
      plannedDrylandReps: number;
      actualDrylandReps: number;
      plannedPoolReps: number;
      actualPoolReps: number;
      averageRepsPerTraining: number;
      ratings: string[];
      notes: Array<{ key: string; label: string; text: string }>;
      exerciseRepPlan: Map<string, number>;
    }
  >();

  const ensureAthlete = (athlete: { id: string; user: { firstName: string; lastName: string } }) => {
    const existing = athletes.get(athlete.id);
    if (existing) return existing;

    const created = {
      id: athlete.id,
      name: `${athlete.user.firstName} ${athlete.user.lastName}`,
      status: "NOT_STARTED" as const,
      plannedExercises: 0,
      completedExercises: 0,
      plannedDrylandReps: 0,
      actualDrylandReps: 0,
      plannedPoolReps: 0,
      actualPoolReps: 0,
      averageRepsPerTraining: 0,
      ratings: [] as string[],
      notes: [] as Array<{ key: string; label: string; text: string }>,
      exerciseRepPlan: new Map<string, number>()
    };
    athletes.set(athlete.id, created);
    return created;
  };

  for (const block of session.blocks) {
    const exerciseReps = block.drylandExercises.reduce((sum, item) => sum + plannedExerciseReps(item.sets, item.reps), 0);
    const poolReps = block.poolTraining?.sections.reduce(
      (sectionSum, section) => Math.max(1, countPoolContexts(section.label ?? section.height)) * section.dives.reduce((diveSum, dive) => diveSum + dive.repetitions, 0) + sectionSum,
      0
    ) ?? 0;

    for (const assignment of block.assignments) {
      const athlete = ensureAthlete(assignment.athlete);
      athlete.plannedExercises += block.drylandExercises.length;
      athlete.plannedDrylandReps += exerciseReps;
      athlete.plannedPoolReps += poolReps;

      for (const item of block.drylandExercises) {
        athlete.exerciseRepPlan.set(item.exerciseId, (athlete.exerciseRepPlan.get(item.exerciseId) ?? 0) + plannedExerciseReps(item.sets, item.reps));
      }
    }
  }

  for (const completion of session.completions) {
    const athlete = ensureAthlete(completion.athlete);
    athlete.status = completion.status;
    if (completion.rating) athlete.ratings.push(completion.rating);
    if (completion.note) athlete.notes.push({ key: `completion-${completion.athleteId}-${completion.sessionId}`, label: "Ressenti final", text: completion.note });
  }

  for (const log of session.exerciseLogs) {
    const athlete = ensureAthlete(log.athlete);
    if (log.completed) {
      athlete.completedExercises += 1;
      athlete.actualDrylandReps += athlete.exerciseRepPlan.get(log.exerciseId) ?? 0;
    }
    if (log.rating) athlete.ratings.push(log.rating);
    if (log.note) athlete.notes.push({ key: `exercise-${log.id}`, label: log.exercise.name, text: log.note });
  }

  for (const log of session.diveLogs) {
    const athlete = ensureAthlete(log.athlete);
    athlete.actualPoolReps += log.repetitionsCompleted;
    if (log.rating) athlete.ratings.push(log.rating);
    if (log.note) athlete.notes.push({ key: `dive-${log.id}`, label: `${log.poolDive.diveCode} ${log.poolDive.diveName}`, text: log.note });
  }

  return Array.from(athletes.values())
    .map((athlete) => {
      const plannedReps = athlete.plannedDrylandReps + athlete.plannedPoolReps;
      const actualReps = athlete.actualDrylandReps + athlete.actualPoolReps;
      const progress = plannedReps > 0 ? Math.round((actualReps / plannedReps) * 100) : 0;

      return {
        id: athlete.id,
        name: athlete.name,
        status: athlete.status,
        plannedExercises: athlete.plannedExercises,
        completedExercises: athlete.completedExercises,
        plannedDrylandReps: athlete.plannedDrylandReps,
        actualDrylandReps: athlete.actualDrylandReps,
        plannedPoolReps: athlete.plannedPoolReps,
        actualPoolReps: athlete.actualPoolReps,
        averageRepsPerTraining: athleteAverageReps.get(athlete.id) ?? 0,
        rating: mostFrequent(athlete.ratings) ?? "Aucun",
        notes: athlete.notes,
        progress: Math.min(100, progress)
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function summarizeResults(athletes: ReturnType<typeof buildAthleteComparisons>) {
  const totalAthletes = athletes.length;
  const completedAthletes = athletes.filter((athlete) => athlete.status === "COMPLETED").length;
  const plannedDrylandReps = athletes.reduce((sum, athlete) => sum + athlete.plannedDrylandReps, 0);
  const actualDrylandReps = athletes.reduce((sum, athlete) => sum + athlete.actualDrylandReps, 0);
  const plannedPoolReps = athletes.reduce((sum, athlete) => sum + athlete.plannedPoolReps, 0);
  const actualPoolReps = athletes.reduce((sum, athlete) => sum + athlete.actualPoolReps, 0);
  const hasResults = athletes.some((athlete) => athlete.actualDrylandReps > 0 || athlete.actualPoolReps > 0 || athlete.completedExercises > 0 || athlete.status !== "NOT_STARTED");
  const drylandProgress = plannedDrylandReps > 0 ? Math.min(100, Math.round((actualDrylandReps / plannedDrylandReps) * 100)) : 0;
  const poolProgress = plannedPoolReps > 0 ? Math.min(100, Math.round((actualPoolReps / plannedPoolReps) * 100)) : 0;
  const needsAttention = athletes.filter((athlete) => athlete.status !== "COMPLETED" || athlete.progress < 80).length;

  return { totalAthletes, completedAthletes, plannedDrylandReps, actualDrylandReps, plannedPoolReps, actualPoolReps, drylandProgress, poolProgress, hasResults, needsAttention };
}

function plannedExerciseReps(sets: number | null, reps: number | null) {
  return (sets ?? 1) * (reps ?? 0);
}

function mostFrequent(values: string[]) {
  if (values.length === 0) return null;

  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}
