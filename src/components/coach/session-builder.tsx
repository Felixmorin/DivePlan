"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, ArrowDown, ArrowUp, BookmarkPlus, CalendarPlus, CheckCircle2, ChevronDown, ChevronUp, FileText, MoreHorizontal, Plus, Search, Send, Trash2, Users, Waves } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { saveDrylandBlockAsTemplate, type CreateSessionInput, type QuickExerciseInput } from "@/app/coach/sessions/actions";
import { AssignmentSelector } from "@/components/coach/assignment-selector";
import { AthleteAvatarGroup } from "@/components/coach/athlete-avatar-group";
import { PoolListTable } from "@/components/coach/pool-list-table";
import { BlockTypeBadge } from "@/components/training/block-type-badge";
import { StatusPill } from "@/components/training/status-pill";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { SessionTemplatePayload } from "@/lib/session-template";
import { countPoolContexts, validatePoolListRow, type PoolListRow } from "@/lib/pool-list";
import { toMontrealDateInputValue, toMontrealDateTimeInputValue } from "@/lib/timezone";

const schema = z.object({
  title: z.string().min(3, "Nom requis"),
  date: z.string().min(10, "Date requise"),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure requise"),
  groupId: z.string().min(1, "Groupe requis"),
  notes: z.string().optional()
  ,planningEventId: z.string().optional()
});

type FormValues = z.infer<typeof schema>;

type BuilderAthlete = {
  id: string;
  groupId: string | null;
  firstName: string;
  lastName: string;
  level?: string;
  avatar?: string | null;
};

type BuilderExercise = {
  id: string;
  name: string;
  category: string;
  sets: number | null;
  reps: number | null;
  duration: number | null;
  roundTrip: boolean;
  equipment: string | null;
  tags: string[];
};

type BuilderGroup = {
  id: string;
  name: string;
};

type BuilderPlanningEvent = { id: string; title: string; startsAt: Date; groupId: string | null; location: string | null };

type BuilderPoolDive = {
  diveCode: string;
  diveName: string;
  position: string;
  repetitions: number;
  notes: string | null;
  order: number;
};

type BuilderPoolSection = {
  height: "ONE_METER" | "THREE_METER" | "PLATFORM" | "CUSTOM";
  label: string | null;
  dives: BuilderPoolDive[];
};

type BuilderPoolBlock = {
  id: string;
  title: string;
  duration: number;
  athleteIds: string[];
  sections: BuilderPoolSection[];
  competitionEvaluation?: boolean;
};

type BuilderDrylandBlock = {
  id: string;
  title: string;
  duration: number;
  exerciseIds: string[];
  athleteIds: string[];
  exerciseOverrides: Record<string, { sets: number | null; reps: number | null; duration: number | null; notes: string | null }>;
  competitionEvaluation?: boolean;
};

type SessionBuilderProps = {
  athletes: BuilderAthlete[];
  drylandLibrary: BuilderExercise[];
  groups: BuilderGroup[];
  planningEvents: BuilderPlanningEvent[];
  poolBlocks: BuilderPoolBlock[];
  initialTemplate?: {
    id: string;
    name: string;
    category: string;
    payload: SessionTemplatePayload;
  } | null;
  initialPlanningEventId?: string;
  initialExerciseId?: string;
  onCreate: (input: CreateSessionInput) => Promise<void>;
  onCreateExercise: (input: QuickExerciseInput) => Promise<BuilderExercise>;
};

const steps = ["Planifier", "Composer", "Assigner", "Vérifier"];

