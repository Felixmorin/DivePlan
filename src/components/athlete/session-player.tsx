"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Circle, Dumbbell, NotebookPen, Play, RotateCcw, Save, Timer, Waves } from "lucide-react";
import type { CompleteSessionPayload } from "@/app/athlete/session/[id]/actions";
import { AthleteShell } from "@/components/athlete/athlete-shell";
import { BlockTypeBadge } from "@/components/training/block-type-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { AthleteSessionView } from "@/lib/athlete-session";

const ratings = ["dur", "moyen", "bon", "excellent"];

type SessionPlayerProps = {
  session: AthleteSessionView;
  onStart: (sessionId: string) => Promise<void>;
  onComplete: (payload: CompleteSessionPayload) => Promise<void>;
};

type BlockFeedback = Record<string, { rating: string; note: string }>;
type DiveChecks = Record<string, boolean[]>;
type ExerciseChecks = Record<string, boolean>;

export function SessionPlayer({ session, onStart, onComplete }: SessionPlayerProps) {
  const router = useRouter();
  const blocks = session.blocks;
  const [current, setCurrent] = useState(0);
  const [started, setStarted] = useState(session.completionStatus === "IN_PROGRESS" || session.completionStatus === "COMPLETED");
  const [reviewing, setReviewing] = useState(session.completionStatus === "COMPLETED");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pulseKey, setPulseKey] = useState<string | null>(null);
  const [exerciseChecks, setExerciseChecks] = useState<ExerciseChecks>(() =>
    Object.fromEntries(blocks.flatMap((block) => block.exercises.map((exercise) => [exercise.id, exercise.completed])))
  );
  const [diveChecks, setDiveChecks] = useState<DiveChecks>(() =>
    Object.fromEntries(
      blocks.flatMap((block) =>
        block.poolSections.flatMap((section) =>
          section.dives.map((dive) => [
            dive.id,
            Array.from({ length: dive.repetitions }, (_, index) => index < dive.completedRepetitions)
          ])
        )
      )
    )
  );
  const [blockFeedback, setBlockFeedback] = useState<BlockFeedback>(() =>
    Object.fromEntries(
      blocks.map((block) => {
        const firstExercise = block.exercises.find((exercise) => exercise.rating || exercise.note);
        const firstDive = block.poolSections.flatMap((section) => section.dives).find((dive) => dive.rating || dive.note);

        return [block.id, { rating: firstExercise?.rating ?? firstDive?.rating ?? "moyen", note: firstExercise?.note ?? firstDive?.note ?? "" }];
      })
    )
  );
  const block = blocks[current];
  const feedback = blockFeedback[block.id] ?? { rating: "moyen", note: "" };
  const totalItems = useMemo(() => countSessionItems(blocks), [blocks]);
  const completedItems = countCompletedItems(blocks, exerciseChecks, diveChecks);
  const progress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : Math.round(((current + 1) / blocks.length) * 100);
  const blockRemaining = countBlockRemaining(block, exerciseChecks, diveChecks);
  const completedBlocks = blocks.filter((item) => countBlockRemaining(item, exerciseChecks, diveChecks) === 0).length;

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!dirty || reviewing) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, reviewing]);

  function pulse(key: string) {
    setPulseKey(key);
    window.setTimeout(() => setPulseKey((currentKey) => (currentKey === key ? null : currentKey)), 220);
  }

  function begin() {
    setError(null);
    startTransition(async () => {
      try {
        await onStart(session.id);
        setStarted(true);
      } catch {
        setError("Connexion instable. Reessaie avant de commencer.");
      }
    });
  }

  function toggleExercise(exerciseId: string) {
    setDirty(true);
    pulse(exerciseId);
    setExerciseChecks((previous) => ({ ...previous, [exerciseId]: !previous[exerciseId] }));
  }

  function toggleDiveRep(diveId: string, repIndex: number) {
    setDirty(true);
    pulse(`${diveId}-${repIndex}`);
    setDiveChecks((previous) => ({
      ...previous,
      [diveId]: (previous[diveId] ?? []).map((checked, index) => (index === repIndex ? !checked : checked))
    }));
  }

  function updateFeedback(next: Partial<{ rating: string; note: string }>) {
    setDirty(true);
    setBlockFeedback((previous) => ({ ...previous, [block.id]: { ...feedback, ...next } }));
  }

  function leaveSession() {
    if (!dirty || reviewing || window.confirm("Des données de séance ne sont pas encore enregistrées. Quitter quand même?")) {
      router.push("/athlete");
    }
  }

  function nextStep() {
    if (current < blocks.length - 1) {
      setCurrent(current + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setReviewing(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function previousStep() {
    if (reviewing) {
      setReviewing(false);
      return;
    }
    setCurrent(Math.max(0, current - 1));
  }

  function completeSession() {
    setError(null);
    startTransition(() => {
      void onComplete({
        sessionId: session.id,
        exercises: blocks.flatMap((sessionBlock) =>
          sessionBlock.exercises.map((exercise) => ({
            exerciseId: exercise.id,
            completed: exerciseChecks[exercise.id] ?? false,
            rating: blockFeedback[sessionBlock.id]?.rating ?? null,
            note: blockFeedback[sessionBlock.id]?.note ?? null
          }))
        ),
        dives: blocks.flatMap((sessionBlock) =>
          sessionBlock.poolSections.flatMap((section) =>
            section.dives.map((dive) => ({
              poolDiveId: dive.id,
              repetitionsCompleted: (diveChecks[dive.id] ?? []).filter(Boolean).length,
              rating: blockFeedback[sessionBlock.id]?.rating ?? null,
              note: blockFeedback[sessionBlock.id]?.note ?? null
            }))
          )
        )
      }).catch(() => setError("L'enregistrement a echoue. Verifie la connexion et reessaie."));
    });
  }

  if (!started) {
    return (
      <AthleteShell hideNav>
        <div className="flex min-h-[calc(100vh-2rem)] flex-col justify-between">
          <button type="button" onClick={leaveSession} className="mb-4 flex min-h-11 items-center gap-2 self-start rounded-xl px-1 text-sm font-bold text-white/62 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"><ArrowLeft className="h-4 w-4" /> Retour</button>
          <section className="rounded-[2rem] border border-white/10 bg-[var(--color-athlete-panel)] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.32)]">
            <Badge className="bg-white text-[var(--color-navy)]">{new Date(session.date).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })}</Badge>
            <h1 className="mt-5 text-4xl font-black leading-none">{session.title}</h1>
            <p className="mt-3 text-sm font-semibold leading-6 text-white/68">{session.focus}</p>
            <div className="mt-5 grid grid-cols-3 gap-2">
              <StartStat label="Duree" value={`${session.duration} min`} />
              <StartStat label="Blocs" value={blocks.length} />
              <StartStat label="Groupe" value={session.group} />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">{Array.from(new Set(blocks.map((item) => item.type))).map((type) => <BlockTypeBadge key={type} type={type} />)}</div>
            {session.notes && <div className="mt-5 rounded-2xl bg-[var(--color-athlete-bg)] p-4 text-sm leading-6 text-white/70"><span className="font-black text-white">Consigne: </span>{session.notes}</div>}
          </section>
          {error && <ErrorBanner message={error} />}
          <Button type="button" variant="action" size="lg" className="mt-6 h-16 w-full rounded-2xl text-base" disabled={isPending} onClick={begin}>
            {session.completionStatus === "IN_PROGRESS" ? <RotateCcw className="h-5 w-5" /> : <Play className="h-5 w-5 fill-current" />}
            {isPending ? "Ouverture..." : session.completionStatus === "IN_PROGRESS" ? "Continuer" : "Commencer la séance"}
          </Button>
        </div>
      </AthleteShell>
    );
  }

  if (reviewing) {
    return (
      <AthleteShell hideNav>
        <div className="space-y-4">
          <button type="button" onClick={previousStep} className="flex min-h-11 items-center gap-2 rounded-xl px-1 text-sm font-bold text-white/62 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"><ChevronLeft className="h-4 w-4" /> Retour aux blocs</button>
          <section className="builder-pulse rounded-[2rem] border border-white/10 bg-[var(--color-athlete-panel)] p-5 text-center shadow-[0_24px_70px_rgba(0,0,0,0.32)]">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-success)] text-white"><CheckCircle2 className="h-8 w-8" /></div>
            <h1 className="mt-5 text-3xl font-black leading-none">Séance terminée</h1>
            <p className="mt-3 text-sm leading-6 text-white/68">Verifie ton ressenti et enregistre la completion definitivement.</p>
          </section>
          <div className="grid grid-cols-3 gap-2">
            <StartStat label="Duree" value={`${session.duration} min`} />
            <StartStat label="Blocs" value={`${completedBlocks}/${blocks.length}`} />
            <StartStat label="Actions" value={`${completedItems}/${totalItems}`} />
          </div>
          <section className="rounded-[var(--radius-panel)] border border-white/10 bg-[var(--color-athlete-panel)] p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-black"><NotebookPen className="h-4 w-4 text-[var(--color-action)]" /> Ressenti final</div>
            <div className="grid grid-cols-2 gap-2">
              {ratings.map((rating) => (
                <Button key={rating} type="button" variant="dark" className={feedback.rating === rating ? "bg-[var(--color-action)] text-white hover:bg-[var(--color-action-strong)]" : ""} onClick={() => updateFeedback({ rating })}>{rating}</Button>
              ))}
            </div>
            <Textarea className="mt-3 min-h-28 border-white/10 bg-[var(--color-athlete-bg)] text-white placeholder:text-white/38" placeholder="Note pour ton coach" value={feedback.note} onChange={(event) => updateFeedback({ note: event.target.value })} />
          </section>
          {error && <ErrorBanner message={error} />}
          <div className="fixed inset-x-0 bottom-0 z-30 bg-[var(--color-athlete-bg)]/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
            <div className="mx-auto flex max-w-[430px] gap-2">
              <Button type="button" variant="outline" className="flex-1 bg-transparent text-white" onClick={previousStep}>Modifier</Button>
              <Button type="button" variant="action" className="h-14 flex-[1.4] rounded-2xl" disabled={isPending} onClick={completeSession}><Save className="h-5 w-5" /> {isPending ? "Enregistrement..." : "Enregistrer"}</Button>
            </div>
          </div>
        </div>
      </AthleteShell>
    );
  }

  return (
    <AthleteShell hideNav>
      <div className="space-y-4">
        <header className="sticky top-0 z-20 -mx-4 bg-[var(--color-athlete-bg)]/96 px-4 pb-3 pt-2 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={leaveSession} className="flex min-h-11 items-center gap-2 rounded-xl px-1 text-sm font-bold text-white/62 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"><ArrowLeft className="h-4 w-4" /> Quitter</button>
            <div className="text-right text-xs font-bold text-white/45">Bloc {current + 1}/{blocks.length}</div>
          </div>
          <Progress value={progress} className="mt-2 h-2 bg-white/10" />
        </header>

        <section className="rounded-[2rem] border border-white/10 bg-[var(--color-athlete-panel)] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.32)]">
          <div className="flex items-center justify-between gap-3">
            <BlockTypeBadge type={block.type} />
            <span className="inline-flex items-center gap-1 text-sm font-bold text-white/55"><Timer className="h-4 w-4" /> {block.duration} min</span>
          </div>
          <h1 className="mt-5 text-4xl font-black leading-none">{block.title}</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-white/68">{session.focus}</p>
          {session.notes && <div className="mt-4 rounded-2xl bg-[var(--color-athlete-bg)] p-3 text-sm leading-6 text-white/70">{session.notes}</div>}
          <div className="mt-5 rounded-2xl bg-white/8 p-4">
            <div className="text-xs font-bold uppercase text-white/38">Restant dans ce bloc</div>
            <div className="mt-1 text-3xl font-black">{blockRemaining}</div>
          </div>
        </section>

        <section className="rounded-[var(--radius-panel)] border border-white/10 bg-[var(--color-athlete-bg)] p-3">
          {block.exercises.length > 0 && (
            <div className="space-y-3">
              {block.exercises.map((exercise) => {
                const checked = exerciseChecks[exercise.id] ?? false;
                return (
                  <button key={exercise.id} type="button" onClick={() => toggleExercise(exercise.id)} className={`grid min-h-20 w-full grid-cols-[48px_1fr_auto] items-center gap-3 rounded-2xl border p-3 text-left transition duration-[var(--duration-fast)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${checked ? "border-[var(--color-success)] bg-[var(--color-success)]/18" : "border-white/10 bg-[var(--color-athlete-panel)]"} ${pulseKey === exercise.id ? "builder-pulse" : ""}`}>
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-athlete-panel-2)] text-white/72"><Dumbbell className="h-5 w-5" /></span>
                    <span className="min-w-0"><span className="block truncate text-lg font-black">{exercise.name}</span><span className="mt-1 block text-sm font-semibold text-white/60">{exercise.sets} x {exercise.reps ?? `${exercise.duration} sec`}</span></span>
                    <span className={`flex h-11 w-11 items-center justify-center rounded-full ${checked ? "bg-[var(--color-success)] text-white" : "bg-white/8 text-white/45"}`}>{checked ? <CheckCircle2 className="h-6 w-6" /> : <Circle className="h-5 w-5" />}</span>
                  </button>
                );
              })}
            </div>
          )}
          {block.poolSections.length > 0 && (
            <Tabs defaultValue={block.poolSections[0]?.id}>
              <TabsList className="grid w-full rounded-2xl bg-[var(--color-athlete-panel-2)]" style={{ gridTemplateColumns: `repeat(${block.poolSections.length}, minmax(0, 1fr))` }}>
                {block.poolSections.map((section) => <TabsTrigger key={section.id} value={section.id}>{section.label}</TabsTrigger>)}
              </TabsList>
              {block.poolSections.map((section) => (
                <TabsContent key={section.id} value={section.id} className="mt-3 space-y-3">
                  {section.dives.map((dive) => {
                    const checks = diveChecks[dive.id] ?? [];
                    const completed = checks.filter(Boolean).length;
                    return (
                      <div key={dive.id} className="rounded-2xl border border-white/10 bg-[var(--color-athlete-panel)] p-4">
                        <div className="grid grid-cols-[56px_1fr_auto] items-center gap-3">
                          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-athlete-panel-2)] text-[var(--color-action)]"><Waves className="h-7 w-7" /></span>
                          <div className="min-w-0"><div className="text-3xl font-black leading-none">{dive.code}</div><div className="mt-1 truncate text-sm font-semibold text-white/68">{dive.name}</div></div>
                          <div className="text-right"><div className="text-2xl font-black">{completed}/{dive.repetitions}</div><div className="text-xs font-bold uppercase text-white/45">reps</div></div>
                        </div>
                        <div className="mt-4 grid grid-cols-5 gap-2">
                          {checks.map((checked, index) => (
                            <button key={index} type="button" onClick={() => toggleDiveRep(dive.id, index)} className={`flex h-12 items-center justify-center rounded-2xl border text-sm font-black transition duration-[var(--duration-fast)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${checked ? "border-[var(--color-success)] bg-[var(--color-success)] text-white" : "border-white/10 bg-[var(--color-athlete-bg)] text-white/62"} ${pulseKey === `${dive.id}-${index}` ? "builder-pulse" : ""}`} aria-label={`Repetition ${index + 1}`}>
                              {checked ? <CheckCircle2 className="h-5 w-5" /> : index + 1}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </TabsContent>
              ))}
            </Tabs>
          )}
          {block.exercises.length === 0 && block.poolSections.length === 0 && <p className="p-3 text-sm leading-6 text-white/70">Bloc commun. Suis les consignes du coach.</p>}
        </section>

        <section className="rounded-[var(--radius-panel)] border border-white/10 bg-[var(--color-athlete-panel)] p-4">
          <div className="mb-3 text-sm font-black text-white/72">Ressenti du bloc</div>
          <div className="grid grid-cols-4 gap-2">
            {ratings.map((rating) => <Button key={rating} type="button" size="sm" variant="dark" className={feedback.rating === rating ? "bg-[var(--color-action)] text-white hover:bg-[var(--color-action-strong)]" : ""} onClick={() => updateFeedback({ rating })}>{rating}</Button>)}
          </div>
          <Textarea className="mt-3 border-white/10 bg-[var(--color-athlete-bg)] text-white placeholder:text-white/38" placeholder="Note rapide" value={feedback.note} onChange={(event) => updateFeedback({ note: event.target.value })} />
        </section>

        {error && <ErrorBanner message={error} />}

        <div className="fixed inset-x-0 bottom-0 z-30 bg-[var(--color-athlete-bg)]/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <div className="mx-auto grid max-w-[430px] grid-cols-[1fr_1.35fr] gap-2">
            <Button type="button" variant="outline" className="h-14 bg-transparent text-white" disabled={current === 0} onClick={previousStep}><ChevronLeft className="h-5 w-5" /> Precedent</Button>
            <Button type="button" variant="action" className="h-14 rounded-2xl" onClick={nextStep}>{current === blocks.length - 1 ? "Finir" : "Suivant"} <ChevronRight className="h-5 w-5" /></Button>
          </div>
        </div>
      </div>
    </AthleteShell>
  );
}

function countSessionItems(blocks: AthleteSessionView["blocks"]) {
  return blocks.reduce((sum, block) => sum + block.exercises.length + block.poolSections.reduce((sectionSum, section) => sectionSum + section.dives.reduce((diveSum, dive) => diveSum + dive.repetitions, 0), 0), 0);
}

function countCompletedItems(blocks: AthleteSessionView["blocks"], exercises: ExerciseChecks, dives: DiveChecks) {
  return blocks.reduce((sum, block) => sum + block.exercises.filter((exercise) => exercises[exercise.id]).length + block.poolSections.reduce((sectionSum, section) => sectionSum + section.dives.reduce((diveSum, dive) => diveSum + (dives[dive.id] ?? []).filter(Boolean).length, 0), 0), 0);
}

function countBlockRemaining(block: AthleteSessionView["blocks"][number], exercises: ExerciseChecks, dives: DiveChecks) {
  const total = countSessionItems([block]);
  const complete = countCompletedItems([block], exercises, dives);
  return Math.max(0, total - complete);
}

function StartStat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-2xl bg-white/8 p-3 text-left"><div className="text-[10px] font-bold uppercase text-white/38">{label}</div><div className="mt-2 truncate text-xl font-black">{value}</div></div>;
}

function ErrorBanner({ message }: { message: string }) {
  return <div className="flex items-start gap-2 rounded-2xl border border-[var(--color-action)]/40 bg-[var(--color-action)]/12 p-3 text-sm font-semibold text-white"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-action)]" /> {message}</div>;
}
