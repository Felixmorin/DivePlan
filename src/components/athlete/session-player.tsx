"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Circle, Clock3, Dumbbell, Eye, FilePenLine, NotebookPen, Play, Plus, RotateCcw, Save } from "lucide-react";
import type { CompleteSessionPayload, SaveAthleteProgressPayload } from "@/app/athlete/session/[id]/actions";
import { AthleteShell } from "@/components/athlete/athlete-shell";
import { BlockTypeBadge } from "@/components/training/block-type-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import type { AthleteSessionView } from "@/lib/athlete-session";
import { formatMontrealTime } from "@/lib/timezone";
import { isSessionStartAvailable } from "@/lib/session-availability";

const blockRatings = ["Pas bien", "Difficile", "Moyen", "Bien", "Très bien"];
const finalRatings = ["Pas bien", "Difficile", "Moyen", "Bien", "Très bien"];

type SessionPlayerProps = {
  session: AthleteSessionView;
  onStart: (sessionId: string) => Promise<void>;
  onPreview: (sessionId: string) => Promise<void>;
  onOpenBlock: (sessionId: string, blockId: string) => Promise<void>;
  onCloseBlock: (sessionId: string, blockId: string) => Promise<void>;
  onSaveProgress: (payload: SaveAthleteProgressPayload) => Promise<void>;
  onComplete: (payload: CompleteSessionPayload) => Promise<void>;
  onSaveDiveNote: (sessionId: string, poolDiveId: string, note: string) => Promise<void>;
};

type PageFeedback = Record<string, { rating: string; note: string }>;
type DiveRepState = 0 | 1 | 2;
type DiveChecks = Record<string, DiveRepState[]>;
type ExerciseChecks = Record<string, boolean>;
type SaveStatus = "saved" | "saving" | "error";