export function SessionBuilder({ athletes, drylandLibrary, groups, planningEvents, poolBlocks, initialTemplate, initialPlanningEventId, initialExerciseId, onCreate, onCreateExercise }: SessionBuilderProps) {
  const [step, setStep] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [publishError, setPublishError] = useState<string | null>(null);
  const draftKey = `diveplan:session-builder:${initialTemplate?.id ?? "new"}`;
  const restoredDraft = useRef(false);
  const [library, setLibrary] = useState(drylandLibrary);
  const selectedInitialEvent = planningEvents.find((event) => event.id === initialPlanningEventId);
  const initialGroupId = selectedInitialEvent?.groupId ?? groups[0]?.id ?? "";
  const initialAthleteIds = athletes.filter((athlete) => athlete.groupId === initialGroupId).map((athlete) => athlete.id);
  const templateBlocks = initialTemplate?.payload.blocks ?? [];
  const templateDrylandBlocks = templateBlocks.filter((block) => block.type === "DRYLAND");
  const templatePoolBlocks = templateBlocks.filter((block) => block.type === "POOL");
  const initialPoolBlocks = templatePoolBlocks.length > 0 ? poolBlocksFromTemplate(templatePoolBlocks) : [];
  const [activePoolBlocks, setActivePoolBlocks] = useState(initialPoolBlocks);
  const [drylandBlocks, setDrylandBlocks] = useState<BuilderDrylandBlock[]>(() => templateDrylandBlocks.length > 0
    ? templateDrylandBlocks.map((block, index) => ({
        id: `template-dryland-${index}`,
        title: block.title,
        duration: block.duration,
        competitionEvaluation: block.competitionEvaluation,
        exerciseIds: block.drylandExercises.map((item) => item.exerciseId).filter((id) => drylandLibrary.some((exercise) => exercise.id === id)),
        athleteIds: block.athleteIds.filter((id) => initialAthleteIds.includes(id)),
        exerciseOverrides: Object.fromEntries(block.drylandExercises.map((item) => [item.exerciseId, { sets: item.sets, reps: item.reps, duration: item.duration, notes: item.notes }]))
      }))
    : initialExerciseId ? [{ id: "dryland-1", title: "Dryland 1", duration: 20, exerciseIds: [initialExerciseId], athleteIds: initialAthleteIds, exerciseOverrides: {} }] : []);
  const [poolAssignments, setPoolAssignments] = useState(() =>
    Object.fromEntries(activePoolBlocks.map((block) => [block.id, (block.athleteIds.length > 0 ? block.athleteIds : initialAthleteIds).filter((id) => initialAthleteIds.includes(id))]))
  );
  const templateWarmup = templateBlocks.find((block) => block.type === "WARMUP");
  const templateCooldown = templateBlocks.find((block) => block.type === "COOLDOWN");
  const [warmup, setWarmup] = useState({
    enabled: false,
    title: templateWarmup?.title ?? "Echauffement dynamique",
    duration: templateWarmup?.duration ?? 12,
    description: templateWarmup?.description ?? ""
  });
  const [cooldown, setCooldown] = useState({
    enabled: false,
    title: templateCooldown?.title ?? "Retour au calme",
    duration: templateCooldown?.duration ?? 8,
    description: templateCooldown?.description ?? ""
  });
  const [evaluationPlacement, setEvaluationPlacement] = useState("none");
  const [flashBlock, setFlashBlock] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: initialTemplate?.payload.title ?? "",
      date: selectedInitialEvent ? toMontrealDateInputValue(selectedInitialEvent.startsAt) : toMontrealDateInputValue(),
      time: selectedInitialEvent ? toMontrealDateTimeInputValue(selectedInitialEvent.startsAt).slice(11, 16) : "",
      groupId: initialGroupId,
      notes: initialTemplate?.payload.notes ?? ""
      ,planningEventId: initialPlanningEventId ?? ""
    }
  });
  const watched = useWatch({ control: form.control });
  const athleteIds = useMemo(() => athletes.filter((athlete) => athlete.groupId === (watched.groupId ?? initialGroupId)).map((athlete) => athlete.id), [athletes, initialGroupId, watched.groupId]);
  const visibleAthletes = athletes.filter((athlete) => athleteIds.includes(athlete.id));
  const effectiveDrylandBlocks = useMemo(() => {
    const validIds = new Set(athleteIds);
    return drylandBlocks.map((block) => ({ ...block, athleteIds: block.athleteIds.filter((id) => validIds.has(id)) }));
  }, [athleteIds, drylandBlocks]);
  const effectivePoolAssignments = useMemo(() => {
    const validIds = new Set(athleteIds);
    return Object.fromEntries(Object.entries(poolAssignments).map(([blockId, ids]) => [blockId, ids.filter((id) => validIds.has(id))])) as Record<string, string[]>;
  }, [athleteIds, poolAssignments]);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (raw) {
        const draft = JSON.parse(raw) as { values?: Partial<FormValues>; drylandBlocks?: BuilderDrylandBlock[]; poolBlocks?: BuilderPoolBlock[]; poolAssignments?: Record<string, string[]>; warmup?: OptionalBlock; cooldown?: OptionalBlock; evaluationPlacement?: string };
        queueMicrotask(() => {
          if (draft.values) form.reset({ ...form.getValues(), ...draft.values });
          if (draft.drylandBlocks) setDrylandBlocks(draft.drylandBlocks);
          if (draft.poolBlocks) setActivePoolBlocks(draft.poolBlocks);
          if (draft.poolAssignments) setPoolAssignments(draft.poolAssignments);
          if (draft.warmup) setWarmup({ ...draft.warmup, enabled: false });
          if (draft.cooldown) setCooldown({ ...draft.cooldown, enabled: false });
          if (draft.evaluationPlacement) setEvaluationPlacement(draft.evaluationPlacement);
          restoredDraft.current = true;
        });
      } else restoredDraft.current = true;
    } catch {
      restoredDraft.current = true;
    }
  }, [draftKey, form]);
  useEffect(() => {
    if (!restoredDraft.current) return;
    window.localStorage.setItem(draftKey, JSON.stringify({ values: watched, drylandBlocks, poolBlocks: activePoolBlocks, poolAssignments, warmup, cooldown, evaluationPlacement }));
  }, [activePoolBlocks, cooldown, draftKey, drylandBlocks, evaluationPlacement, form, poolAssignments, warmup, watched]);
  useEffect(() => {
    if (watched.planningEventId && !planningEvents.some((event) => event.id === watched.planningEventId && (!event.groupId || event.groupId === watched.groupId) && toMontrealDateInputValue(event.startsAt) === watched.date)) {
      form.setValue("planningEventId", "");
    }
  }, [form, planningEvents, watched.date, watched.groupId, watched.planningEventId]);
  useEffect(() => {
    const selectedEvent = planningEvents.find((event) => event.id === watched.planningEventId);
    if (selectedEvent) {
      const time = toMontrealDateTimeInputValue(selectedEvent.startsAt).slice(11, 16);
      form.setValue("time", time, { shouldValidate: true });
    }
  }, [form, planningEvents, watched.planningEventId]);
  const selectedDrylandExercises = useMemo(() => effectiveDrylandBlocks.reduce((sum, block) => sum + block.exerciseIds.length, 0), [effectiveDrylandBlocks]);
  const poolAssignmentValues = activePoolBlocks.map((block) => effectivePoolAssignments[block.id] ?? []);
  const allAssignedIds = uniqueIds([...effectiveDrylandBlocks.flatMap((block) => block.athleteIds), ...poolAssignmentValues.flat()]);
  const unassignedBlocks = [
    ...effectiveDrylandBlocks.map((block) => block.athleteIds.length === 0 ? block.title : null),
    ...activePoolBlocks.map((block) => ((effectivePoolAssignments[block.id] ?? []).length === 0 ? block.title : null))
  ].filter(Boolean);
  const totalDuration = Math.min(600, Math.max(15,
    effectiveDrylandBlocks.reduce((sum, block) => sum + block.duration, 0) + activePoolBlocks.reduce((sum, block) => sum + block.duration, 0)
  ));
  const poolVolume = activePoolBlocks.reduce((sum, block) => sum + block.sections.reduce((sectionSum, section) => sectionSum + sectionVolume(section), 0), 0);
  const dryVolume = effectiveDrylandBlocks.reduce((sum, block) => sum + block.exerciseIds.reduce((blockSum, exerciseId) => {
    const exercise = library.find((item) => item.id === exerciseId);
    const override = block.exerciseOverrides[exerciseId];
    const repetitions = override?.reps ?? exercise?.reps ?? 1;
    const sets = override?.sets ?? exercise?.sets ?? 1;
    return blockSum + repetitions * sets * block.athleteIds.length;
  }, 0), 0);
  const totalVolume = poolVolume + dryVolume;
  const canPublish = canPublishSession({ visibleAthletes, groups, time: watched.time ?? "", drylandBlocks, poolBlocks: activePoolBlocks, poolAssignmentValues });
  const publicationIssues = getPublicationIssues({ drylandBlocks, poolBlocks: activePoolBlocks });
  const reviewBlocks = [
    ...effectiveDrylandBlocks.map((block) => ({ id: block.id, title: block.title, type: "dryland" as const, assigned: block.athleteIds, content: `${block.exerciseIds.length} exercice${block.exerciseIds.length === 1 ? "" : "s"}` })),
    ...activePoolBlocks.map((block) => ({ id: block.id, title: block.title, type: "pool" as const, assigned: effectivePoolAssignments[block.id] ?? [], content: `${block.sections.reduce((sum, section) => sum + sectionVolume(section), 0)} répétitions` }))
  ];
  const evaluationChoices = useMemo(() => [
    { value: "none", label: "Aucune évaluation" },
    { value: "start", label: "Au début de l’entraînement" },
    ...drylandBlocks.map((block) => ({ value: `block:${block.id}`, label: `Dans le bloc « ${block.title} »` })),
    ...activePoolBlocks.map((block) => ({ value: `block:${block.id}`, label: `Dans le bloc « ${block.title} »` }))
  ], [activePoolBlocks, drylandBlocks]);
  const effectiveEvaluationPlacement = evaluationChoices.some((choice) => choice.value === evaluationPlacement) ? evaluationPlacement : "none";

  async function advanceTo(nextStep: number) {
    if (nextStep > step && !(await form.trigger())) return;
    setStep(nextStep);
  }

  function pulse(blockId: string) {
    setFlashBlock(blockId);
    window.setTimeout(() => setFlashBlock((current) => (current === blockId ? null : current)), 240);
  }

  function assignPoolBlock(blockId: string) {
    return (ids: string[]) => {
      setPoolAssignments((current) => ({ ...current, [blockId]: ids }));
      pulse(blockId);
    };
  }

  function addPoolBlock(block: BuilderPoolBlock) {
    setActivePoolBlocks((current) => [...current, block]);
    setPoolAssignments((current) => ({ ...current, [block.id]: athleteIds }));
    pulse(block.id);
  }

  function reusePoolBlock(block: BuilderPoolBlock) {
    addPoolBlock({ ...block, id: `pool-reuse-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, athleteIds });
  }

  function removePoolBlock(blockId: string) {
    setActivePoolBlocks((current) => current.filter((block) => block.id !== blockId));
    setPoolAssignments((current) => {
      const next = { ...current };
      delete next[blockId];
      return next;
    });
  }

  function updatePoolRows(blockId: string, rows: PoolListRow[]) {
    setActivePoolBlocks((current) => current.map((block) => block.id === blockId ? {
      ...block,
      sections: poolRowsToSections(rows, block.sections)
    } : block));
    pulse(blockId);
  }

  function updatePoolBlock(blockId: string, update: Partial<Pick<BuilderPoolBlock, "title" | "duration">>) {
    setActivePoolBlocks((current) => current.map((block) => block.id === blockId ? { ...block, ...update } : block));
    pulse(blockId);
  }

  function updateDrylandBlock(blockId: string, update: Partial<Omit<BuilderDrylandBlock, "id">>) {
    setDrylandBlocks((current) => current.map((block) => block.id === blockId ? { ...block, ...update } : block));
    pulse(blockId);
  }

  function toggleExercise(blockId: string, exerciseId: string, selected: boolean, occurrenceIndex?: number) {
    const block = drylandBlocks.find((item) => item.id === blockId);
    if (!block) return;
    const next = [...block.exerciseIds];
    if (selected && occurrenceIndex !== undefined) next.splice(occurrenceIndex, 1);
    else next.push(exerciseId);
    updateDrylandBlock(blockId, { exerciseIds: next });
  }

  function moveExercise(blockId: string, occurrenceIndex: number, direction: -1 | 1) {
    setDrylandBlocks((current) => current.map((block) => {
      if (block.id !== blockId) return block;
      const index = occurrenceIndex;
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= block.exerciseIds.length) return block;
      const next = [...block.exerciseIds];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return { ...block, exerciseIds: next };
    }));
    pulse(blockId);
  }

  function addDrylandBlock() {
    const id = `dryland-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setDrylandBlocks((current) => [...current, { id, title: `Dryland ${current.length + 1}`, duration: 20, exerciseIds: [], athleteIds: athleteIds, exerciseOverrides: {} }]);
    pulse(id);
  }

  async function addExercise(input: QuickExerciseInput) {
    const exercise = await onCreateExercise(input);
    setLibrary((current) => [exercise, ...current.filter((item) => item.id !== exercise.id)]);
    if (drylandBlocks.length === 0) {
      const id = `dryland-${Date.now()}`;
      setDrylandBlocks([{ id, title: "Dryland 1", duration: 20, exerciseIds: [exercise.id], athleteIds, exerciseOverrides: {} }]);
      pulse(id);
    }
  }

  function publishSession(status: "READY" | "DRAFT" = "READY") {
    const invalidPoolBlock = activePoolBlocks.find((block) => block.sections.length === 0 || poolSectionsToRows(block.sections).some((row) => validatePoolListRow(row).errors.length > 0));

    if (invalidPoolBlock) {
      const invalidRow = poolSectionsToRows(invalidPoolBlock.sections).find((row) => validatePoolListRow(row).errors.length > 0);
      const message = invalidRow ? validatePoolListRow(invalidRow).errors[0] : "Ajoute au moins une ligne de plongeons valide.";
      setPublishError(`Le bloc piscine « ${invalidPoolBlock.title || "Piscine"} » doit être corrigé : ${message}`);
      setStep(1);
      return;
    }

    void form.handleSubmit((values) => {
      setPublishError(null);
      startTransition(async () => {
        try {
          await onCreate({
            ...values,
            status,
            focus: "",
            duration: totalDuration,
            warmup: { ...warmup, enabled: false, competitionEvaluation: false },
            cooldown: { ...cooldown, enabled: false, competitionEvaluation: false },
            evaluationPlacement: effectiveEvaluationPlacement,
            drylandBlocks: effectiveDrylandBlocks.map(({ id, title, duration, exerciseIds, athleteIds: assignedAthleteIds, exerciseOverrides }) => ({ title, duration, exerciseIds, athleteIds: assignedAthleteIds, exerciseOverrides, competitionEvaluation: effectiveEvaluationPlacement === `block:${id}` })),
            poolBlocks: activePoolBlocks.map((block) => ({
              title: block.title,
              duration: block.duration,
              athleteIds: effectivePoolAssignments[block.id] ?? [],
              sections: block.sections,
              competitionEvaluation: effectiveEvaluationPlacement === `block:${block.id}`
            }))
          });
          window.localStorage.removeItem(draftKey);
        } catch (error) {
          setPublishError(error instanceof Error ? error.message : "La séance ne peut pas être enregistrée pour le moment.");
        }
      });
    })();
  }

  function movePoolBlock(blockId: string, direction: -1 | 1) {
    setActivePoolBlocks((current) => moveItem(current, current.findIndex((block) => block.id === blockId), direction));
    pulse(blockId);
  }

  function moveDrylandBlock(blockId: string, direction: -1 | 1) {
    setDrylandBlocks((current) => moveItem(current, current.findIndex((block) => block.id === blockId), direction));
    pulse(blockId);
  }

  function saveDrylandTemplate(blockId: string) {
    const block = drylandBlocks.find((item) => item.id === blockId);
    if (!block || block.exerciseIds.length === 0) return;
    const name = window.prompt("Nom du template dryland", block.title);
    if (!name?.trim()) return;
    const exercises = block.exerciseIds.map((exerciseId) => {
      const exercise = library.find((item) => item.id === exerciseId);
      const override = block.exerciseOverrides[exerciseId];
      return { exerciseId, sets: override?.sets ?? exercise?.sets ?? null, reps: override?.reps ?? exercise?.reps ?? null, duration: override?.duration ?? exercise?.duration ?? null, notes: override?.notes ?? null };
    });
    const formData = new FormData();
    formData.set("name", name.trim());
    formData.set("block", JSON.stringify({ title: block.title, duration: block.duration, exercises }));
    startTransition(() => {
      void saveDrylandBlockAsTemplate(formData)
        .then(() => window.alert("Template dryland enregistré."))
        .catch((error: unknown) => window.alert(error instanceof Error ? error.message : "Le template n'a pas pu être enregistré."));
    });
  }

  return (
    <div className="pb-24 lg:pb-0">
      <Stepper current={step} onStepChange={(nextStep) => { void advanceTo(nextStep); }} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 shadow-[var(--shadow-card)]">
        <div>
          <p className="text-sm font-black text-[var(--color-ink)]">{watched.title || "Nouvelle séance"}</p>
          <p className="text-xs font-semibold text-[var(--color-ink-muted)]">{groups.find((group) => group.id === watched.groupId)?.name ?? "Choisis un groupe"} · {formatSessionDate(watched.date ?? "")}{watched.time ? ` · ${watched.time}` : " · Heure à choisir"}</p>
        </div>
        <span className="rounded-full bg-[var(--color-success-soft)] px-3 py-1 text-xs font-black text-[var(--color-success)]">Sauvegarde auto dans ce navigateur</span>
      </div>
      {initialTemplate && (
        <div className="mb-5 rounded-[var(--radius-panel)] border border-[var(--color-brand)]/35 bg-[var(--color-brand)]/10 p-4">
          <div className="text-sm font-black uppercase text-[var(--color-brand-strong)]">Modele charge</div>
          <div className="mt-1 text-xl font-black">{initialTemplate.name}</div>
          <p className="mt-1 text-sm font-semibold text-[var(--color-ink-muted)]">
            {initialTemplate.category} - {initialTemplate.payload.blocks.length} blocs seront recrees avec leurs exercices, plongeons et assignations.
          </p>
        </div>
      )}
      {publishError && <div role="alert" className="mb-5 rounded-2xl border border-[var(--color-danger)]/25 bg-red-50 p-4 text-sm font-semibold text-[var(--color-danger)]">{publishError}</div>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          {step === 0 && <DetailsStep form={form} selectedGroupId={watched.groupId ?? ""} selectedDate={watched.date ?? ""} selectedPlanningEventId={watched.planningEventId ?? ""} selectedTime={watched.time ?? ""} groups={groups} planningEvents={planningEvents} evaluationPlacement={effectiveEvaluationPlacement} evaluationChoices={evaluationChoices} onEvaluationPlacementChange={setEvaluationPlacement} />}
          {step === 1 && (
            <div className="space-y-8">
              <div className="rounded-[var(--radius-panel)] bg-[var(--color-navy)] p-5 text-white">
                <p className="text-xs font-black uppercase tracking-wide text-[var(--color-brand)]">Étape 2 · Contenu</p>
                <h2 className="mt-2 text-2xl font-black">Compose l’entraînement</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-white/70">Ajoute les blocs dryland et piscine dont le groupe a besoin. Tu pourras ensuite attribuer chaque bloc aux bons athlètes.</p>
              </div>
              <DrylandStep
                exercises={library}
                blocks={effectiveDrylandBlocks}
                athletes={visibleAthletes}
                flashBlock={flashBlock}
                onToggleExercise={toggleExercise}
                onMoveExercise={moveExercise}
                onUpdateBlock={updateDrylandBlock}
                onAddBlock={addDrylandBlock}
                onRemoveBlock={(blockId) => setDrylandBlocks((current) => current.filter((block) => block.id !== blockId))}
                onMoveBlock={moveDrylandBlock}
                onSaveBlockTemplate={saveDrylandTemplate}
                onCreateExercise={addExercise}
              />
              <PoolStep
                poolBlocks={activePoolBlocks}
                recentBlocks={poolBlocks}
                flashBlock={flashBlock}
                onAddPoolBlock={addPoolBlock}
                onReusePoolBlock={reusePoolBlock}
                onRemovePoolBlock={removePoolBlock}
                onMoveBlock={movePoolBlock}
                onUpdatePoolBlock={updatePoolBlock}
                onUpdatePoolRows={updatePoolRows}
              />
            </div>
          )}
          {step === 2 && (
            <AssignmentsStep
              athletes={visibleAthletes}
              drylandBlocks={effectiveDrylandBlocks}
              poolBlocks={activePoolBlocks}
              poolAssignments={poolAssignments}
              flashBlock={flashBlock}
              onAssignDry={(blockId, ids) => updateDrylandBlock(blockId, { athleteIds: ids })}
              onAssignPoolBlock={assignPoolBlock}
            />
          )}
          {step === 3 && (
            <PublicationStep
              title={watched.title ?? ""}
              groupName={groups.find((group) => group.id === watched.groupId)?.name ?? "Groupe à choisir"}
              scheduleName={planningEvents.find((event) => event.id === watched.planningEventId)?.title ?? "Aucun horaire lié"}
              date={watched.date ?? ""}
              time={watched.time ?? ""}
              totalVolume={totalVolume}
              unassignedBlocks={unassignedBlocks.length}
              selectedExercises={selectedDrylandExercises}
              athleteCount={allAssignedIds.length}
              validationIssues={publicationIssues}
              blocks={reviewBlocks}
              athletes={visibleAthletes}
            />
          )}
        </div>

        <SummaryPanel
              title={watched.title ?? "Nouvelle séance"}
          date={watched.date ?? ""}
          blockCount={activePoolBlocks.length + drylandBlocks.length}
          athleteCount={allAssignedIds.length}
          unassignedCount={unassignedBlocks.length}
          totalVolume={totalVolume}
          step={step}
          isPending={isPending}
          canPublish={canPublish}
          onBack={() => setStep(Math.max(0, step - 1))}
          onSaveDraft={() => publishSession("DRAFT")}
          onPublish={() => publishSession("READY")}
        />
      </div>

      <div className={cn("mt-6 hidden items-center justify-between gap-3 lg:flex", step === 3 && "xl:hidden")}>
        <Button type="button" variant="outline" disabled={step === 0 || isPending} onClick={() => setStep(step - 1)}>Retour</Button>
        {step < 3 ? (
          <Button type="button" variant="action" disabled={isPending} onClick={() => void advanceTo(Math.min(3, step + 1))}>Continuer <ChevronDown className="h-4 w-4 -rotate-90" /></Button>
        ) : (
          <div className="flex gap-2"><Button type="button" variant="outline" disabled={isPending || !canPublish} onClick={() => publishSession("DRAFT")}><FileText className="h-4 w-4" /> Brouillon privé</Button><Button type="button" variant="action" disabled={isPending || !canPublish} onClick={() => publishSession("READY")}>{isPending ? "Publication…" : "Publier la séance"}<Send className="h-4 w-4" /></Button></div>
        )}
      </div>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-border)] bg-white/95 p-3 shadow-[0_-16px_34px_rgba(7,20,35,0.12)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <Button type="button" variant="outline" disabled={step === 0 || isPending} onClick={() => setStep(step - 1)}>Retour</Button>
          {step === 3 && <Button type="button" variant="outline" size="sm" disabled={isPending || !canPublish} onClick={() => publishSession("DRAFT")} aria-label="Enregistrer comme brouillon privé"><FileText className="h-4 w-4" /> Brouillon</Button>}
          <Button type="button" variant={step === 3 ? "action" : "default"} disabled={isPending || (step === 3 && !canPublish)} onClick={() => (step === 3 ? publishSession("READY") : void advanceTo(Math.min(3, step + 1)))}>
            {step === 3 ? (isPending ? "Publication…" : "Publier") : "Continuer"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Stepper({ current, onStepChange }: { current: number; onStepChange: (step: number) => void }) {
  return (
    <div className="mb-6 overflow-x-auto">
      <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
        {steps.map((label, index) => (
          <button key={label} type="button" onClick={() => onStepChange(index)} className={cn("flex min-h-12 items-center gap-3 rounded-2xl border px-3 text-left text-sm font-black transition duration-[var(--duration-fast)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]", current === index ? "border-[var(--color-navy)] bg-[var(--color-navy)] text-white" : "border-[var(--color-border)] bg-white text-[var(--color-ink-muted)] hover:border-[var(--color-brand)]")}>
            <span className={cn("flex h-7 w-7 items-center justify-center rounded-full text-xs", current === index ? "bg-[var(--color-brand)] text-[var(--color-navy)]" : "bg-[var(--color-surface-raised)]")}>{index + 1}</span>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

type OptionalBlock = { enabled: boolean; title: string; duration: number; description: string };

function DetailsStep({ form, selectedGroupId, selectedDate, selectedPlanningEventId, selectedTime, groups, planningEvents, evaluationPlacement, evaluationChoices, onEvaluationPlacementChange }: { form: ReturnType<typeof useForm<FormValues>>; selectedGroupId: string; selectedDate: string; selectedPlanningEventId: string; selectedTime: string; groups: BuilderGroup[]; planningEvents: BuilderPlanningEvent[]; evaluationPlacement: string; evaluationChoices: Array<{ value: string; label: string }>; onEvaluationPlacementChange: (value: string) => void }) {
  return (
    <Card>
      <CardHeader><CardTitle>Quand et pour qui ?</CardTitle><p className="text-sm text-[var(--color-ink-muted)]">Les informations du groupe et du créneau seront reprises dans le planning.</p></CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <Field label="Nom de la séance"><Input placeholder="Ex. Technique d’entrée — Groupe provincial" {...form.register("title")} />{form.formState.errors.title && <span role="alert" className="text-xs font-bold text-[var(--color-danger)]">{form.formState.errors.title.message}</span>}</Field>
        <Field label="Date"><Input type="date" {...form.register("date")} />{form.formState.errors.date && <span role="alert" className="text-xs font-bold text-[var(--color-danger)]">Choisis la date de la séance.</span>}</Field>
        <Field label="Heure">{selectedPlanningEventId ? <><Input type="time" value={selectedTime} disabled /><input type="hidden" {...form.register("time")} /></> : <Input type="time" required {...form.register("time")} />}<span className="mt-1 block text-xs font-semibold normal-case text-[var(--color-ink-muted)]">{selectedPlanningEventId ? "Reprise de l’horaire sélectionné." : "Heure de début."}</span>{form.formState.errors.time && <span role="alert" className="text-xs font-bold text-[var(--color-danger)]">Choisis l’heure de début.</span>}</Field>
        <Field label="Groupe">
          <select className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm font-semibold focus:outline-none focus:shadow-[var(--focus-ring)]" {...form.register("groupId")}>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
        </Field>
        <Field label="Horaire du groupe" className="md:col-span-2">
          <select className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm font-semibold focus:outline-none focus:shadow-[var(--focus-ring)]" {...form.register("planningEventId")}>
            <option value="">Aucun horaire lié</option>
            {planningEvents.filter((event) => (!event.groupId || event.groupId === selectedGroupId) && toMontrealDateInputValue(event.startsAt) === selectedDate).map((event) => <option key={event.id} value={event.id}>{event.title} · {new Intl.DateTimeFormat("fr-CA", { dateStyle: "short", timeStyle: "short", timeZone: "America/Toronto" }).format(event.startsAt)}{event.location ? ` · ${event.location}` : ""}</option>)}
          </select>
          <span className="mt-1 block text-xs font-semibold normal-case text-[var(--color-ink-muted)]">L’horaire reste affiché dans le planning; la séance sera ouverte depuis ce même élément.</span>
        </Field>
        <details className="md:col-span-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
          <summary className="cursor-pointer font-black">Options supplémentaires</summary>
          <div className="mt-4 grid gap-4">
            <Field label="Consignes pour le coach"><Textarea placeholder="Objectif de la séance, matériel ou consignes à retenir…" {...form.register("notes")} /></Field>
            <Field label="Évaluation de confiance (facultatif)">
              <select aria-label="Moment de l’évaluation de confiance" className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm font-semibold focus:outline-none focus:shadow-[var(--focus-ring)]" value={evaluationPlacement} onChange={(event) => onEvaluationPlacementChange(event.target.value)}>
                {evaluationChoices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
              </select>
            </Field>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

function DrylandStep(props: {
  exercises: BuilderExercise[];
  blocks: BuilderDrylandBlock[];
  athletes: BuilderAthlete[];
  flashBlock: string | null;
  onToggleExercise: (blockId: string, exerciseId: string, selected: boolean, occurrenceIndex?: number) => void;
  onMoveExercise: (blockId: string, occurrenceIndex: number, direction: -1 | 1) => void;
  onUpdateBlock: (blockId: string, update: Partial<Omit<BuilderDrylandBlock, "id">>) => void;
  onAddBlock: () => void;
  onRemoveBlock: (blockId: string) => void;
  onMoveBlock: (blockId: string, direction: -1 | 1) => void;
  onSaveBlockTemplate: (blockId: string) => void;
  onCreateExercise: (input: QuickExerciseInput) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-panel)] border border-[var(--block-dryland-fg)]/20 bg-[var(--block-dryland-bg)]/45 p-4">
        <div><h2 className="text-xl font-black">Blocs dryland</h2><p className="mt-1 text-sm font-semibold text-[var(--color-ink-muted)]">Crée plusieurs blocs avec des exercices et des athlètes différents.</p></div>
        <Button type="button" onClick={props.onAddBlock}><Plus className="h-4 w-4" /> Ajouter un bloc dryland</Button>
      </div>
      <QuickExerciseForm onCreateExercise={props.onCreateExercise} />
      {props.blocks.map((block, blockIndex) => {
        const selectedExercises = orderExercises(props.exercises, block.exerciseIds);
        const availableExercises = props.exercises.filter((exercise) => `${exercise.name} ${exercise.category} ${exercise.equipment ?? ""}`.toLocaleLowerCase("fr").includes(search.trim().toLocaleLowerCase("fr")));
        const renderExercise = (exercise: BuilderExercise, selected: boolean, occurrenceIndex?: number) => (
          <div key={selected ? `${exercise.id}-${occurrenceIndex}` : exercise.id} className={cn("grid gap-3 rounded-2xl border p-3 sm:grid-cols-[auto_1fr_auto] sm:items-center", selected ? "border-[var(--block-dryland-fg)]/30 bg-[var(--block-dryland-bg)]/45" : "border-[var(--color-border)] bg-white")}>
            <button type="button" onClick={() => props.onToggleExercise(block.id, exercise.id, selected, occurrenceIndex)} className={cn("flex h-11 w-11 items-center justify-center rounded-xl border focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]", selected ? "border-[var(--color-success)] bg-[var(--color-success)] text-white" : "border-[var(--color-border)] text-[var(--color-ink-soft)]")} aria-label={`${selected ? "Retirer" : "Ajouter encore"} ${exercise.name} ${selected ? "du" : "au"} bloc ${block.title}`}>
              {selected ? <CheckCircle2 className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
            </button>
            <div>
              <div className="font-black">{exercise.name}</div>
              <div className="text-sm text-[var(--color-ink-muted)]">{exercise.sets ?? 1} x {exercise.roundTrip ? "Aller-retour" : exercise.reps ?? `${exercise.duration ?? 30} sec`} - {exercise.equipment ?? "Aucun"}</div>
              {selected && <div className="mt-2 grid gap-2 sm:grid-cols-4">
                {(["sets", ...(exercise.roundTrip ? [] : ["reps", "duration"])] as ("sets" | "reps" | "duration")[]).map((field) => {
                  const value = block.exerciseOverrides[exercise.id]?.[field] ?? exercise[field];
                  return <Input key={field} aria-label={`${field === "sets" ? "Séries" : field === "reps" ? "Répétitions" : "Durée"} ${exercise.name}`} type="number" min="1" value={value ?? ""} placeholder={field === "sets" ? "Séries" : field === "reps" ? "Répétitions" : "Sec."} onChange={(event) => props.onUpdateBlock(block.id, { exerciseOverrides: { ...block.exerciseOverrides, [exercise.id]: { sets: block.exerciseOverrides[exercise.id]?.sets ?? exercise.sets, reps: block.exerciseOverrides[exercise.id]?.reps ?? exercise.reps, duration: block.exerciseOverrides[exercise.id]?.duration ?? exercise.duration, notes: block.exerciseOverrides[exercise.id]?.notes ?? null, [field]: event.target.value ? Number(event.target.value) : null } } })} />;
                })}
                <Input aria-label={`Note ${exercise.name}`} value={block.exerciseOverrides[exercise.id]?.notes ?? ""} placeholder="Note" onChange={(event) => props.onUpdateBlock(block.id, { exerciseOverrides: { ...block.exerciseOverrides, [exercise.id]: { sets: block.exerciseOverrides[exercise.id]?.sets ?? exercise.sets, reps: block.exerciseOverrides[exercise.id]?.reps ?? exercise.reps, duration: block.exerciseOverrides[exercise.id]?.duration ?? exercise.duration, notes: event.target.value || null } } })} />
              </div>}
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-[var(--color-ink-muted)]">{exercise.category}</span>
              {selected && <div className="flex gap-1"><button type="button" aria-label={`Monter ${exercise.name}`} onClick={() => props.onMoveExercise(block.id, occurrenceIndex!, -1)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--color-border)] bg-white"><ArrowUp className="h-4 w-4" /></button><button type="button" aria-label={`Descendre ${exercise.name}`} onClick={() => props.onMoveExercise(block.id, occurrenceIndex!, 1)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--color-border)] bg-white"><ArrowDown className="h-4 w-4" /></button></div>}
            </div>
          </div>
        );
        return (
          <div key={block.id}>
            <BlockCard type="dryland" title={block.title || `Dryland ${blockIndex + 1}`} assigned={block.athleteIds} athletes={props.athletes} state={selectedExercises.length > 0 ? "Prêt" : "À compléter"} flash={props.flashBlock === block.id} canMoveUp={blockIndex > 0} canMoveDown={blockIndex < props.blocks.length - 1} onMoveUp={() => props.onMoveBlock(block.id, -1)} onMoveDown={() => props.onMoveBlock(block.id, 1)} onSaveTemplate={() => props.onSaveBlockTemplate(block.id)}>
              <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                <Input aria-label={`Nom du bloc dryland ${blockIndex + 1}`} value={block.title} placeholder={`Dryland ${blockIndex + 1}`} onChange={(event) => props.onUpdateBlock(block.id, { title: event.target.value })} />
                <Button type="button" variant="outline" aria-label={`Supprimer ${block.title}`} onClick={() => props.onRemoveBlock(block.id)}><Trash2 className="h-4 w-4" /> Supprimer</Button>
              </div>
              <div className="mb-4 rounded-2xl bg-[var(--color-surface-raised)] p-3 text-sm font-semibold text-[var(--color-ink-muted)]">Choisis et ordonne uniquement les exercices de ce bloc.</div>
              <div className="max-h-[520px] space-y-4 overflow-y-auto pr-1">
                {selectedExercises.length > 0 && <div className="space-y-2">
                  <div className="text-sm font-black uppercase tracking-wide text-[var(--block-dryland-fg)]">Exercices sélectionnés</div>
                  {selectedExercises.map((exercise, occurrenceIndex) => renderExercise(exercise, true, occurrenceIndex))}
                </div>}
                <div className="space-y-2">
                  <div className="text-sm font-black uppercase tracking-wide text-[var(--color-ink-muted)]">Exercices disponibles</div>
                  <label className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-soft)]" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un exercice…" aria-label="Rechercher un exercice dryland" className="pl-9" /></label>
                  {availableExercises.length > 0 ? availableExercises.map((exercise) => renderExercise(exercise, false)) : <div className="rounded-2xl bg-[var(--color-surface-raised)] p-3 text-sm font-semibold text-[var(--color-ink-muted)]">Aucun exercice trouvé.</div>}
                </div>
              </div>
              {selectedExercises.length === 0 && <WarningText>Ajoute au moins un exercice à ce bloc.</WarningText>}
            </BlockCard>
          </div>
        );
      })}
      {props.blocks.length === 0 && <div className="rounded-[var(--radius-panel)] border border-dashed border-[var(--color-border)] bg-white p-8 text-center text-sm font-semibold text-[var(--color-ink-muted)]">Aucun bloc dryland. Ajoute-en un si cette séance en a besoin.</div>}
    </div>
  );
}

function QuickExerciseForm({ onCreateExercise }: { onCreateExercise: (input: QuickExerciseInput) => Promise<void> }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [roundTrip, setRoundTrip] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get("name") ?? "").trim();
    const category = String(formData.get("category") ?? "").trim() || "Custom";
    const equipment = String(formData.get("equipment") ?? "").trim();
    const tags = String(formData.get("tags") ?? "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    if (name.length < 2) {
      setError("Nom d'exercice requis.");
      return;
    }

    setError(null);
    startTransition(() => {
      void onCreateExercise({
        name,
        category,
        equipment,
        defaultSets: optionalNumber(formData.get("sets")),
        defaultReps: roundTrip ? null : optionalNumber(formData.get("reps")),
        defaultDuration: roundTrip ? null : optionalNumber(formData.get("duration")),
        roundTrip: formData.get("roundTrip") === "on",
        tags
      })
        .then(() => { form.reset(); setRoundTrip(false); })
        .catch((caught) => setError(caught instanceof Error ? caught.message : "Creation impossible."));
    });
  }

  return (
    <form onSubmit={submit} className="mb-4 rounded-[var(--radius-panel)] border border-[var(--block-dryland-fg)]/20 bg-[var(--block-dryland-bg)]/45 p-4">
      <div className="mb-3 flex items-center gap-2 font-black text-[var(--block-dryland-fg)]"><Plus className="h-4 w-4" /> Créer un exercice rapide</div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Input name="name" placeholder="Nom de l'exercice" required />
        <Input name="category" placeholder="Catégorie" defaultValue="Custom" />
        <Input name="equipment" placeholder="Équipement" />
        <Input name="tags" placeholder="Tags: force, ouverture" />
        <Input name="sets" type="number" min="1" placeholder="Séries" />
        <label className="flex items-center gap-2 text-sm font-bold"><input name="roundTrip" type="checkbox" checked={roundTrip} onChange={(event) => setRoundTrip(event.target.checked)} className="h-4 w-4 accent-[var(--color-brand)]" /> Aller-retour</label>
        {!roundTrip && <><Input name="reps" type="number" min="1" placeholder="Répétitions" /><Input name="duration" type="number" min="1" placeholder="Durée sec." /></>}
        <Button type="submit" variant="action" disabled={pending}><Plus className="h-4 w-4" /> {pending ? "Création..." : "Ajouter"}</Button>
      </div>
      {error && <div className="mt-3 rounded-xl bg-[var(--color-danger)]/10 p-3 text-sm font-semibold text-[var(--color-danger)]">{error}</div>}
    </form>
  );
}

function QuickPoolBlockForm({ onAdd }: { onAdd: (block: BuilderPoolBlock) => void }) {
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    const duration = Number(data.get("duration"));

    if (title.length < 2 || !Number.isInteger(duration) || duration < 1) {
      setError("Complete le nom du bloc et la duree.");
      return;
    }

    onAdd({
      id: `custom-pool-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title,
      duration,
      athleteIds: [],
      sections: []
    });
    setError(null);
    form.reset();
  }

  return (
    <form onSubmit={submit} className="rounded-[var(--radius-panel)] border border-[var(--block-pool-fg)]/25 bg-[var(--block-pool-bg)]/50 p-4">
      <div className="mb-1 flex items-center gap-2 text-lg font-black text-[var(--block-pool-fg)]"><Plus className="h-5 w-5" /> Creer un bloc piscine personnalise</div>
      <p className="mb-4 text-sm font-semibold text-[var(--color-ink-muted)]">Le bloc est créé vide. Tu pourras ajouter ses lignes de plongeons ensuite.</p>
      <div className="grid gap-3 md:grid-cols-2">
        <Input name="title" placeholder="Nom du bloc" required />
        <Input name="duration" type="number" min="1" defaultValue="30" placeholder="Duree (min)" required />
      </div>
      <Button type="submit" variant="action" className="mt-3"><Plus className="h-4 w-4" /> Ajouter le bloc vide</Button>
      {error && <div className="mt-3 rounded-xl bg-[var(--color-danger)]/10 p-3 text-sm font-semibold text-[var(--color-danger)]">{error}</div>}
    </form>
  );
}

function PoolStep({ poolBlocks, recentBlocks, flashBlock, onAddPoolBlock, onReusePoolBlock, onRemovePoolBlock, onMoveBlock, onUpdatePoolBlock, onUpdatePoolRows }: {
  poolBlocks: BuilderPoolBlock[];
  recentBlocks: BuilderPoolBlock[];
  flashBlock: string | null;
  onAddPoolBlock: (block: BuilderPoolBlock) => void;
  onReusePoolBlock: (block: BuilderPoolBlock) => void;
  onRemovePoolBlock: (blockId: string) => void;
  onMoveBlock: (blockId: string, direction: -1 | 1) => void;
  onUpdatePoolBlock: (blockId: string, update: Partial<Pick<BuilderPoolBlock, "title" | "duration">>) => void;
  onUpdatePoolRows: (blockId: string, rows: PoolListRow[]) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-panel)] border border-[var(--block-pool-fg)]/20 bg-[var(--block-pool-bg)]/45 p-4">
        <div><h2 className="text-xl font-black">Blocs piscine</h2><p className="mt-1 text-sm font-semibold text-[var(--color-ink-muted)]">Ajoute et organise les listes de plongeons prévues pour le bassin.</p></div>
        <QuickPoolBlockForm onAdd={onAddPoolBlock} />
      </div>
      {recentBlocks.length > 0 && <details className="rounded-2xl border border-[var(--color-border)] bg-white p-4"><summary className="cursor-pointer font-black">Reprendre une liste récente <span className="ml-1 text-sm font-semibold text-[var(--color-ink-muted)]">({recentBlocks.length})</span></summary><div className="mt-3 grid gap-2 md:grid-cols-2">{recentBlocks.map((block) => <div key={block.id} className="flex items-center justify-between gap-3 rounded-xl bg-[var(--color-surface-raised)] p-3"><div className="min-w-0"><div className="truncate font-bold">{block.title}</div><div className="text-xs text-[var(--color-ink-muted)]">{block.sections.reduce((sum, section) => sum + section.dives.length, 0)} lignes · {block.duration} min</div></div><Button type="button" size="sm" variant="outline" onClick={() => onReusePoolBlock(block)}>Ajouter</Button></div>)}</div></details>}
      {poolBlocks.map((block) => (
        <PoolBlock key={block.id} block={block} blockIndex={poolBlocks.indexOf(block)} blockCount={poolBlocks.length} flash={flashBlock === block.id} onRemove={() => onRemovePoolBlock(block.id)} onMove={(direction) => onMoveBlock(block.id, direction)} onUpdate={(update) => onUpdatePoolBlock(block.id, update)} onRowsChange={(rows) => onUpdatePoolRows(block.id, rows)} />
      ))}
      {poolBlocks.length === 0 && (
        <Card>
          <CardContent className="p-5">
            <WarningText>Aucun bloc piscine pour le moment. Utilise le formulaire ci-dessus pour creer ton premier bloc personnalise.</WarningText>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PoolBlock({ block, blockIndex, blockCount, flash, onRemove, onMove, onUpdate, onRowsChange }: { block: BuilderPoolBlock; blockIndex: number; blockCount: number; flash: boolean; onRemove: () => void; onMove: (direction: -1 | 1) => void; onUpdate: (update: Partial<Pick<BuilderPoolBlock, "title" | "duration">>) => void; onRowsChange: (rows: PoolListRow[]) => void }) {
  return (
    <div>
      <BlockCard type="pool" title={block.title || "Piscine"} assigned={[]} athletes={[]} state={poolBlockIsValid(block) ? "Liste prête" : "À compléter"} flash={flash} canMoveUp={blockIndex > 0} canMoveDown={blockIndex < blockCount - 1} onMoveUp={() => onMove(-1)} onMoveDown={() => onMove(1)}>
        <div className="mb-4">
          <Input aria-label={`Nom du bloc piscine ${block.title}`} value={block.title} placeholder="Nom du bloc piscine" onChange={(event) => onUpdate({ title: event.target.value })} />
        </div>
        <label className="mb-4 flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-white p-3 font-black">
          <input type="checkbox" defaultChecked onChange={(event) => { if (!event.target.checked) onRemove(); }} /> Inclure ce bloc dans l&apos;entraînement
        </label>
        <PoolListTable rows={poolSectionsToRows(block.sections)} onChange={onRowsChange} />
      </BlockCard>
    </div>
  );
}

function AssignmentsStep(props: { athletes: BuilderAthlete[]; drylandBlocks: BuilderDrylandBlock[]; poolBlocks: BuilderPoolBlock[]; poolAssignments: Record<string, string[]>; flashBlock: string | null; onAssignDry: (blockId: string, ids: string[]) => void; onAssignPoolBlock: (blockId: string) => (ids: string[]) => void }) {
  const assignmentBlocks = [
    ...props.drylandBlocks.map((block) => ({ id: block.id, title: block.title, assigned: block.athleteIds, onAssign: (ids: string[]) => props.onAssignDry(block.id, ids), type: "dryland" as const })),
    ...props.poolBlocks.map((block) => ({
      id: block.id,
      title: block.title,
      assigned: props.poolAssignments[block.id] ?? [],
      onAssign: props.onAssignPoolBlock(block.id),
      type: "pool" as const
    }))
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-[var(--radius-panel)] bg-[var(--color-navy)] p-5 text-white">
        <p className="text-xs font-black uppercase tracking-wide text-[var(--color-brand)]">Étape 3 · Athlètes</p>
        <h2 className="mt-2 text-2xl font-black">Qui fait chaque bloc ?</h2>
        <p className="mt-2 text-sm leading-6 text-white/70">Le groupe entier est sélectionné par défaut. Garde ce choix ou adapte les athlètes bloc par bloc.</p>
      </div>
      {assignmentBlocks.length === 0 && <Card><CardContent className="p-5"><WarningText>Ajoute d’abord un bloc dryland ou piscine à l’étape Composer.</WarningText></CardContent></Card>}
      {assignmentBlocks.map((block) => (
        <div key={block.id} className={cn("grid gap-5 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-white p-4 lg:grid-cols-[1fr_1.1fr]", props.flashBlock === block.id && "builder-pulse")}>
          <div>
            <BlockTypeBadge type={block.type} />
            <h3 className="mt-3 text-xl font-black">{block.title}</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--color-ink-muted)]">{block.assigned.length > 1 ? "Plusieurs athletes partagent ce bloc." : block.assigned.length === 1 ? "Bloc individuel." : "Aucune assignation."}</p>
            <div className="mt-4"><AthleteAvatarGroup ids={block.assigned} athletes={props.athletes} limit={8} /></div>
          </div>
          <AssignmentSelector selected={block.assigned} onChange={block.onAssign} athletes={props.athletes} />
        </div>
      ))}
    </div>
  );
}

function PublicationStep({ title, groupName, scheduleName, date, time, totalVolume, unassignedBlocks, selectedExercises, athleteCount, validationIssues, blocks, athletes }: { title: string; groupName: string; scheduleName: string; date: string; time: string; totalVolume: number; unassignedBlocks: number; selectedExercises: number; athleteCount: number; validationIssues: string[]; blocks: Array<{ id: string; title: string; type: "dryland" | "pool"; assigned: string[]; content: string }>; athletes: BuilderAthlete[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>Vérifier avant de publier</CardTitle><p className="text-sm text-[var(--color-ink-muted)]">Les athlètes recevront le plan dès sa publication.</p></CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-[var(--radius-panel)] border border-[var(--color-navy)] bg-[var(--color-navy)] p-5 text-white">
          <StatusPill status="READY" />
          <h2 className="mt-4 text-3xl font-black leading-none text-white">{title || "Nouvelle seance"}</h2>
          <p className="mt-3 text-sm leading-6 text-white/68">{groupName} · {formatSessionDate(date)}{time ? ` · ${time}` : ""}</p>
          <p className="mt-1 text-sm text-white/55">{scheduleName}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <DarkMetric label="Athlètes assignés" value={athleteCount} />
            <DarkMetric label="Volume" value={totalVolume} />
            <DarkMetric label="Exercices" value={selectedExercises} />
          </div>
        </div>
        <div className="space-y-2">
          <h3 className="font-black">Contenu de la séance</h3>
          {blocks.map((block) => <div key={block.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] p-3"><div className="flex min-w-0 items-center gap-2"><BlockTypeBadge type={block.type} /><span className="truncate font-bold">{block.title}</span></div><div className="flex items-center gap-3"><span className="text-sm text-[var(--color-ink-muted)]">{block.content}</span><AthleteAvatarGroup ids={block.assigned} athletes={athletes} limit={8} /></div></div>)}
          {blocks.length === 0 && <p className="rounded-xl bg-[var(--color-surface-raised)] p-3 text-sm text-[var(--color-ink-muted)]">Aucun bloc ajouté.</p>}
        </div>
        {unassignedBlocks > 0 && <WarningText>{unassignedBlocks} bloc{unassignedBlocks > 1 ? "s" : ""} sans athlète assigné. Retourne à l’étape Assigner pour les corriger.</WarningText>}
        {blocks.length > 0 && unassignedBlocks === 0 && <div className="rounded-2xl border border-[var(--color-success)]/25 bg-[var(--color-success-soft)] p-4 text-sm font-bold text-[var(--color-success)]">Tous les blocs ont des athlètes assignés.</div>}
        {validationIssues.length > 0 && <div className="rounded-2xl border border-[var(--color-action)]/30 bg-[var(--color-action)]/10 p-4"><p className="font-black text-[var(--color-action-strong)]">À corriger avant la publication</p><ul className="mt-2 list-inside list-disc space-y-1 text-sm font-semibold text-[var(--color-action-strong)]">{validationIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
        <div className="rounded-2xl bg-[var(--color-surface-raised)] p-4 text-sm font-semibold text-[var(--color-ink-muted)]">
          La séance peut être publiée maintenant ou enregistrée comme brouillon privé. Un brouillon reste invisible aux athlètes jusqu’à sa publication.
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryPanel(props: { title: string; date: string; blockCount: number; athleteCount: number; unassignedCount: number; totalVolume: number; step: number; isPending: boolean; canPublish: boolean; onBack: () => void; onSaveDraft: () => void; onPublish: () => void }) {
  return (
    <aside className="hidden xl:block">
      <Card className="sticky top-6">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Résumé en direct</CardTitle>
              <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{props.title}</p>
            </div>
            <span className="rounded-full bg-[var(--color-surface-raised)] px-2.5 py-1 text-xs font-black text-[var(--color-ink-muted)]">Brouillon</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <SummaryMetric icon={CalendarPlus} label="Date" value={formatSessionDate(props.date)} />
          <SummaryMetric icon={FileText} label="Blocs" value={props.blockCount} />
          <SummaryMetric icon={Users} label="Athlètes concernés" value={props.athleteCount} />
          <SummaryMetric icon={AlertTriangle} label="Blocs sans athlètes" value={props.unassignedCount} tone={props.unassignedCount > 0 ? "warning" : "default"} />
          <SummaryMetric icon={Waves} label="Volume estimé" value={props.totalVolume} />
          {props.step === 3 && <div className="space-y-2 border-t border-[var(--color-border)] pt-4">
            <Button type="button" variant="outline" className="w-full" disabled={props.isPending} onClick={props.onBack}>Retour</Button>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" size="sm" disabled={props.isPending || !props.canPublish} onClick={props.onSaveDraft}><FileText className="h-4 w-4" /> Brouillon privé</Button>
              <Button type="button" variant="action" size="sm" disabled={props.isPending || !props.canPublish} onClick={props.onPublish}>{props.isPending ? "Publication…" : "Publier la séance"}<Send className="h-4 w-4" /></Button>
            </div>
          </div>}
        </CardContent>
      </Card>
    </aside>
  );
}

function BlockCard({ type, title, assigned, athletes, state, flash, canMoveUp, canMoveDown, onMoveUp, onMoveDown, onSaveTemplate, children }: { type: "dryland" | "pool"; title: string; assigned: string[]; athletes: BuilderAthlete[]; state: string; flash?: boolean; canMoveUp?: boolean; canMoveDown?: boolean; onMoveUp?: () => void; onMoveDown?: () => void; onSaveTemplate?: () => void; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const contentId = useId();

  return (
    <Card className={cn("block-card overflow-hidden", flash && "builder-pulse")}>
      <div className={cn("h-2", type === "dryland" ? "bg-[var(--block-dryland-fg)]" : "bg-[var(--block-pool-fg)]")} />
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <BlockTypeBadge type={type} />
            <CardTitle className="mt-3 text-2xl">{title}</CardTitle>
            <div className="mt-2 flex flex-wrap gap-3 text-sm font-bold text-[var(--color-ink-muted)]">
              <span>{assigned.length} athlete{assigned.length > 1 ? "s" : ""}</span>
              <span>{state}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AthleteAvatarGroup ids={assigned} athletes={athletes} limit={5} />
            {(onMoveUp || onMoveDown) && <div className="flex items-center gap-1">
              <button type="button" aria-label={`Monter le bloc ${title}`} disabled={!canMoveUp} onClick={onMoveUp} className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--color-border)] bg-white text-[var(--color-ink-muted)] transition hover:border-[var(--color-brand)] hover:text-[var(--color-brand-strong)] disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"><ArrowUp className="h-5 w-5" /></button>
              <button type="button" aria-label={`Descendre le bloc ${title}`} disabled={!canMoveDown} onClick={onMoveDown} className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--color-border)] bg-white text-[var(--color-ink-muted)] transition hover:border-[var(--color-brand)] hover:text-[var(--color-brand-strong)] disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"><ArrowDown className="h-5 w-5" /></button>
            </div>}
            <button
              type="button"
              aria-expanded={!collapsed}
              aria-controls={contentId}
              aria-label={`${collapsed ? "Ouvrir" : "Réduire"} le bloc ${title}`}
              onClick={() => setCollapsed((value) => !value)}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--color-border)] bg-white text-[var(--color-ink-muted)] transition hover:border-[var(--color-brand)] hover:text-[var(--color-brand-strong)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              {collapsed ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
            </button>
            {onSaveTemplate && <button type="button" aria-label={`Enregistrer ${title} comme template`} title="Enregistrer comme template" onClick={onSaveTemplate} className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--color-border)] bg-white text-[var(--color-ink-muted)] transition hover:border-[var(--color-brand)] hover:text-[var(--color-brand-strong)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"><BookmarkPlus className="h-4 w-4" /></button>}
            <details className="relative">
              <summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-xl border border-[var(--color-border)] bg-white focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"><MoreHorizontal className="h-4 w-4" /></summary>
              <div className="absolute right-0 z-10 mt-2 w-52 rounded-2xl border border-[var(--color-border)] bg-white p-3 text-sm font-semibold text-[var(--color-ink-muted)] shadow-[var(--shadow-soft)]">Les actions de duplication et suppression ne sont pas connectees au backend actuel.</div>
            </details>
          </div>
        </div>
        {assigned.length === 0 && <WarningText>Ce bloc n&apos;est assigne a personne.</WarningText>}
      </CardHeader>
      <CardContent id={contentId} className={collapsed ? "hidden" : undefined}>{children}</CardContent>
    </Card>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={cn("grid gap-2 text-sm font-black text-[var(--color-ink-muted)]", className)}><span>{label}</span>{children}</label>;
}

function SummaryMetric({ icon: Icon, label, value, tone = "default" }: { icon: LucideIcon; label: string; value: string | number; tone?: "default" | "warning" }) {
  return <div className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--color-surface-raised)] p-3"><div className="flex items-center gap-2 text-sm font-bold text-[var(--color-ink-muted)]"><Icon className={cn("h-4 w-4", tone === "warning" ? "text-[var(--color-action)]" : "text-[var(--color-brand-strong)]")} /> {label}</div><div className="font-black">{value}</div></div>;
}

function formatSessionDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Date à choisir";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-CA", { weekday: "short", day: "numeric", month: "short" }).format(new Date(year, month - 1, day));
}

function canPublishSession({ visibleAthletes, groups, time, drylandBlocks, poolBlocks, poolAssignmentValues }: {
  visibleAthletes: BuilderAthlete[];
  groups: BuilderGroup[];
  time: string;
  drylandBlocks: BuilderDrylandBlock[];
  poolBlocks: BuilderPoolBlock[];
  poolAssignmentValues: string[][];
}) {
  return visibleAthletes.length > 0 && groups.length > 0 && Boolean(time) &&
    (drylandBlocks.length > 0 || poolBlocks.length > 0) &&
    drylandBlocks.every((block) => block.title.trim().length > 0 && Number.isInteger(block.duration) && block.duration > 0 && block.exerciseIds.length > 0 && block.athleteIds.length > 0) &&
    poolBlocks.every(poolBlockIsValid) && poolAssignmentValues.every((ids) => ids.length > 0);
}

function getPublicationIssues({ drylandBlocks, poolBlocks }: { drylandBlocks: BuilderDrylandBlock[]; poolBlocks: BuilderPoolBlock[] }) {
  const issues: string[] = [];
  if (drylandBlocks.length === 0 && poolBlocks.length === 0) issues.push("Ajoute au moins un bloc d’entraînement.");
  if (drylandBlocks.some((block) => block.exerciseIds.length === 0)) issues.push("Ajoute un exercice à chaque bloc dryland.");
  if (drylandBlocks.some((block) => block.title.trim().length === 0 || !Number.isInteger(block.duration) || block.duration < 1)) issues.push("Vérifie le nom et la durée des blocs dryland.");
  if (poolBlocks.some((block) => !poolBlockIsValid(block))) issues.push("Complète les listes de plongeons des blocs piscine.");
  return issues;
}

function DarkMetric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-2xl bg-white/8 p-4"><div className="text-xs font-bold uppercase text-white/45">{label}</div><div className="mt-1 text-2xl font-black">{value}</div></div>;
}

function WarningText({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 flex items-start gap-2 rounded-2xl border border-[var(--color-action)]/30 bg-[var(--color-action)]/10 p-3 text-sm font-semibold text-[var(--color-action-strong)]"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {children}</div>;
}

function orderExercises(exercises: BuilderExercise[], orderedIds: string[]) {
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  return orderedIds.map((id) => byId.get(id)).filter((exercise): exercise is BuilderExercise => Boolean(exercise));
}

function poolBlocksFromTemplate(blocks: SessionTemplatePayload["blocks"]): BuilderPoolBlock[] {
  return blocks.map((block, index) => ({
    id: `template-pool-${index}`,
    title: block.title,
    duration: block.duration,
    competitionEvaluation: block.competitionEvaluation,
    athleteIds: block.athleteIds,
    sections: block.poolTraining?.sections.map((section) => ({
      height: section.height,
      label: section.label,
      dives: section.dives
    })) ?? []
  }));
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1) {
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return items;
  const next = [...items];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
}

function heightLabel(height: BuilderPoolSection["height"]) {
  if (height === "ONE_METER") return "1 metre";
  if (height === "THREE_METER") return "3 metres";
  if (height === "PLATFORM") return "Plateforme";
  return "Section";
}

function poolSectionsToRows(sections: BuilderPoolSection[]): PoolListRow[] {
  return sections.map((section, index) => ({
    id: `section-${index}`,
    context: section.label ?? heightLabel(section.height),
    diveCodes: section.dives.map((dive) => dive.diveCode),
    repetitions: section.dives.map((dive) => dive.repetitions)
  }));
}

function poolRowsToSections(rows: PoolListRow[], existing: BuilderPoolSection[]): BuilderPoolSection[] {
  return rows.map((row, sectionIndex) => {
    const previous = existing[sectionIndex];
    const repetitions = row.repetitions.length === 1 ? row.diveCodes.map(() => row.repetitions[0]) : row.repetitions;
    return {
      height: inferPoolHeight(row.context),
      label: row.context || null,
      dives: row.diveCodes.map((diveCode, order) => {
        const previousDive = previous?.dives.find((dive) => dive.diveCode === diveCode);
        return {
          diveCode,
          diveName: previousDive?.diveName ?? diveCode,
          position: previousDive?.position ?? "Libre",
          repetitions: repetitions[order] ?? 0,
          notes: previousDive?.notes ?? null,
          order
        };
      })
    };
  });
}

function inferPoolHeight(context: string): BuilderPoolSection["height"] {
  const normalized = context.trim().toLowerCase();
  if (countPoolContexts(context) > 1) return "CUSTOM";
  if (normalized.startsWith("1m")) return "ONE_METER";
  if (normalized.startsWith("3m")) return "THREE_METER";
  if (normalized.includes("plateforme")) return "PLATFORM";
  return "CUSTOM";
}

function sectionVolume(section: BuilderPoolSection) {
  return Math.max(1, countPoolContexts(section.label ?? heightLabel(section.height))) * section.dives.reduce((sum, dive) => sum + dive.repetitions, 0);
}

function poolBlockIsValid(block: BuilderPoolBlock) {
  const rows = poolSectionsToRows(block.sections);
  return block.title.trim().length > 0 && block.duration > 0 && rows.length > 0 && rows.every((row) => validatePoolListRow(row).errors.length === 0);
}

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids));
}

function optionalNumber(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}
