import Link from "next/link";
import { AlertTriangle, CheckCircle2, Copy, Edit, NotebookText, Printer, Save } from "lucide-react";
import { duplicateTrainingSession, saveSessionAsTemplate } from "@/app/coach/sessions/actions";
import { AthleteAvatarGroup } from "@/components/coach/athlete-avatar-group";
import { CoachShell } from "@/components/coach/coach-shell";
import { BlockTypeBadge } from "@/components/training/block-type-badge";
import { StatusPill } from "@/components/training/status-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCoachSession } from "@/lib/coach-session";
import { formatMontrealDate } from "@/lib/timezone";

export const dynamic = "force-dynamic";

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCoachSession(id);
  const athletes = session.blocks.flatMap((block) =>
    block.assignments.map((assignment) => ({
      id: assignment.athlete.id,
      firstName: assignment.athlete.user.firstName,
      lastName: assignment.athlete.user.lastName,
      avatar: assignment.athlete.user.avatar
    }))
  );
  const uniqueAthletes = Array.from(new Map(athletes.map((athlete) => [athlete.id, athlete])).values());
  const hasStarted =
    session.completions.some((completion) => completion.startedAt || completion.status !== "NOT_STARTED") ||
    session.diveLogs.length > 0 ||
    session.exerciseLogs.length > 0;
  const athleteComparisons = buildAthleteComparisons(session);
  const resultSummary = summarizeResults(athleteComparisons);

  return (
    <CoachShell active="Seances">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <StatusPill status={session.status} />
          <h1 className="mt-2 text-3xl font-black">{session.title}</h1>
          <p className="text-[var(--color-ink-muted)]">{formatMontrealDate(session.date)} · {session.duration} min · {session.focus}</p>
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
        </div>
      </div>
      {hasStarted && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-[var(--color-action)]/30 bg-[var(--color-action)]/10 p-3 text-sm font-semibold text-[var(--color-action-strong)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Seance deja commencee: la modification est bloquee pour garder les donnees realisees comparables au plan original.
        </div>
      )}
      <Card className="mb-4">
        <CardHeader><CardTitle>Enregistrer comme modele</CardTitle></CardHeader>
        <CardContent>
          <form action={saveSessionAsTemplate} className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
            <input type="hidden" name="sessionId" value={session.id} />
            <input name="name" defaultValue={session.title} className="h-11 rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm font-semibold focus:outline-none focus:shadow-[var(--focus-ring)]" required />
            <input name="category" defaultValue={session.week.group.name} className="h-11 rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm font-semibold focus:outline-none focus:shadow-[var(--focus-ring)]" required />
            <Button type="submit" variant="action"><Save className="h-4 w-4" /> Sauver le modele</Button>
          </form>
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
          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <ResultSummaryTile label="Athletes termines" value={`${resultSummary.completedAthletes}/${resultSummary.totalAthletes}`} tone={resultSummary.completedAthletes === resultSummary.totalAthletes && resultSummary.totalAthletes > 0 ? "success" : "neutral"} />
            <ResultSummaryTile label="Realisation moyenne" value={`${resultSummary.averageProgress}%`} tone={resultSummary.averageProgress >= 85 ? "success" : resultSummary.hasResults ? "warning" : "neutral"} />
            <ResultSummaryTile label="Reps realisees" value={`${resultSummary.actualReps}/${resultSummary.plannedReps}`} tone="neutral" />
            <ResultSummaryTile label="A revoir" value={resultSummary.needsAttention} tone={resultSummary.needsAttention > 0 ? "warning" : "success"} />
          </div>
          <div className="space-y-3">
            {athleteComparisons.map((athlete) => (
              <div key={athlete.id} className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-black">{athlete.name}</div>
                    <div className="mt-1 text-sm text-[var(--color-ink-muted)]">
                      {athlete.completedExercises}/{athlete.plannedExercises} exercices completes · {athlete.actualReps}/{athlete.plannedReps} reps realisees
                    </div>
                  </div>
                  <StatusPill status={athlete.status} />
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-4">
                  <ComparisonMetric label="Exercices" value={`${athlete.completedExercises}/${athlete.plannedExercises}`} />
                  <ComparisonMetric label="Reps" value={`${athlete.actualReps}/${athlete.plannedReps}`} />
                  <ComparisonMetric label="Rating" value={athlete.rating} />
                  <ComparisonMetric label="Progression" value={`${athlete.progress}%`} />
                </div>
                {athlete.notes.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {athlete.notes.map((note) => (
                      <div key={note.key} className="flex gap-2 rounded-2xl bg-[var(--color-surface-raised)] p-3 text-sm text-[var(--color-ink-muted)]">
                        <NotebookText className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-brand-strong)]" />
                        <span><span className="font-black text-[var(--color-ink)]">{note.label}: </span>{note.text}</span>
                      </div>
                    ))}
                  </div>
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
                {block.drylandExercises.length > 0 && <div className="grid gap-2 md:grid-cols-3">{block.drylandExercises.map((item) => <div key={item.exerciseId} className="rounded-2xl bg-[var(--color-surface-raised)] p-3"><div className="font-bold">{item.exercise.name}</div><div className="text-sm text-[var(--color-ink-muted)]">{item.sets ?? 1} x {item.reps ?? `${item.duration ?? 30} sec`}</div></div>)}</div>}
                {block.poolTraining && <div className="grid gap-4 md:grid-cols-2">{block.poolTraining.sections.map((section) => <div key={section.id}><div className="mb-2 font-black">{(section.label ?? section.height).toUpperCase()}</div>{section.dives.map((dive) => <div key={dive.id} className="flex justify-between border-b border-[var(--color-border)] py-2"><span className="font-bold">{dive.diveCode} · {dive.diveName}</span><span>{dive.repetitions} reps</span></div>)}</div>)}</div>}
                <p className="mt-4 text-sm text-[var(--color-ink-muted)]">Athletes: {block.assignments.map((assignment) => `${assignment.athlete.user.firstName} ${assignment.athlete.user.lastName}`).join(", ")}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </CoachShell>
  );
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

type CoachSession = Awaited<ReturnType<typeof getCoachSession>>;

function buildAthleteComparisons(session: CoachSession) {
  const athletes = new Map<
    string,
    {
      id: string;
      name: string;
      status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED";
      plannedExercises: number;
      completedExercises: number;
      plannedReps: number;
      actualReps: number;
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
      plannedReps: 0,
      actualReps: 0,
      ratings: [] as string[],
      notes: [] as Array<{ key: string; label: string; text: string }>,
      exerciseRepPlan: new Map<string, number>()
    };
    athletes.set(athlete.id, created);
    return created;
  };

  for (const block of session.blocks) {
    const exerciseReps = block.drylandExercises.reduce((sum, item) => sum + plannedExerciseReps(item.sets, item.reps), 0);
    const poolReps = block.poolTraining?.sections.reduce((sectionSum, section) => sectionSum + section.dives.reduce((diveSum, dive) => diveSum + dive.repetitions, 0), 0) ?? 0;

    for (const assignment of block.assignments) {
      const athlete = ensureAthlete(assignment.athlete);
      athlete.plannedExercises += block.drylandExercises.length;
      athlete.plannedReps += exerciseReps + poolReps;

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
      athlete.actualReps += athlete.exerciseRepPlan.get(log.exerciseId) ?? 0;
    }
    if (log.rating) athlete.ratings.push(log.rating);
    if (log.note) athlete.notes.push({ key: `exercise-${log.id}`, label: log.exercise.name, text: log.note });
  }

  for (const log of session.diveLogs) {
    const athlete = ensureAthlete(log.athlete);
    athlete.actualReps += log.repetitionsCompleted;
    if (log.rating) athlete.ratings.push(log.rating);
    if (log.note) athlete.notes.push({ key: `dive-${log.id}`, label: `${log.poolDive.diveCode} ${log.poolDive.diveName}`, text: log.note });
  }

  return Array.from(athletes.values())
    .map((athlete) => {
      const progress = athlete.plannedReps > 0 ? Math.round((athlete.actualReps / athlete.plannedReps) * 100) : 0;

      return {
        id: athlete.id,
        name: athlete.name,
        status: athlete.status,
        plannedExercises: athlete.plannedExercises,
        completedExercises: athlete.completedExercises,
        plannedReps: athlete.plannedReps,
        actualReps: athlete.actualReps,
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
  const plannedReps = athletes.reduce((sum, athlete) => sum + athlete.plannedReps, 0);
  const actualReps = athletes.reduce((sum, athlete) => sum + athlete.actualReps, 0);
  const hasResults = athletes.some((athlete) => athlete.actualReps > 0 || athlete.completedExercises > 0 || athlete.status !== "NOT_STARTED");
  const averageProgress = totalAthletes > 0 ? Math.round(athletes.reduce((sum, athlete) => sum + athlete.progress, 0) / totalAthletes) : 0;
  const needsAttention = athletes.filter((athlete) => athlete.status !== "COMPLETED" || athlete.progress < 80).length;

  return { totalAthletes, completedAthletes, plannedReps, actualReps, hasResults, averageProgress, needsAttention };
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