export function SessionPlayer({ session, onStart, onPreview, onOpenBlock, onCloseBlock, onSaveProgress, onComplete, onSaveDiveNote }: SessionPlayerProps) {
  const router = useRouter();
  const blocks = session.blocks;
  const [current, setCurrent] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [started, setStarted] = useState(session.completionStatus === "IN_PROGRESS" || session.completionStatus === "COMPLETED");
  const [blockTimings, setBlockTimings] = useState(() => Object.fromEntries(blocks.map((item) => [item.id, { openedAt: item.openedAt, closedAt: item.closedAt }])));
  const [now, setNow] = useState(() => Date.now());
  const [reviewing, setReviewing] = useState(session.completionStatus === "COMPLETED");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const feedbackSaveTimeouts = useRef<Record<string, number | undefined>>({});
  const finalFeedbackSaveTimeout = useRef<number | undefined>(undefined);
  const saveVersion = useRef(0);
  const [pulseKey, setPulseKey] = useState<string | null>(null);
  const [openDiveNote, setOpenDiveNote] = useState<string | null>(null);
  const [diveNoteDraft, setDiveNoteDraft] = useState("");
  const [expandedPreviewBlocks, setExpandedPreviewBlocks] = useState<Set<string>>(new Set());
  const [sessionPreviewOpen, setSessionPreviewOpen] = useState(false);
  const [isNotePending, startNoteTransition] = useTransition();
  const [diveNotes, setDiveNotes] = useState<Record<string, string>>(() => Object.fromEntries(blocks.flatMap((block) => block.poolSections.flatMap((section) => section.dives.map((dive) => [dive.id, dive.personalNote ?? ""])) )));
  const previewTracked = useRef(false);
  const [finalFeedback, setFinalFeedback] = useState(() => ({
    rating: session.finalRating ?? "Moyen",
    note: session.finalNote ?? ""
  }));
  const [exerciseChecks, setExerciseChecks] = useState<ExerciseChecks>(() =>
    Object.fromEntries(blocks.flatMap((block) => block.exercises.map((exercise) => [exercise.id, exercise.completed])))
  );
  const [diveChecks, setDiveChecks] = useState<DiveChecks>(() =>
    Object.fromEntries(
      blocks.flatMap((block) =>
        block.poolSections.flatMap((section) =>
          section.dives.map((dive) => [
            dive.id,
            Array.from({ length: Math.max(dive.repetitions, dive.completedRepetitions) }, (_, index) => index < dive.goldenRepetitions ? 2 : index < dive.completedRepetitions ? 1 : 0)
          ])
        )
      )
    )
  );
  const [pageFeedback, setPageFeedback] = useState<PageFeedback>(() =>
    Object.fromEntries(
      blocks.flatMap((block) => {
        const pages = block.poolSections.length > 0 ? block.poolSections : [null];
        return pages.map((section, pageIndex) => {
          const firstExercise = section ? undefined : block.exercises.find((exercise) => exercise.rating || exercise.note);
          const firstDive = section?.dives.find((dive) => dive.rating || dive.note);
          return [pageFeedbackKey(block.id, pageIndex), { rating: firstExercise?.rating ?? firstDive?.rating ?? "", note: firstExercise?.note ?? firstDive?.note ?? "" }];
        });
      })
    )
  );
  const exerciseChecksRef = useRef(exerciseChecks);
  const diveChecksRef = useRef(diveChecks);
  const pageFeedbackRef = useRef(pageFeedback);
  const finalFeedbackRef = useRef(finalFeedback);
  const finalFeedbackTouchedRef = useRef(false);
  const block = blocks[current];
  const blockSteps = useMemo(
    () => block.poolSections.map((section) => ({ kind: "pool" as const, section })),
    [block.poolSections]
  );
  const activeStep = blockSteps[stepIndex];
  const isPoolBlock = block.poolSections.length > 0;
  const isLastBlockStep = !isPoolBlock || stepIndex === blockSteps.length - 1;
  const feedback = pageFeedback[pageFeedbackKey(block.id, stepIndex)] ?? { rating: "", note: "" };
  const hasFeedback = Boolean(feedback.rating || feedback.note.trim());
  const hasZeroRepDive = activeStep?.kind === "pool" && activeStep.section.dives.some((dive) => (diveChecks[dive.id] ?? []).filter((state) => state > 0).length === 0);
  const totalItems = useMemo(() => countSessionItems(blocks), [blocks]);
  const completedItems = countCompletedItems(blocks, exerciseChecks, diveChecks);
  const poolDives = useMemo(
    () => blocks.flatMap((sessionBlock) => sessionBlock.poolSections.flatMap((section) => section.dives.map((dive) => ({ ...dive, sectionLabel: section.label })))),
    [blocks]
  );
  const plannedPoolReps = poolDives.reduce((sum, dive) => sum + dive.repetitions, 0);
  const completedPoolReps = poolDives.reduce((sum, dive) => sum + (diveChecks[dive.id] ?? []).filter((state) => state > 0).length, 0);
  const hasPoolDives = poolDives.length > 0;
  const progress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : Math.round(((current + 1) / blocks.length) * 100);
  const blockRemaining = countBlockRemaining(block, exerciseChecks, diveChecks);
  const completedBlocks = blocks.filter((item) => countBlockRemaining(item, exerciseChecks, diveChecks) === 0).length;
  const canStart = isSessionStartAvailable(session.date, new Date(now));
  const activeTiming = blockTimings[block.id];

  useEffect(() => {
    if (started || previewTracked.current) return;
    previewTracked.current = true;
    void onPreview(session.id).catch(() => undefined);
  }, [onPreview, session.id, started]);

  useEffect(() => {
    if (!started || reviewing || activeTiming?.openedAt) return;
    const openedAt = new Date().toISOString();
    setBlockTimings((previous) => ({ ...previous, [block.id]: { openedAt, closedAt: null } }));
    void onOpenBlock(session.id, block.id).catch(() => setError("Le début du bloc n'a pas pu être enregistré."));
  }, [activeTiming?.openedAt, block.id, onOpenBlock, reviewing, session.id, started]);

  useEffect(() => {
    if (!started || reviewing) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [reviewing, started]);

  useEffect(() => {
    if (started || canStart) return;
    const delay = Math.min(30_000, Math.max(250, new Date(session.date).getTime() - Date.now()));
    const timeout = window.setTimeout(() => setNow(Date.now()), delay);
    return () => window.clearTimeout(timeout);
  }, [canStart, session.date, started, now]);

  function markDirty() {
    setDirty(true);
    setSaveStatus("saving");
    return ++saveVersion.current;
  }

  const saveProgressForBlock = useCallback(
      async (
        sessionBlock: AthleteSessionView["blocks"][number],
        pageIndex: number,
        exercises: ExerciseChecks,
        dives: DiveChecks,
        feedbackByPage: PageFeedback,
      version = ++saveVersion.current
    ) => {
      const payload = buildBlockProgressPayload(session.id, sessionBlock, pageIndex, exercises, dives, feedbackByPage);
      if (payload.exercises.length === 0 && payload.dives.length === 0 && !payload.sessionFeedback) {
        if (version === saveVersion.current) {
          setDirty(false);
          setSaveStatus("saved");
        }
        return;
      }

      setError(null);
      await onSaveProgress(payload);
      if (version === saveVersion.current) {
        setDirty(false);
        setSaveStatus("saved");
      }
    },
    [onSaveProgress, session.id]
  );

  const saveProgressBeforePageHide = useCallback(() => {
    if (!dirty) return;

    const payload = buildSessionProgressPayload(
      session.id,
      blocks,
      exerciseChecksRef.current,
      diveChecksRef.current,
      pageFeedbackRef.current,
      finalFeedbackTouchedRef.current ? finalFeedbackRef.current : undefined
    );
    const body = JSON.stringify(payload);

    if (navigator.sendBeacon) {
      const sent = navigator.sendBeacon("/api/athlete/session-progress", new Blob([body], { type: "application/json" }));
      if (sent) return;
    }

    void fetch("/api/athlete/session-progress", {
      method: "POST",
      body,
      headers: { "content-type": "application/json" },
      keepalive: true
    }).catch(() => undefined);
  }, [blocks, dirty, session.id]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      saveProgressBeforePageHide();
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("pagehide", saveProgressBeforePageHide);
    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("pagehide", saveProgressBeforePageHide);
      window.removeEventListener("beforeunload", handler);
    };
  }, [dirty, reviewing, saveProgressBeforePageHide]);

  useEffect(() => {
    const timeouts = feedbackSaveTimeouts.current;
    return () => {
      Object.values(timeouts).forEach((timeout) => window.clearTimeout(timeout));
      window.clearTimeout(finalFeedbackSaveTimeout.current);
    };
  }, []);

  function pulse(key: string) {
    setPulseKey(key);
    window.setTimeout(() => setPulseKey((currentKey) => (currentKey === key ? null : currentKey)), 220);
  }

  function begin() {
    if (!canStart) return;
    setError(null);
    startTransition(async () => {
      try {
        await onStart(session.id);
        setStarted(true);
      } catch {
        setNow(Date.now());
        setError("Impossible de démarrer. Vérifie l’heure prévue et ta connexion, puis réessaie.");
      }
    });
  }

  function toggleExercise(exerciseId: string) {
    const version = markDirty();
    pulse(exerciseId);
    setExerciseChecks((previous) => {
      const next = { ...previous, [exerciseId]: !previous[exerciseId] };
      exerciseChecksRef.current = next;
      void saveProgressForBlock(block, stepIndex, next, diveChecksRef.current, pageFeedbackRef.current, version).catch(() => {
        setDirty(true);
        if (version === saveVersion.current) setSaveStatus("error");
        setError("Sauvegarde temporaire impossible. Garde la page ouverte et reessaie.");
      });
      return next;
    });
  }

  function toggleDiveRep(diveId: string, repIndex: number) {
    const version = markDirty();
    pulse(`${diveId}-${repIndex}`);
    setDiveChecks((previous) => {
      const currentChecks = previous[diveId] ?? [];
      const currentState = currentChecks[repIndex] ?? 0;
      const next = {
        ...previous,
        [diveId]: currentChecks.map((checked, index) => {
          if (currentState === 0) return index <= repIndex && checked === 0 ? 1 : checked;
          if (index === repIndex) return currentState === 1 ? 2 : 0;
          return currentState === 2 && index > repIndex ? 0 : checked;
        })
      };
      diveChecksRef.current = next;
      void saveProgressForBlock(block, stepIndex, exerciseChecksRef.current, next, pageFeedbackRef.current, version).catch(() => {
        setDirty(true);
        if (version === saveVersion.current) setSaveStatus("error");
        setError("Sauvegarde temporaire impossible. Garde la page ouverte et reessaie.");
      });
      return next;
    });
  }

  function addDiveRep(diveId: string) {
    const version = markDirty();
    setDiveChecks((previous) => {
      const currentChecks = previous[diveId] ?? [];
      const next = { ...previous, [diveId]: [...currentChecks, 1 as DiveRepState] };
      pulse(`${diveId}-${currentChecks.length}`);
      diveChecksRef.current = next;
      void saveProgressForBlock(block, stepIndex, exerciseChecksRef.current, next, pageFeedbackRef.current, version).catch(() => {
        setDirty(true);
        if (version === saveVersion.current) setSaveStatus("error");
        setError("Sauvegarde temporaire impossible. Garde la page ouverte et reessaie.");
      });
      return next;
    });
  }

  function markDiveSkipped(diveId: string) {
    const version = markDirty();
    setDiveChecks((previous) => {
      const next: DiveChecks = { ...previous, [diveId]: (previous[diveId] ?? []).map((): DiveRepState => 0) };
      diveChecksRef.current = next;
      void saveProgressForBlock(block, stepIndex, exerciseChecksRef.current, next, pageFeedbackRef.current, version).catch(() => {
        setDirty(true);
        if (version === saveVersion.current) setSaveStatus("error");
        setError("Sauvegarde temporaire impossible. Garde la page ouverte et reessaie.");
      });
      return next;
    });
  }

  function removeDiveRep(diveId: string, plannedRepetitions: number) {
    const version = markDirty();
    setDiveChecks((previous) => {
      const currentChecks = previous[diveId] ?? [];
      if (currentChecks.length <= plannedRepetitions) return previous;

      const next = { ...previous, [diveId]: currentChecks.slice(0, -1) };
      diveChecksRef.current = next;
      void saveProgressForBlock(block, stepIndex, exerciseChecksRef.current, next, pageFeedbackRef.current, version).catch(() => {
        setDirty(true);
        if (version === saveVersion.current) setSaveStatus("error");
        setError("Sauvegarde temporaire impossible. Garde la page ouverte et reessaie.");
      });
      return next;
    });
  }

  function updateFeedback(next: Partial<{ rating: string; note: string }>) {
    const version = markDirty();
    const feedbackKey = pageFeedbackKey(block.id, stepIndex);
    setPageFeedback((previous) => {
      const nextFeedbackByPage = { ...previous, [feedbackKey]: { ...feedback, ...next } };
      pageFeedbackRef.current = nextFeedbackByPage;
      window.clearTimeout(feedbackSaveTimeouts.current[feedbackKey]);
      feedbackSaveTimeouts.current[feedbackKey] = window.setTimeout(() => {
        void saveProgressForBlock(block, stepIndex, exerciseChecksRef.current, diveChecksRef.current, nextFeedbackByPage, version).catch(() => {
          setDirty(true);
          if (version === saveVersion.current) setSaveStatus("error");
          setError("Sauvegarde temporaire impossible. Garde la page ouverte et reessaie.");
        });
      }, 650);
      return nextFeedbackByPage;
    });
  }

  function updateFinalFeedback(next: Partial<{ rating: string; note: string }>) {
    const version = markDirty();
    finalFeedbackTouchedRef.current = true;
    setFinalFeedback((previous) => {
      const nextFeedback = { ...previous, ...next };
      finalFeedbackRef.current = nextFeedback;
      window.clearTimeout(finalFeedbackSaveTimeout.current);
      finalFeedbackSaveTimeout.current = window.setTimeout(() => {
        const payload = buildSessionProgressPayload(session.id, blocks, exerciseChecksRef.current, diveChecksRef.current, pageFeedbackRef.current, nextFeedback);
        void onSaveProgress(payload).then(() => {
          if (version === saveVersion.current) {
            setDirty(false);
            setSaveStatus("saved");
          }
        }).catch(() => {
          setDirty(true);
          if (version === saveVersion.current) setSaveStatus("error");
          setError("Sauvegarde temporaire impossible. Garde la page ouverte et reessaie.");
        });
      }, 650);
      return nextFeedback;
    });
  }

  function leaveSession() {
    if (!dirty || reviewing || window.confirm("Des données de séance ne sont pas encore enregistrées. Quitter quand même?")) {
      router.push("/athlete");
    }
  }

  function nextStep() {
    if (!hasFeedback) return;

    if (isPoolBlock && stepIndex < blockSteps.length - 1) {
      setStepIndex(stepIndex + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (current < blocks.length - 1) {
      closeBlock(block.id);
      setCurrent(current + 1);
      setStepIndex(0);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    closeBlock(block.id);
    setReviewing(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function finishTraining() {
    if (!hasFeedback) return;
    closeBlock(block.id);
    setReviewing(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function previousStep() {
    if (reviewing) {
      setReviewing(false);
      return;
    }

    if (isPoolBlock && stepIndex > 0) {
      setStepIndex(stepIndex - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (current === 0) return;

    const previousBlock = blocks[current - 1];
    setCurrent(current - 1);
    setStepIndex(previousBlock.poolSections.length > 0 ? previousBlock.poolSections.length - 1 : 0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeBlock(blockId: string) {
    if (blockTimings[blockId]?.closedAt) return;
    const closedAt = new Date().toISOString();
    setBlockTimings((previous) => ({ ...previous, [blockId]: { ...previous[blockId], closedAt } }));
    void onCloseBlock(session.id, blockId).catch(() => setError("La fin du bloc n'a pas pu être enregistrée."));
  }

  function openDiveNoteEditor(dive: AthleteSessionView["blocks"][number]["poolSections"][number]["dives"][number]) {
    setOpenDiveNote(dive.id);
    setDiveNoteDraft(diveNotes[dive.id] ?? dive.personalNote ?? "");
  }

  function saveDiveNote(diveId: string) {
    const note = diveNoteDraft.trim();
    setError(null);
    startNoteTransition(async () => {
      try {
        await onSaveDiveNote(session.id, diveId, note);
        setDiveNotes((previous) => ({ ...previous, [diveId]: note }));
        setOpenDiveNote(null);
      } catch {
        setError("La note du plongeon n'a pas pu être sauvegardée. Réessaie.");
      }
    });
  }

  function togglePreviewBlock(blockId: string) {
    setExpandedPreviewBlocks((previous) => {
      const next = new Set(previous);
      if (next.has(blockId)) {
        next.delete(blockId);
      } else {
        next.add(blockId);
      }
      return next;
    });
  }

  function completeSession() {
    setError(null);
    Object.values(feedbackSaveTimeouts.current).forEach((timeout) => window.clearTimeout(timeout));
    window.clearTimeout(finalFeedbackSaveTimeout.current);
    startTransition(async () => {
      try {
        await onComplete(buildSessionProgressPayload(session.id, blocks, exerciseChecksRef.current, diveChecksRef.current, pageFeedbackRef.current, finalFeedbackRef.current));
        setDirty(false);
        setSaveStatus("saved");
        router.push("/athlete/progress");
      } catch {
        setError("L'enregistrement a echoue. Verifie la connexion et reessaie.");
      }
    });
  }

  if (!started) {
    return (
      <AthleteShell hideNav>
        <div className="flex min-h-[calc(100vh-2rem)] flex-col justify-between">
          <button type="button" onClick={leaveSession} className="mb-4 flex min-h-11 items-center gap-2 self-start rounded-xl px-1 text-sm font-bold text-white/62 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"><ArrowLeft className="h-4 w-4" /> Retour</button>
          <section className="rounded-[2rem] border border-white/10 bg-[var(--color-athlete-panel)] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.32)]">
            <Badge className="bg-white text-[var(--color-navy)]">{formatMontrealTime(session.date)}</Badge>
            <h1 className="mt-5 text-4xl font-black leading-none">{session.title}</h1>
            {session.focus && <p className="mt-3 text-sm font-semibold leading-6 text-white/68">{session.focus}</p>}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <StartStat label="Blocs" value={blocks.length} />
              <StartStat label="Groupe" value={session.group} />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">{Array.from(new Set(blocks.map((item) => item.type))).map((type) => <BlockTypeBadge key={type} type={type} />)}</div>
            {session.notes && <div className="mt-5 rounded-2xl bg-[var(--color-athlete-bg)] p-4 text-sm leading-6 text-white/70"><span className="font-black text-white">Consigne: </span>{session.notes}</div>}
          </section>
          {!canStart && (
            <div className="mt-4 flex items-start gap-3 rounded-2xl border border-white/10 bg-white/8 p-4 text-sm leading-6 text-white/72">
              <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-action)]" />
              <div><div className="font-black text-white">Disponible à {formatMontrealTime(session.date)}</div><p>Tu peux consulter l’aperçu maintenant, mais la séance ne pourra pas être démarrée avant l’heure prévue.</p></div>
            </div>
          )}
          <section className="mt-4 rounded-[var(--radius-panel)] border border-white/10 bg-[var(--color-athlete-panel)] p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-black"><Eye className="h-4 w-4 text-[var(--color-action)]" /> Aperçu de l’entraînement</div>
            <div className="space-y-3">
              {blocks.map((previewBlock, index) => (
                <div key={previewBlock.id} className="overflow-hidden rounded-2xl bg-[var(--color-athlete-bg)]">
                  <button
                    type="button"
                    aria-expanded={expandedPreviewBlocks.has(previewBlock.id)}
                    aria-controls={`preview-block-${previewBlock.id}`}
                    onClick={() => togglePreviewBlock(previewBlock.id)}
                    className="flex min-h-16 w-full items-center justify-between gap-3 p-3 text-left transition hover:bg-white/5 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                  >
                    <span className="min-w-0">
                      <span className="block font-black">{index + 1}. {previewBlock.title}</span>
                      <span className="mt-1 block text-xs font-semibold text-white/48">{previewBlock.exercises.length} exercice(s) · {previewBlock.poolSections.reduce((sum, section) => sum + section.dives.length, 0)} plongeon(s)</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <ChevronDown className={`h-5 w-5 text-white/55 transition-transform ${expandedPreviewBlocks.has(previewBlock.id) ? "rotate-180" : ""}`} aria-hidden="true" />
                    </span>
                  </button>
                  {expandedPreviewBlocks.has(previewBlock.id) && (
                    <div id={`preview-block-${previewBlock.id}`} className="border-t border-white/8 px-3 pb-3 pt-3">
                      {previewBlock.description && <p className="mb-3 whitespace-pre-line text-sm leading-5 text-white/62">{previewBlock.description}</p>}
                      {previewBlock.exercises.length > 0 && (
                        <div className="space-y-2">
                          {previewBlock.exercises.map((exercise) => (
                            <div key={exercise.id} className="flex items-start gap-2 rounded-xl border border-white/8 bg-white/5 px-3 py-2">
                              <Dumbbell className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-action)]" aria-hidden="true" />
                              <div className="min-w-0">
                                <div className="font-bold">{exercise.name}</div>
                                <div className="mt-0.5 text-xs font-semibold text-white/48">{formatExercisePrescription(exercise)}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {previewBlock.poolSections.length > 0 && (
                        <div className={previewBlock.exercises.length > 0 ? "mt-3 space-y-3" : "space-y-3"}>
                          {previewBlock.poolSections.map((section) => (
                            <div key={section.id}>
                              <div className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-white/45">{section.label}</div>
                              <div className="space-y-2">
                                {section.dives.map((dive) => (
                                  <div key={dive.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/5 px-3 py-2">
                                    <div className="min-w-0"><span className="font-bold">{dive.code}</span><span className="ml-2 text-sm text-white/68">{dive.name}</span></div>
                                    <span className="shrink-0 text-xs font-bold text-white/55">{dive.repetitions} rep.</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {previewBlock.exercises.length === 0 && previewBlock.poolSections.length === 0 && <p className="text-sm font-semibold text-white/48">Aucun exercice détaillé pour ce bloc.</p>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
          {error && <ErrorBanner message={error} />}
          <Button type="button" variant="action" size="lg" className="mt-6 h-16 w-full rounded-2xl text-base" disabled={isPending || !canStart} onClick={begin}>
            {session.completionStatus === "IN_PROGRESS" ? <RotateCcw className="h-5 w-5" /> : <Play className="h-5 w-5 fill-current" />}
            {isPending ? "Ouverture..." : session.completionStatus === "IN_PROGRESS" ? "Continuer" : canStart ? "Commencer la séance" : `Disponible à ${formatMontrealTime(session.date)}`}
          </Button>
        </div>
      </AthleteShell>
    );
  }

  if (reviewing) {
    return (
      <AthleteShell hideNav>
        <div className="space-y-4">
          <button type="button" onClick={leaveSession} className="flex min-h-11 items-center gap-2 rounded-xl px-1 text-sm font-bold text-white/62 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"><ArrowLeft className="h-4 w-4" /> Quitter</button>
          <section className="builder-pulse rounded-[2rem] border border-white/10 bg-[var(--color-athlete-panel)] p-5 text-center shadow-[0_24px_70px_rgba(0,0,0,0.32)]">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-success)] text-white"><CheckCircle2 className="h-8 w-8" /></div>
            <h1 className="mt-5 text-3xl font-black leading-none">Séance terminée</h1>
            <p className="mt-3 text-sm leading-6 text-white/68">Verifie ton ressenti et enregistre la completion definitivement.</p>
          </section>
          <div className="grid grid-cols-2 gap-2">
            <StartStat label="Blocs" value={`${completedBlocks}/${blocks.length}`} />
            <StartStat label="Plongeons" value={`${completedPoolReps}/${plannedPoolReps}`} />
          </div>
          <SaveIndicator status={saveStatus} />
          {hasPoolDives && (
            <section className="rounded-[var(--radius-panel)] border border-white/10 bg-[var(--color-athlete-panel)] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-sm font-black text-white/72">Récapitulatif des plongeons</div>
                <div className="text-sm font-black text-[var(--color-action)]">{completedPoolReps}/{plannedPoolReps}</div>
              </div>
              <div className="space-y-2">
                {poolDives.map((dive) => {
                  const completed = (diveChecks[dive.id] ?? []).filter((state) => state > 0).length;
                  return (
                    <div key={dive.id} className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--color-athlete-bg)] px-3 py-3">
                      <div className="min-w-0">
                        <div className="truncate font-black">{dive.code} · {dive.name}</div>
                        <div className="mt-1 text-xs font-semibold text-white/45">{dive.sectionLabel}</div>
                      </div>
                      <div className="shrink-0 text-right text-lg font-black">{completed}/{dive.repetitions}</div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
          <section className="rounded-[var(--radius-panel)] border border-white/10 bg-[var(--color-athlete-panel)] p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-black"><NotebookPen className="h-4 w-4 text-[var(--color-action)]" /> Ressenti final</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {finalRatings.map((rating) => (
                <Button key={rating} type="button" variant="dark" className={finalFeedback.rating === rating ? "bg-[var(--color-action)] text-white hover:bg-[var(--color-action-strong)]" : ""} onClick={() => updateFinalFeedback({ rating })}>{rating}</Button>
              ))}
            </div>
            <Textarea className="mt-3 min-h-28 border-white/10 bg-[var(--color-athlete-bg)] text-white placeholder:text-white/38" placeholder="Note pour ton coach" value={finalFeedback.note} onChange={(event) => updateFinalFeedback({ note: event.target.value })} />
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
            <div className="flex items-center gap-3">
              <button type="button" aria-expanded={sessionPreviewOpen} aria-controls="active-session-preview" onClick={() => setSessionPreviewOpen((open) => !open)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2 text-xs font-bold text-white/55 transition hover:bg-white/6 hover:text-white/85 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"><Eye className="h-4 w-4 text-[var(--color-action)]" /> Aperçu</button>
              <div className="flex flex-col items-end gap-1">
              <div className="text-right text-xs font-bold text-white/45">Bloc {current + 1}/{blocks.length}</div>
              <SaveIndicator status={saveStatus} compact />
              </div>
            </div>
          </div>
          <Progress value={progress} className="mt-2 h-2 bg-white/10" />
        </header>

        {sessionPreviewOpen && <section id="active-session-preview" className="rounded-2xl border border-white/10 bg-[var(--color-athlete-panel)] p-3" aria-label="Aperçu de l’entraînement">
          <div className="mb-2 flex items-center gap-2 px-1 text-xs font-black text-white/65"><Eye className="h-4 w-4 text-[var(--color-action)]" /> Aperçu de l’entraînement</div>
          <div className="space-y-2">
            {blocks.map((previewBlock, index) => <details key={previewBlock.id} open={expandedPreviewBlocks.has(previewBlock.id)} onToggle={(event) => {
              const isOpen = event.currentTarget.open;
              setExpandedPreviewBlocks((previous) => {
                const next = new Set(previous);
                if (isOpen) next.add(previewBlock.id);
                else next.delete(previewBlock.id);
                return next;
              });
            }} className="rounded-xl bg-[var(--color-athlete-bg)] px-3 py-2">
              <summary className="min-h-10 cursor-pointer py-2 text-sm font-black marker:text-white/40">{index + 1}. {previewBlock.title}<span className="ml-2 text-xs font-semibold text-white/45">{previewBlock.exercises.length} exercice(s) · {previewBlock.poolSections.reduce((sum, section) => sum + section.dives.length, 0)} plongeon(s)</span></summary>
              <div className="space-y-2 border-t border-white/8 pb-1 pt-3">
                {previewBlock.description && <p className="whitespace-pre-line text-sm leading-5 text-white/62">{previewBlock.description}</p>}
                {previewBlock.exercises.map((exercise) => <div key={exercise.id} className="flex items-start gap-2 text-sm"><Dumbbell className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-action)]" /><span><span className="font-bold">{exercise.name}</span><span className="ml-2 text-xs text-white/50">{formatExercisePrescription(exercise)}</span></span></div>)}
                {previewBlock.poolSections.map((section) => <div key={section.id}><div className="mb-1 text-xs font-black uppercase tracking-wide text-white/45">{section.label}</div>{section.dives.map((dive) => <div key={dive.id} className="flex justify-between gap-2 py-1 text-sm"><span><b>{dive.code}</b> · {dive.name}</span><span className="shrink-0 text-xs text-white/55">{dive.repetitions} rep.</span></div>)}</div>)}
                {previewBlock.exercises.length === 0 && previewBlock.poolSections.length === 0 && <p className="text-sm text-white/48">Aucun exercice détaillé pour ce bloc.</p>}
              </div>
            </details>)}
          </div>
        </section>}

        <section className="rounded-[2rem] border border-white/10 bg-[var(--color-athlete-panel)] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.32)]">
          <div className="flex items-center justify-between gap-3">
            <BlockTypeBadge type={block.type} />
          </div>
          <h1 className="mt-5 text-4xl font-black leading-none">{block.title}</h1>
          {block.description && <p className="mt-3 whitespace-pre-line text-sm font-semibold leading-6 text-white/78">{block.description}</p>}
          {session.focus && <p className="mt-3 text-sm font-semibold leading-6 text-white/68">{session.focus}</p>}
          {session.notes && <div className="mt-4 rounded-2xl bg-[var(--color-athlete-bg)] p-3 text-sm leading-6 text-white/70">{session.notes}</div>}
          <div className="mt-5 rounded-2xl bg-white/8 p-4">
            <div className="text-xs font-bold uppercase text-white/38">Progression du bloc</div>
            <div className="mt-1 text-3xl font-black">{blockRemaining}</div>
            <div className="mt-1 text-sm font-semibold text-white/48">élément{blockRemaining === 1 ? "" : "s"} restant{blockRemaining === 1 ? "" : "s"}</div>
          </div>
        </section>

        <section className="rounded-[var(--radius-panel)] border border-white/10 bg-[var(--color-athlete-bg)] p-3">
          {!isPoolBlock && block.exercises.length > 0 && (
            <div className="space-y-3">
              {block.exercises.map((exercise) => {
                const checked = exerciseChecks[exercise.id] ?? false;
                return (
                  <button key={exercise.id} type="button" onClick={() => toggleExercise(exercise.id)} className={`grid min-h-20 w-full grid-cols-[48px_1fr_auto] items-center gap-3 rounded-2xl border p-3 text-left transition duration-[var(--duration-fast)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${checked ? "border-[var(--color-success)] bg-[var(--color-success)]/18" : "border-white/10 bg-[var(--color-athlete-panel)]"} ${pulseKey === exercise.id ? "builder-pulse" : ""}`}>
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-athlete-panel-2)] text-white/72"><Dumbbell className="h-5 w-5" /></span>
                    <span className="min-w-0"><span className="block break-words text-lg font-black leading-tight">{exercise.name}</span><span className="mt-1 block text-sm font-semibold text-white/60">{exercise.sets} x {exercise.reps ?? `${exercise.duration} sec`}</span></span>
                    <span className={`flex h-11 w-11 items-center justify-center rounded-full ${checked ? "bg-[var(--color-success)] text-white" : "bg-white/8 text-white/45"}`}>{checked ? <CheckCircle2 className="h-6 w-6" /> : <Circle className="h-5 w-5" />}</span>
                  </button>
                );
              })}
            </div>
          )}
          {activeStep?.kind === "pool" && (
            <div className="space-y-3">
              {activeStep.section.dives.map((dive) => {
                const checks = diveChecks[dive.id] ?? [];
                const completed = checks.filter((state) => state > 0).length;
                const golden = checks.filter((state) => state === 2).length;
                return (
                  <div key={dive.id} className="rounded-2xl border border-white/10 bg-[var(--color-athlete-panel)] p-4">
                    <div className="grid grid-cols-[64px_1fr_auto] items-center gap-3">
                      <span className="flex min-h-14 w-16 items-center justify-center rounded-2xl bg-[var(--color-athlete-panel-2)] px-1 text-center text-xs font-black leading-tight text-[var(--color-action)]">{activeStep.section.label}</span>
                      <div className="min-w-0"><div className="text-3xl font-black leading-none">{dive.code}</div><div className="mt-1 truncate text-sm font-semibold text-white/68">{dive.name}</div></div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => openDiveNoteEditor(dive)} className={`flex h-10 w-10 items-center justify-center rounded-xl transition hover:bg-white/8 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${diveNotes[dive.id] ? "text-[#60a5fa]" : "text-white/45"}`} aria-label={diveNotes[dive.id] ? `Voir ou modifier la note de ${dive.code}` : `Ajouter une note à ${dive.code}`}>
                          <FilePenLine className="h-5 w-5" />
                        </button>
                        <div className="text-right"><div className="text-2xl font-black">{completed}/{checks.length}</div><div className="text-xs font-bold uppercase text-white/45">reps{golden > 0 ? ` · ${golden} gold` : ""}</div></div>
                      </div>
                    </div>
                    {openDiveNote === dive.id && (
                      <div className="mt-3 rounded-2xl border border-[var(--color-action)]/30 bg-[var(--color-athlete-bg)] p-3">
                        <div className="text-sm font-black">Ma note sur {dive.code}</div>
                        <Textarea className="mt-2 min-h-24 border-white/10 bg-[var(--color-athlete-panel)] text-white placeholder:text-white/38" placeholder="Ajoute un commentaire pour te rappeler ce plongeon..." value={diveNoteDraft} onChange={(event) => setDiveNoteDraft(event.target.value)} />
                        <div className="mt-2 flex justify-end gap-2">
                          <Button type="button" size="sm" variant="outline" className="bg-transparent text-white" onClick={() => setOpenDiveNote(null)}>Annuler</Button>
                          <Button type="button" size="sm" variant="action" disabled={isNotePending} onClick={() => saveDiveNote(dive.id)}>{isNotePending ? "Sauvegarde..." : "Enregistrer"}</Button>
                        </div>
                      </div>
                    )}
                    <div className="mt-4 grid grid-cols-5 gap-2">
                      {checks.map((state, index) => (
                        <button key={index} type="button" onClick={() => toggleDiveRep(dive.id, index)} className={`flex h-12 items-center justify-center rounded-2xl border text-sm font-black transition duration-[var(--duration-fast)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${state === 2 ? "border-amber-300 bg-amber-400 text-[#281500]" : state === 1 ? "border-[var(--color-success)] bg-[var(--color-success)] text-white" : "border-white/10 bg-[var(--color-athlete-bg)] text-white/62"} ${pulseKey === `${dive.id}-${index}` ? "builder-pulse" : ""}`} aria-label={`Repetition ${index + 1}${state === 2 ? ", golden" : state === 1 ? ", complétée" : ""}`}>
                          {state === 2 ? "★" : state === 1 ? <CheckCircle2 className="h-5 w-5" /> : index + 1}
                        </button>
                      ))}
                    </div>
                    <button type="button" onClick={() => addDiveRep(dive.id)} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-sm font-black text-[var(--color-action)] transition hover:bg-white/8 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">
                      <Plus className="h-4 w-4" /> Ajouter une rep
                    </button>
                    <button type="button" onClick={() => markDiveSkipped(dive.id)} aria-pressed={completed === 0} className={`ml-2 inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-sm font-black transition hover:bg-white/8 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${completed === 0 ? "text-[var(--color-action)]" : "text-white/62"}`}>
                      0 rep
                    </button>
                    {checks.length > dive.repetitions && (
                      <button type="button" onClick={() => removeDiveRep(dive.id, dive.repetitions)} className="ml-2 inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-sm font-black text-white/62 transition hover:bg-white/8 hover:text-white focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">
                        Retirer une rep
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-[var(--radius-panel)] border border-white/10 bg-[var(--color-athlete-panel)] p-4">
          <div className="mb-3 text-sm font-black text-white/72">Ressenti du bloc</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {blockRatings.map((rating) => <Button key={rating} type="button" size="sm" variant="dark" className={feedback.rating === rating ? "bg-[var(--color-action)] text-white hover:bg-[var(--color-action-strong)]" : ""} onClick={() => updateFeedback({ rating })}>{rating}</Button>)}
          </div>
          <Textarea className="mt-3 border-white/10 bg-[var(--color-athlete-bg)] text-white placeholder:text-white/38" placeholder="Note rapide (facultatif)" value={feedback.note} onChange={(event) => updateFeedback({ note: event.target.value })} />
          {!hasFeedback && <p className="mt-2 text-sm font-semibold text-[var(--color-action)]">Choisis ton ressenti avant de continuer.</p>}
        </section>

        {error && <ErrorBanner message={error} />}

        <div className="fixed inset-x-0 bottom-0 z-30 bg-[var(--color-athlete-bg)]/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <div className="mx-auto grid max-w-[430px] grid-cols-[1fr_1.35fr] gap-2">
            <Button type="button" variant="outline" className="h-14 bg-transparent text-white" disabled={current === 0 && stepIndex === 0} onClick={previousStep}><ChevronLeft className="h-5 w-5" /> Precedent</Button>
            <Button type="button" variant="action" className="h-14 rounded-2xl" disabled={!hasFeedback} onClick={hasZeroRepDive ? finishTraining : nextStep}>{hasZeroRepDive || (current === blocks.length - 1 && isLastBlockStep) ? "Terminer l’entraînement" : "Suivant"} <ChevronRight className="h-5 w-5" /></Button>
          </div>
        </div>
      </div>
    </AthleteShell>
  );
}

function countSessionItems(blocks: AthleteSessionView["blocks"]) {
  return blocks.reduce((sum, block) => sum + block.exercises.length + block.poolSections.reduce((sectionSum, section) => sectionSum + section.dives.reduce((diveSum, dive) => diveSum + dive.repetitions, 0), 0), 0);
}

function formatExercisePrescription(exercise: AthleteSessionView["blocks"][number]["exercises"][number]) {
  const prescription = [
    exercise.sets !== null ? `${exercise.sets} série${exercise.sets > 1 ? "s" : ""}` : null,
    exercise.reps !== null ? `${exercise.reps} répétition${exercise.reps > 1 ? "s" : ""}` : null,
    exercise.duration !== null ? `${exercise.duration} sec` : null
  ].filter(Boolean);

  return prescription.length > 0 ? prescription.join(" · ") : "Selon les consignes du coach";
}

function countCompletedItems(blocks: AthleteSessionView["blocks"], exercises: ExerciseChecks, dives: DiveChecks) {
  return blocks.reduce((sum, block) => sum + block.exercises.filter((exercise) => exercises[exercise.id]).length + block.poolSections.reduce((sectionSum, section) => sectionSum + section.dives.reduce((diveSum, dive) => diveSum + (dives[dive.id] ?? []).filter((state) => state > 0).length, 0), 0), 0);
}

function countBlockRemaining(block: AthleteSessionView["blocks"][number], exercises: ExerciseChecks, dives: DiveChecks) {
  const total = countSessionItems([block]);
  const complete = countCompletedItems([block], exercises, dives);
  return Math.max(0, total - complete);
}

function pageFeedbackKey(blockId: string, pageIndex: number) {
  return `${blockId}:${pageIndex}`;
}

function buildBlockProgressPayload(
  sessionId: string,
  block: AthleteSessionView["blocks"][number],
  pageIndex: number,
  exercises: ExerciseChecks,
  dives: DiveChecks,
  feedbackByPage: PageFeedback
): SaveAthleteProgressPayload {
  const feedback = feedbackByPage[pageFeedbackKey(block.id, pageIndex)] ?? { rating: "Moyen", note: "" };
  const section = block.poolSections[pageIndex];

  return {
    sessionId,
    exercises: section ? [] : block.exercises.map((exercise) => ({
      exerciseId: exercise.id,
      completed: exercises[exercise.id] ?? false,
      rating: feedback.rating,
      note: feedback.note
    })),
    dives: section ? section.dives.map((dive) => ({
        poolDiveId: dive.id,
        repetitionsCompleted: (dives[dive.id] ?? []).filter((state) => state > 0).length,
        goldenRepetitions: (dives[dive.id] ?? []).filter((state) => state === 2).length,
        rating: feedback.rating,
        note: feedback.note
      })) : []
  };
}

function buildSessionProgressPayload(
  sessionId: string,
  blocks: AthleteSessionView["blocks"],
  exercises: ExerciseChecks,
  dives: DiveChecks,
  feedbackByPage: PageFeedback,
  sessionFeedback?: { rating: string; note: string }
): SaveAthleteProgressPayload {
  return {
    sessionId,
    sessionFeedback,
    exercises: blocks.flatMap((block) =>
      block.poolSections.length > 0 ? [] : block.exercises.map((exercise) => {
        const feedback = feedbackByPage[pageFeedbackKey(block.id, 0)] ?? { rating: "Moyen", note: "" };

        return {
          exerciseId: exercise.id,
          completed: exercises[exercise.id] ?? false,
          rating: feedback.rating,
          note: feedback.note
        };
      })
    ),
    dives: blocks.flatMap((block) =>
      block.poolSections.flatMap((section, pageIndex) =>
        section.dives.map((dive) => {
          const feedback = feedbackByPage[pageFeedbackKey(block.id, pageIndex)] ?? { rating: "Moyen", note: "" };

          return {
            poolDiveId: dive.id,
            repetitionsCompleted: (dives[dive.id] ?? []).filter((state) => state > 0).length,
            goldenRepetitions: (dives[dive.id] ?? []).filter((state) => state === 2).length,
            rating: feedback.rating,
            note: feedback.note
          };
        })
      )
    )
  };
}

function StartStat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-2xl bg-white/8 p-3 text-left"><div className="text-[10px] font-bold uppercase text-white/38">{label}</div><div className="mt-2 truncate text-xl font-black">{value}</div></div>;
}

function ErrorBanner({ message }: { message: string }) {
  return <div className="flex items-start gap-2 rounded-2xl border border-[var(--color-action)]/40 bg-[var(--color-action)]/12 p-3 text-sm font-semibold text-white"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-action)]" /> {message}</div>;
}

function SaveIndicator({ status, compact = false }: { status: SaveStatus; compact?: boolean }) {
  const label = status === "saving" ? "Sauvegarde..." : status === "error" ? "Erreur réseau" : "Sauvegardé";
  const className =
    status === "error"
      ? "border-[var(--color-action)]/40 bg-[var(--color-action)]/12 text-[var(--color-action)]"
      : status === "saving"
        ? "border-white/10 bg-white/8 text-white/62"
        : "border-[var(--color-success)]/30 bg-[var(--color-success)]/14 text-[var(--color-success)]";

  return (
    <div role="status" aria-live="polite" className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-black ${className} ${compact ? "" : "w-fit"}`}>
      {status === "error" ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
      {label}
    </div>
  );
}
