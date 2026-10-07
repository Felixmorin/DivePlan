"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import type { LucideIcon } from "lucide-react";
import { Activity, AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookmarkPlus, CalendarDays, CalendarPlus, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, Clock3, Copy, Dumbbell, FileText, GripVertical, Leaf, MoreHorizontal, Plus, Search, Send, Trash2, UserRound, Users, Waves } from "lucide-react";
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
  title: z.string().trim().optional(),
  date: z.string().min(10, "Date requise"),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure requise"),
  duration: z.number().int().min(15, "La durée minimale est de 15 minutes.").max(600, "La durée maximale est de 10 heures."),
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

type BuilderPlanningEvent = { id: string; title: string; startsAt: Date; duration: number | null; groupId: string | null; location: string | null };

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
  athletePoolAverageById: Record<string, number>;
  planningEvents: BuilderPlanningEvent[];
  poolBlocks: BuilderPoolBlock[];
  initialTemplate?: {
    id: string;
    name: string;
    category: string;
    payload: SessionTemplatePayload;
  } | null;
  templates: Array<{ id: string; name: string; category: string; payload: SessionTemplatePayload }>;
  recentSessions: Array<{ id: string; title: string; date: Date; groupId: string; payload: SessionTemplatePayload }>;
  initialPlanningEventId?: string;
  initialExerciseId?: string;
  onCreate: (input: CreateSessionInput) => Promise<void>;
  onCreateExercise: (input: QuickExerciseInput) => Promise<BuilderExercise>;
};

const steps = ["Démarrer", "Contenu", "Dryland", "Piscine", "Publier"];

export function SessionBuilder({ athletes, drylandLibrary, groups, athletePoolAverageById, planningEvents, poolBlocks, initialTemplate, templates, recentSessions, initialPlanningEventId, initialExerciseId, onCreate, onCreateExercise }: SessionBuilderProps) {
  const [step, setStep] = useState(0);
  const [assignmentOpenBlockId, setAssignmentOpenBlockId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [publishError, setPublishError] = useState<string | null>(null);
  const [startChoice, setStartChoice] = useState<"template" | "recent" | "blank">(initialTemplate ? "template" : "blank");
  const [selectedTemplateId, setSelectedTemplateId] = useState(initialTemplate?.id ?? "");
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
  const [drylandProgramMode, setDrylandProgramMode] = useState<"team" | "individual">("team");
  const [drylandTargetAthleteIds, setDrylandTargetAthleteIds] = useState(initialAthleteIds);
  const [selectedDrylandBlockId, setSelectedDrylandBlockId] = useState(drylandBlocks[0]?.id ?? "");
  const [poolAssignments, setPoolAssignments] = useState(() =>
    Object.fromEntries(activePoolBlocks.map((block) => [block.id, (block.athleteIds.length > 0 ? block.athleteIds : initialAthleteIds).filter((id) => initialAthleteIds.includes(id))]))
  );
  const [poolRowsByAthleteBlock, setPoolRowsByAthleteBlock] = useState<Record<string, PoolListRow[]>>(() => Object.fromEntries(
    activePoolBlocks.flatMap((block) => (block.athleteIds.length > 0 ? block.athleteIds : initialAthleteIds).filter((id) => initialAthleteIds.includes(id)).map((athleteId) => [poolAthleteBlockKey(athleteId, block.id), poolSectionsToRows(block.sections)]))
  ));
  const templateWarmup = templateBlocks.find((block) => block.type === "WARMUP");
  const templateCooldown = templateBlocks.find((block) => block.type === "COOLDOWN");
  const [warmup, setWarmup] = useState({
    enabled: Boolean(templateWarmup),
    title: templateWarmup?.title ?? "Echauffement dynamique",
    duration: templateWarmup?.duration ?? 12,
    description: templateWarmup?.description ?? ""
  });
  const [cooldown, setCooldown] = useState({
    enabled: Boolean(templateCooldown),
    title: templateCooldown?.title ?? "Retour au calme",
    duration: templateCooldown?.duration ?? 8,
    description: templateCooldown?.description ?? ""
  });
  const [contentOrder, setContentOrder] = useState<string[]>(() => {
    let dryIndex = 0;
    let poolIndex = 0;
    return templateBlocks.map((block) => {
      if (block.type === "WARMUP") return "warmup";
      if (block.type === "COOLDOWN") return "cooldown";
      if (block.type === "DRYLAND") return `template-dryland-${dryIndex++}`;
      return `template-pool-${poolIndex++}`;
    });
  });
  const [evaluationPlacement, setEvaluationPlacement] = useState("none");
  const [flashBlock, setFlashBlock] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: initialTemplate?.payload.title ?? "",
      date: selectedInitialEvent ? toMontrealDateInputValue(selectedInitialEvent.startsAt) : toMontrealDateInputValue(),
      time: selectedInitialEvent ? toMontrealDateTimeInputValue(selectedInitialEvent.startsAt).slice(11, 16) : "",
      duration: Math.min(600, Math.max(15, selectedInitialEvent?.duration ?? initialTemplate?.payload.duration ?? 90)),
      groupId: initialGroupId,
      notes: initialTemplate?.payload.notes ?? ""
      ,planningEventId: initialPlanningEventId ?? ""
    }
  });
  const watched = useWatch({ control: form.control });
  const athleteIds = useMemo(() => athletes.filter((athlete) => athlete.groupId === (watched.groupId ?? initialGroupId)).map((athlete) => athlete.id), [athletes, initialGroupId, watched.groupId]);
  useEffect(() => {
    if (drylandBlocks.some((block) => block.id === selectedDrylandBlockId)) return;
    setSelectedDrylandBlockId(drylandBlocks[0]?.id ?? "");
  }, [drylandBlocks, selectedDrylandBlockId]);
  const drylandGroupId = watched.groupId ?? initialGroupId;
  const previousDrylandGroupId = useRef(drylandGroupId);
  useEffect(() => {
    if (previousDrylandGroupId.current === drylandGroupId) return;
    previousDrylandGroupId.current = drylandGroupId;
    setDrylandTargetAthleteIds(athleteIds);
    setDrylandBlocks((current) => current.map((block) => ({ ...block, athleteIds })));
  }, [athleteIds, drylandGroupId]);
  const visibleAthletes = athletes.filter((athlete) => athleteIds.includes(athlete.id));
  const effectiveDrylandBlocks = useMemo(() => {
    const validIds = new Set(athleteIds);
    return drylandBlocks.map((block) => ({ ...block, athleteIds: block.athleteIds.filter((id) => validIds.has(id)) }));
  }, [athleteIds, drylandBlocks]);
  const effectivePoolAssignments = useMemo(() => {
    const validIds = new Set(athleteIds);
    return Object.fromEntries(Object.entries(poolAssignments).map(([blockId, ids]) => [blockId, ids.filter((id) => validIds.has(id))])) as Record<string, string[]>;
  }, [athleteIds, poolAssignments]);
  const individualPoolBlocks = activePoolBlocks.flatMap((block) => (effectivePoolAssignments[block.id] ?? []).map((athleteId) => ({
    ...block,
    sourceBlockId: block.id,
    id: `${block.id}-${athleteId}`,
    athleteIds: [athleteId],
    sections: poolRowsToSections(poolRowsByAthleteBlock[poolAthleteBlockKey(athleteId, block.id)] ?? poolSectionsToRows(block.sections), block.sections)
  })));
  useEffect(() => {
    setPoolRowsByAthleteBlock((current) => {
      const next = { ...current };
      for (const block of activePoolBlocks) {
        for (const athleteId of effectivePoolAssignments[block.id] ?? []) {
          const key = poolAthleteBlockKey(athleteId, block.id);
          if (!next[key]) next[key] = poolSectionsToRows(block.sections);
        }
      }
      return next;
    });
  }, [activePoolBlocks, effectivePoolAssignments]);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (raw) {
        const draft = JSON.parse(raw) as { values?: Partial<FormValues>; drylandBlocks?: BuilderDrylandBlock[]; drylandProgramMode?: "team" | "individual"; drylandTargetAthleteIds?: string[]; selectedDrylandBlockId?: string; poolBlocks?: BuilderPoolBlock[]; poolAssignments?: Record<string, string[]>; poolRowsByAthleteBlock?: Record<string, PoolListRow[]>; warmup?: OptionalBlock; cooldown?: OptionalBlock; contentOrder?: string[]; evaluationPlacement?: string };
        queueMicrotask(() => {
          if (draft.values) form.reset({ ...form.getValues(), ...draft.values });
          if (draft.drylandBlocks) setDrylandBlocks(draft.drylandBlocks);
          if (draft.drylandProgramMode) setDrylandProgramMode(draft.drylandProgramMode);
          if (draft.drylandTargetAthleteIds) setDrylandTargetAthleteIds(draft.drylandTargetAthleteIds);
          if (draft.selectedDrylandBlockId) setSelectedDrylandBlockId(draft.selectedDrylandBlockId);
          if (draft.poolBlocks) setActivePoolBlocks(draft.poolBlocks);
          if (draft.poolAssignments) setPoolAssignments(draft.poolAssignments);
          if (draft.poolRowsByAthleteBlock) setPoolRowsByAthleteBlock(draft.poolRowsByAthleteBlock);
          if (draft.warmup) setWarmup(draft.warmup);
          if (draft.cooldown) setCooldown(draft.cooldown);
          if (draft.contentOrder) setContentOrder(draft.contentOrder);
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
    window.localStorage.setItem(draftKey, JSON.stringify({ values: watched, drylandBlocks, drylandProgramMode, drylandTargetAthleteIds, selectedDrylandBlockId, poolBlocks: activePoolBlocks, poolAssignments, poolRowsByAthleteBlock, warmup, cooldown, contentOrder, evaluationPlacement }));
  }, [activePoolBlocks, contentOrder, cooldown, draftKey, drylandBlocks, drylandProgramMode, drylandTargetAthleteIds, evaluationPlacement, form, poolAssignments, poolRowsByAthleteBlock, selectedDrylandBlockId, warmup, watched]);
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
      form.setValue("duration", Math.min(600, Math.max(15, selectedEvent.duration ?? 90)), { shouldValidate: true });
    }
  }, [form, planningEvents, watched.planningEventId]);
  const selectedDrylandExercises = useMemo(() => effectiveDrylandBlocks.reduce((sum, block) => sum + block.exerciseIds.length, 0), [effectiveDrylandBlocks]);
  const poolAssignmentValues = activePoolBlocks.map((block) => effectivePoolAssignments[block.id] ?? []);
  const allAssignedIds = uniqueIds([...effectiveDrylandBlocks.flatMap((block) => block.athleteIds), ...poolAssignmentValues.flat()]);
  const unassignedBlocks = [
    ...effectiveDrylandBlocks.map((block) => block.athleteIds.length === 0 ? block.title : null),
    ...activePoolBlocks.map((block) => ((effectivePoolAssignments[block.id] ?? []).length === 0 ? block.title : null))
  ].filter(Boolean);
  const totalDuration = watched.duration ?? 90;
  const poolVolume = individualPoolBlocks.reduce((sum, block) => sum + block.sections.reduce((sectionSum, section) => sectionSum + sectionVolume(section), 0), 0);
  const dryVolume = effectiveDrylandBlocks.reduce((sum, block) => sum + block.exerciseIds.reduce((blockSum, exerciseId) => {
    const exercise = library.find((item) => item.id === exerciseId);
    const override = block.exerciseOverrides[exerciseId];
    const repetitions = override?.reps ?? exercise?.reps ?? 1;
    const sets = override?.sets ?? exercise?.sets ?? 1;
    return blockSum + repetitions * sets * block.athleteIds.length;
  }, 0), 0);
  const totalVolume = poolVolume + dryVolume;
  const canPublish = canPublishSession({ visibleAthletes, groups, time: watched.time ?? "", drylandBlocks, poolBlocks: individualPoolBlocks, poolAssignmentValues, hasOptionalBlock: warmup.enabled || cooldown.enabled });
  const publicationIssues = getPublicationIssues({ drylandBlocks, poolBlocks: individualPoolBlocks, hasOptionalBlock: warmup.enabled || cooldown.enabled });
  const reviewBlocks = [
    ...(warmup.enabled ? [{ id: "warmup", title: warmup.title, type: "warmup" as const, assigned: athleteIds, content: "Préparation du groupe", ready: true }] : []),
    ...effectiveDrylandBlocks.map((block) => ({ id: block.id, title: block.title, type: "dryland" as const, assigned: block.athleteIds, content: `${block.athleteIds.length === athleteIds.length ? "Équipe entière" : `${block.athleteIds.length} athlètes`} · ${block.exerciseIds.length} exercices`, ready: block.title.trim().length > 0 && block.exerciseIds.length > 0 && block.athleteIds.length > 0 })),
    ...activePoolBlocks.map((block) => {
      const assigned = effectivePoolAssignments[block.id] ?? [];
      const readyCount = assigned.filter((athleteId) => {
        const rows = poolRowsByAthleteBlock[poolAthleteBlockKey(athleteId, block.id)] ?? poolSectionsToRows(block.sections);
        return rows.length > 0 && rows.every((row) => validatePoolListRow(row).errors.length === 0);
      }).length;
      return { id: block.id, title: block.title, type: "pool" as const, assigned, content: `${assigned.length} listes individuelles · ${readyCount}/${assigned.length} prêtes`, ready: assigned.length > 0 && readyCount === assigned.length };
    }),
    ...(cooldown.enabled ? [{ id: "cooldown", title: cooldown.title, type: "cooldown" as const, assigned: athleteIds, content: "Récupération du groupe", ready: true }] : [])
  ];
  const evaluationChoices = useMemo(() => [
    { value: "none", label: "Aucune évaluation" },
    { value: "start", label: "Au début de l’entraînement" },
    ...drylandBlocks.map((block) => ({ value: `block:${block.id}`, label: `Dans le bloc « ${block.title} »` })),
    ...activePoolBlocks.map((block) => ({ value: `block:${block.id}`, label: `Dans le bloc « ${block.title} »` }))
  ], [activePoolBlocks, drylandBlocks]);
  const effectiveEvaluationPlacement = evaluationChoices.some((choice) => choice.value === evaluationPlacement) ? evaluationPlacement : "none";
  const contentRows = [
    ...(warmup.enabled ? [{ id: "warmup", title: warmup.title, type: "warmup" as const, subtitle: "Préparation du groupe" }] : []),
    ...effectiveDrylandBlocks.map((block) => ({ id: block.id, title: block.title || "Dryland", type: "dryland" as const, subtitle: `${block.exerciseIds.length} exercice${block.exerciseIds.length === 1 ? "" : "s"} · ${block.athleteIds.length === athleteIds.length ? "Équipe entière" : `${block.athleteIds.length} athlète${block.athleteIds.length === 1 ? "" : "s"}`}` })),
    ...activePoolBlocks.map((block) => {
      const assignedCount = effectivePoolAssignments[block.id]?.length ?? 0;
      return { id: block.id, title: block.title || "Piscine", type: "pool" as const, subtitle: `${block.sections.reduce((sum, section) => sum + section.dives.length, 0)} lignes · ${assignedCount} athlète${assignedCount === 1 ? "" : "s"}` };
    }),
    ...(cooldown.enabled ? [{ id: "cooldown", title: cooldown.title, type: "cooldown" as const, subtitle: "Récupération du groupe" }] : [])
  ];
  const orderedContentRows = [...contentOrder.map((id) => contentRows.find((row) => row.id === id)).filter((row): row is typeof contentRows[number] => Boolean(row)), ...contentRows.filter((row) => !contentOrder.includes(row.id))];

  function loadPayload(payload: SessionTemplatePayload, title: string) {
    const validExerciseIds = new Set(library.map((exercise) => exercise.id));
    const blocks = payload.blocks;
    const nextDryland = blocks.filter((block) => block.type === "DRYLAND").map((block, index) => ({
      id: `loaded-dryland-${Date.now()}-${index}`,
      title: block.title,
      duration: block.duration,
      exerciseIds: block.drylandExercises.map((exercise) => exercise.exerciseId).filter((id) => validExerciseIds.has(id)),
      athleteIds,
      exerciseOverrides: Object.fromEntries(block.drylandExercises.map((exercise) => [exercise.exerciseId, { sets: exercise.sets, reps: exercise.reps, duration: exercise.duration, notes: exercise.notes }]))
    }));
    const nextPool = blocks.filter((block) => block.type === "POOL").map((block, index) => ({
      id: `loaded-pool-${Date.now()}-${index}`,
      title: block.title,
      duration: block.duration,
      athleteIds,
      competitionEvaluation: block.competitionEvaluation,
      sections: block.poolTraining?.sections.map((section) => ({ height: section.height, label: section.label, dives: section.dives })) ?? []
    }));
    setDrylandBlocks(nextDryland);
    setActivePoolBlocks(nextPool);
    setPoolAssignments(Object.fromEntries(nextPool.map((block) => [block.id, athleteIds])));
    setPoolRowsByAthleteBlock(Object.fromEntries(nextPool.flatMap((block) => athleteIds.map((athleteId) => [poolAthleteBlockKey(athleteId, block.id), poolSectionsToRows(block.sections)]))));
    let dryIndex = 0;
    let poolIndex = 0;
    setContentOrder(blocks.map((block, index) => {
      if (block.type === "WARMUP") return "warmup";
      if (block.type === "COOLDOWN") return "cooldown";
      if (block.type === "DRYLAND") return nextDryland[dryIndex++]?.id ?? `loaded-dryland-${Date.now()}-${index}`;
      return nextPool[poolIndex++]?.id ?? `loaded-pool-${Date.now()}-${index}`;
    }));
    const warm = blocks.find((block) => block.type === "WARMUP");
    const cool = blocks.find((block) => block.type === "COOLDOWN");
    setWarmup({ enabled: Boolean(warm), title: warm?.title ?? "Échauffement dynamique", duration: warm?.duration ?? 12, description: warm?.description ?? "" });
    setCooldown({ enabled: Boolean(cool), title: cool?.title ?? "Retour au calme", duration: cool?.duration ?? 8, description: cool?.description ?? "" });
    form.setValue("title", title, { shouldValidate: true });
    form.setValue("notes", payload.notes ?? "");
    form.setValue("duration", Math.min(600, Math.max(15, payload.duration)), { shouldValidate: true });
  }

  function chooseTemplate(templateId: string) {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    setSelectedTemplateId(templateId);
    setStartChoice("template");
    loadPayload(template.payload, template.payload.title || template.name);
  }

  function chooseRecent(sessionId: string) {
    const session = recentSessions.find((item) => item.id === sessionId);
    if (!session) return;
    setStartChoice("recent");
    loadPayload(session.payload, session.title);
  }

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
    setContentOrder((current) => [...current, block.id]);
    pulse(block.id);
  }

  function reusePoolBlock(block: BuilderPoolBlock) {
    addPoolBlock({ ...block, id: `pool-reuse-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, athleteIds });
  }

  function removePoolBlock(blockId: string) {
    setActivePoolBlocks((current) => current.filter((block) => block.id !== blockId));
    setContentOrder((current) => current.filter((id) => id !== blockId));
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
    setPoolRowsByAthleteBlock((current) => ({
      ...current,
      ...Object.fromEntries((effectivePoolAssignments[blockId] ?? []).map((athleteId) => [poolAthleteBlockKey(athleteId, blockId), rows]))
    }));
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
    setDrylandBlocks((current) => [...current, { id, title: `Dryland ${current.length + 1}`, duration: 20, exerciseIds: [], athleteIds: drylandTargetAthleteIds, exerciseOverrides: {} }]);
    setSelectedDrylandBlockId(id);
    setContentOrder((current) => [...current, id]);
    pulse(id);
  }

  function moveContentBlock(blockId: string, direction: -1 | 1) {
    const order = orderedContentRows.map((row) => row.id);
    const index = order.indexOf(blockId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    setContentOrder(order);
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
    const invalidPoolBlock = individualPoolBlocks.find((block) => block.sections.length === 0 || poolSectionsToRows(block.sections).some((row) => validatePoolListRow(row).errors.length > 0));

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
            title: values.title?.trim() || `${groups.find((group) => group.id === values.groupId)?.name ?? "Séance"} · ${formatSessionDate(values.date)}`,
            status,
            focus: "",
            duration: totalDuration,
            warmup: { ...warmup, competitionEvaluation: false },
            cooldown: { ...cooldown, competitionEvaluation: false },
            evaluationPlacement: effectiveEvaluationPlacement,
            drylandBlocks: effectiveDrylandBlocks.map(({ id, title, duration, exerciseIds, athleteIds: assignedAthleteIds, exerciseOverrides }) => ({ title, duration, exerciseIds, athleteIds: assignedAthleteIds, exerciseOverrides, competitionEvaluation: effectiveEvaluationPlacement === `block:${id}` })),
      poolBlocks: individualPoolBlocks.map((block) => ({
              title: block.title,
              duration: block.duration,
              athleteIds: block.athleteIds,
              sections: block.sections,
              competitionEvaluation: effectiveEvaluationPlacement === `block:${block.sourceBlockId}`
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

      <div className={cn("grid gap-6", step === 2 ? "grid-cols-1" : step === 4 ? "lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]" : "lg:grid-cols-[minmax(0,1fr)_340px]")}>
        <div className="space-y-5">
          {step === 0 && <>
            <section className="space-y-4">
              <div><p className="text-sm font-bold text-[var(--color-ink-muted)]">Étape 1 sur 5</p><h2 className="mt-1 text-2xl font-black">Démarrer la séance</h2></div>
              <div className="grid gap-3 lg:grid-cols-3">
                <button type="button" onClick={() => setStartChoice("template")} className={cn("rounded-2xl border bg-white p-4 text-left transition", startChoice === "template" ? "border-[var(--color-brand)] ring-1 ring-[var(--color-brand)]" : "border-[var(--color-border)] hover:border-[var(--color-brand)]")}><span className="text-lg font-black">À partir d’un modèle</span><span className="mt-1 block text-sm text-[var(--color-ink-muted)]">Choisis un modèle pour préremplir la séance.</span></button>
                <button type="button" onClick={() => setStartChoice("recent")} className={cn("rounded-2xl border bg-white p-4 text-left transition", startChoice === "recent" ? "border-[var(--color-brand)] ring-1 ring-[var(--color-brand)]" : "border-[var(--color-border)] hover:border-[var(--color-brand)]")}><span className="text-lg font-black">Reprendre une séance</span><span className="mt-1 block text-sm text-[var(--color-ink-muted)]">Repars d’une séance récente et adapte son contenu.</span></button>
                <button type="button" onClick={() => { setStartChoice("blank"); setSelectedTemplateId(""); setDrylandBlocks([]); setActivePoolBlocks([]); setPoolAssignments({}); setWarmup((value) => ({ ...value, enabled: false })); setCooldown((value) => ({ ...value, enabled: false })); form.setValue("title", ""); form.setValue("notes", ""); }} className={cn("rounded-2xl border bg-white p-4 text-left transition", startChoice === "blank" ? "border-[var(--color-brand)] ring-1 ring-[var(--color-brand)]" : "border-[var(--color-border)] hover:border-[var(--color-brand)]")}><span className="text-lg font-black">＋ Partir de zéro</span><span className="mt-1 block text-sm text-[var(--color-ink-muted)]">Crée une séance vide et construis-la étape par étape.</span></button>
              </div>
              {startChoice === "template" && <div className="grid gap-2 md:grid-cols-2">{templates.length ? templates.map((template) => <button key={template.id} type="button" onClick={() => chooseTemplate(template.id)} className={cn("rounded-xl border p-3 text-left", selectedTemplateId === template.id ? "border-[var(--color-brand)] bg-[var(--color-brand)]/5" : "border-[var(--color-border)] bg-white")}><span className="font-bold">{template.name}</span><span className="block text-xs text-[var(--color-ink-muted)]">{template.category} · {template.payload.blocks.length} blocs</span></button>) : <p className="rounded-xl bg-white p-4 text-sm text-[var(--color-ink-muted)]">Aucun modèle disponible. Tu peux en créer depuis la bibliothèque.</p>}</div>}
              {startChoice === "recent" && <div className="grid gap-2 md:grid-cols-2">{recentSessions.length ? recentSessions.map((session) => <button key={session.id} type="button" onClick={() => chooseRecent(session.id)} className="rounded-xl border border-[var(--color-border)] bg-white p-3 text-left hover:border-[var(--color-brand)]"><span className="font-bold">{session.title}</span><span className="block text-xs text-[var(--color-ink-muted)]">{formatSessionDate(toMontrealDateInputValue(session.date))} · {session.payload.blocks.length} blocs</span></button>) : <p className="rounded-xl bg-white p-4 text-sm text-[var(--color-ink-muted)]">Aucune séance récente à reprendre.</p>}</div>}
            </section>
            <DetailsStep form={form} selectedGroupId={watched.groupId ?? ""} selectedDate={watched.date ?? ""} selectedPlanningEventId={watched.planningEventId ?? ""} selectedTime={watched.time ?? ""} groups={groups} athletes={visibleAthletes} planningEvents={planningEvents} evaluationPlacement={effectiveEvaluationPlacement} evaluationChoices={evaluationChoices} onEvaluationPlacementChange={setEvaluationPlacement} />
          </>}
          {step === 1 && (
            <div className="space-y-4">
              <div><p className="text-sm font-bold text-[var(--color-ink-muted)]">Étape 2 sur 5</p><h2 className="mt-1 text-2xl font-black">Organiser les blocs</h2></div>
              <div className="grid gap-3 rounded-2xl border border-[var(--color-border)] bg-white p-4 sm:grid-cols-3">
                <div className="flex items-center gap-3 sm:border-r sm:border-[var(--color-border)]"><Users className="h-5 w-5 text-[var(--color-brand-strong)]"/><div><div className="text-xs text-[var(--color-ink-muted)]">Groupe</div><div className="font-bold">{groups.find((group) => group.id === watched.groupId)?.name ?? "Groupe"} · {visibleAthletes.length} athlètes</div></div></div>
                <div className="flex items-center gap-3 sm:border-r sm:border-[var(--color-border)] sm:pl-4"><Clock3 className="h-5 w-5 text-[var(--color-brand-strong)]"/><div><div className="text-xs text-[var(--color-ink-muted)]">Durée totale</div><div className="text-xl font-black">{Math.floor(totalDuration / 60)} h {String(totalDuration % 60).padStart(2, "0")}</div></div></div>
                <div className="flex items-center gap-3 sm:pl-4"><CalendarDays className="h-5 w-5 text-[var(--color-brand-strong)]"/><div><div className="text-xs text-[var(--color-ink-muted)]">Contenu</div><div className="font-bold">{contentRows.length} blocs</div></div></div>
              </div>
              <div className="space-y-2">
                {orderedContentRows.map((row, index) => {
                  const Icon = row.type === "warmup" ? Activity : row.type === "dryland" ? Dumbbell : row.type === "pool" ? Waves : Leaf;
                  const isAssignable = row.type === "dryland" || row.type === "pool";
                  const assignedAthleteIds = row.type === "dryland"
                    ? effectiveDrylandBlocks.find((block) => block.id === row.id)?.athleteIds ?? []
                    : row.type === "pool" ? effectivePoolAssignments[row.id] ?? [] : [];
                  const assignmentIsOpen = assignmentOpenBlockId === row.id;
                  return <div key={row.id} className="space-y-2">
                    <div className={cn("grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-2 rounded-2xl border bg-white p-2 sm:gap-3 sm:p-3", flashBlock === row.id && "builder-pulse", row.type === "warmup" ? "border-[var(--block-warmup-fg)]/35" : row.type === "dryland" ? "border-[var(--block-dryland-fg)]/25" : row.type === "pool" ? "border-[var(--block-pool-fg)]/25" : "border-[var(--block-cooldown-fg)]/25")}>
                    <div className="flex gap-1"><button type="button" aria-label={`Monter ${row.title}`} disabled={index === 0} onClick={() => moveContentBlock(row.id, -1)} className="rounded-lg p-2 text-[var(--color-ink-muted)] disabled:opacity-30"><ArrowUp className="h-4 w-4"/></button><button type="button" aria-label={`Descendre ${row.title}`} disabled={index === orderedContentRows.length - 1} onClick={() => moveContentBlock(row.id, 1)} className="rounded-lg p-2 text-[var(--color-ink-muted)] disabled:opacity-30"><ArrowDown className="h-4 w-4"/></button></div>
                    <span className={cn("flex h-11 w-11 items-center justify-center rounded-full", row.type === "warmup" ? "bg-[var(--block-warmup-bg)] text-[var(--block-warmup-fg)]" : row.type === "dryland" ? "bg-[var(--block-dryland-bg)] text-[var(--block-dryland-fg)]" : row.type === "pool" ? "bg-[var(--block-pool-bg)] text-[var(--block-pool-fg)]" : "bg-[var(--block-cooldown-bg)] text-[var(--block-cooldown-fg)]")}><Icon className="h-5 w-5"/></span>
                    <div className="min-w-0"><div className="truncate font-black">{row.title}</div><div className="text-sm text-[var(--color-ink-muted)]">{row.subtitle}</div></div>
                    {isAssignable && <button type="button" aria-label={`${assignmentIsOpen ? "Fermer" : "Associer des athlètes à"} ${row.title}`} aria-expanded={assignmentIsOpen} onClick={() => setAssignmentOpenBlockId((current) => current === row.id ? null : row.id)} className={cn("flex h-9 w-9 items-center justify-center rounded-full border transition focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]", assignmentIsOpen ? "border-[var(--color-brand)] bg-[var(--color-brand)]/10 text-[var(--color-brand-strong)]" : "border-[var(--color-border)] text-[var(--color-brand-strong)] hover:border-[var(--color-brand)] hover:bg-[var(--color-brand)]/5")}><Plus className="h-4 w-4" /></button>}
                    </div>
                    {isAssignable && assignmentIsOpen && <div className="pl-2 sm:pl-16"><AssignmentSelector selected={assignedAthleteIds} onChange={(ids) => row.type === "dryland" ? updateDrylandBlock(row.id, { athleteIds: ids }) : assignPoolBlock(row.id)(ids)} athletes={visibleAthletes} /></div>}
                  </div>;
                })}
                {orderedContentRows.length === 0 && <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-5 text-center text-sm text-[var(--color-ink-muted)]">Aucun bloc pour le moment. Ajoute un bloc pour commencer.</div>}
              </div>
              <details className="group relative rounded-2xl border border-dashed border-[var(--color-brand)]/50 bg-[var(--color-brand)]/5">
                <summary className="flex cursor-pointer list-none items-center justify-center gap-2 p-3 font-black text-[var(--color-brand-strong)]"><Plus className="h-5 w-5"/>Ajouter un bloc<ChevronDown className="h-4 w-4 transition group-open:rotate-180"/></summary>
                <div className="absolute bottom-full left-1/2 z-20 mb-2 grid w-64 -translate-x-1/2 gap-1 rounded-2xl border border-[var(--color-border)] bg-white p-2 shadow-[var(--shadow-soft)]">
                  <button type="button" onClick={() => { setWarmup((value) => ({ ...value, enabled: true })); setContentOrder((current) => ["warmup", ...current.filter((id) => id !== "warmup")]); }} className="flex items-center gap-2 rounded-xl p-2 text-left text-sm font-bold hover:bg-[var(--color-surface-raised)]"><Activity className="h-4 w-4 text-[var(--block-warmup-fg)]"/>Échauffement</button>
                  <button type="button" onClick={addDrylandBlock} className="flex items-center gap-2 rounded-xl p-2 text-left text-sm font-bold hover:bg-[var(--color-surface-raised)]"><Dumbbell className="h-4 w-4 text-[var(--block-dryland-fg)]"/>Dryland</button>
                  <button type="button" onClick={() => addPoolBlock({ id: `pool-${Date.now()}`, title: "Piscine", duration: 45, athleteIds, sections: [] })} className="flex items-center gap-2 rounded-xl p-2 text-left text-sm font-bold hover:bg-[var(--color-surface-raised)]"><Waves className="h-4 w-4 text-[var(--block-pool-fg)]"/>Piscine</button>
                  <button type="button" onClick={() => { setCooldown((value) => ({ ...value, enabled: true })); setContentOrder((current) => [...current.filter((id) => id !== "cooldown"), "cooldown"]); }} className="flex items-center gap-2 rounded-xl p-2 text-left text-sm font-bold hover:bg-[var(--color-surface-raised)]"><Leaf className="h-4 w-4 text-[var(--block-cooldown-fg)]"/>Retour au calme</button>
                </div>
              </details>
            </div>
          )}
          {step === 2 && <div className="space-y-4">
            <div><p className="text-sm font-bold text-[var(--color-ink-muted)]">Étape 3 sur 5</p><h2 className="mt-1 text-2xl font-black">Dryland</h2></div>
            <DrylandStep exercises={library} blocks={effectiveDrylandBlocks} athletes={visibleAthletes} groupName={groups.find((group) => group.id === watched.groupId)?.name ?? "Groupe"} targetAthleteIds={drylandTargetAthleteIds} selectedBlockId={selectedDrylandBlockId} programMode={drylandProgramMode} flashBlock={flashBlock} onSelectBlock={setSelectedDrylandBlockId} onProgramModeChange={(mode) => { setDrylandProgramMode(mode); if (mode === "team") setDrylandBlocks((current) => current.map((block) => ({ ...block, athleteIds: drylandTargetAthleteIds }))); }} onTargetAthletesChange={(ids) => { setDrylandTargetAthleteIds(ids); setDrylandBlocks((current) => current.map((block) => ({ ...block, athleteIds: ids }))); }} onToggleExercise={toggleExercise} onMoveExercise={moveExercise} onUpdateBlock={updateDrylandBlock} onAddBlock={addDrylandBlock} onRemoveBlock={(blockId) => { setDrylandBlocks((current) => current.filter((block) => block.id !== blockId)); setContentOrder((current) => current.filter((id) => id !== blockId)); }} onSaveAndContinue={() => { const index = effectiveDrylandBlocks.findIndex((block) => block.id === selectedDrylandBlockId); if (index >= 0 && index < effectiveDrylandBlocks.length - 1) setSelectedDrylandBlockId(effectiveDrylandBlocks[index + 1].id); else void advanceTo(3); }} onBack={() => { const index = effectiveDrylandBlocks.findIndex((block) => block.id === selectedDrylandBlockId); if (index > 0) setSelectedDrylandBlockId(effectiveDrylandBlocks[index - 1].id); }} onCreateExercise={addExercise}/>
            <details className="rounded-2xl border border-[var(--color-border)] bg-white p-4"><summary className="cursor-pointer font-bold">Échauffement et retour au calme</summary><div className="mt-4 space-y-3">{warmup.enabled && <OptionalBlockEditor label="Échauffement" block={warmup} onChange={(update) => setWarmup((current) => ({ ...current, ...update }))}/>}<OptionalBlockEditor label="Retour au calme" block={cooldown} onChange={(update) => setCooldown((current) => ({ ...current, ...update }))}/></div></details>
          </div>}
          {step === 3 && <div className="space-y-5">
            <PoolStep poolBlocks={activePoolBlocks} recentBlocks={poolBlocks} flashBlock={flashBlock} onAddPoolBlock={addPoolBlock} onReusePoolBlock={reusePoolBlock} onRemovePoolBlock={removePoolBlock} onMoveBlock={movePoolBlock} onUpdatePoolBlock={updatePoolBlock} onUpdatePoolRows={updatePoolRows}/>
            <PoolAthletesStep athletes={visibleAthletes} groupName={groups.find((group) => group.id === watched.groupId)?.name ?? "Groupe"} averagePoolVolumeByAthlete={athletePoolAverageById} blocks={activePoolBlocks} assignments={effectivePoolAssignments} rowsByAthleteBlock={poolRowsByAthleteBlock} recentBlocks={poolBlocks} onRowsChange={(athleteId, blockId, rows) => setPoolRowsByAthleteBlock((current) => ({ ...current, [poolAthleteBlockKey(athleteId, blockId)]: rows }))} onCopyRows={(sourceId, targetId) => setPoolRowsByAthleteBlock((current) => ({ ...current, ...Object.fromEntries(activePoolBlocks.map((block) => [poolAthleteBlockKey(targetId, block.id), current[poolAthleteBlockKey(sourceId, block.id)] ?? poolSectionsToRows(block.sections)])) }))} onLoadRows={(athleteId, blockId, rows) => setPoolRowsByAthleteBlock((current) => ({ ...current, [poolAthleteBlockKey(athleteId, blockId)]: rows }))} />
          </div>}
          {step === 4 && <PublishStep title={watched.title?.trim() || `${groups.find((group) => group.id === watched.groupId)?.name ?? "Séance"} · ${formatSessionDate(watched.date ?? "")}`} groupName={groups.find((group) => group.id === watched.groupId)?.name ?? "Groupe à choisir"} date={watched.date ?? ""} time={watched.time ?? ""} duration={totalDuration} athleteCount={visibleAthletes.length} athletes={visibleAthletes} blocks={reviewBlocks} issues={publicationIssues} poolReady={activePoolBlocks.length === 0 || individualPoolBlocks.every(poolBlockIsValid)} assignmentsReady={unassignedBlocks.length === 0} canPublish={canPublish} onEditBlock={(block) => setStep(block.type === "pool" ? 3 : block.type === "dryland" ? 1 : 1)} />}
        </div>

        {step !== 2 && <SummaryPanel
              title={watched.title ?? "Nouvelle séance"}
          date={watched.date ?? ""}
          blockCount={activePoolBlocks.length + drylandBlocks.length + Number(warmup.enabled) + Number(cooldown.enabled)}
          athleteCount={allAssignedIds.length}
          unassignedCount={unassignedBlocks.length}
          totalVolume={totalVolume}
          step={step}
          isPending={isPending}
          canPublish={canPublish}
          poolReady={activePoolBlocks.length === 0 || individualPoolBlocks.every(poolBlockIsValid)}
          assignmentsReady={unassignedBlocks.length === 0}
          publicationIssues={publicationIssues}
          poolVolume={poolVolume}
          drylandExercises={selectedDrylandExercises}
          duration={totalDuration}
          onBack={() => setStep(Math.max(0, step - 1))}
          onContinue={() => void advanceTo(Math.min(4, step + 1))}
          onSaveDraft={() => publishSession("DRAFT")}
          onPublish={() => publishSession("READY")}
        />}
      </div>

      {step !== 2 && <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-border)] bg-white/95 p-3 shadow-[0_-16px_34px_rgba(7,20,35,0.12)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <Button type="button" variant="outline" disabled={step === 0 || isPending} onClick={() => setStep(step - 1)}>Retour</Button>
          {step === 4 && <Button type="button" variant="outline" size="sm" disabled={isPending || !canPublish} onClick={() => publishSession("DRAFT")} aria-label="Enregistrer comme brouillon privé"><FileText className="h-4 w-4" /> Brouillon</Button>}
          <Button type="button" variant={step === 4 ? "action" : "default"} disabled={isPending || (step === 4 && !canPublish)} onClick={() => (step === 4 ? publishSession("READY") : void advanceTo(Math.min(4, step + 1)))}>
            {step === 4 ? (isPending ? "Publication…" : "Publier") : "Continuer"}
          </Button>
        </div>
      </div>}
    </div>
  );
}

function Stepper({ current, onStepChange }: { current: number; onStepChange: (step: number) => void }) {
  return (
    <div className="mb-6 overflow-x-auto">
        <div className="grid min-w-[560px] grid-cols-5 gap-2">
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

function OptionalBlockEditor({ label, block, onChange }: { label: string; block: OptionalBlock; onChange: (update: Partial<OptionalBlock>) => void }) {
  return <section className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
    <label className="flex cursor-pointer items-center gap-3 font-black"><input type="checkbox" checked={block.enabled} onChange={(event) => onChange({ enabled: event.target.checked })} className="h-5 w-5 accent-[var(--color-brand)]" />Inclure {label.toLocaleLowerCase("fr")}</label>
    {block.enabled && <div className="mt-3 grid gap-3"><Field label="Nom du bloc"><Input value={block.title} onChange={(event) => onChange({ title: event.target.value })} /></Field><Field label="Consignes"><Textarea value={block.description} onChange={(event) => onChange({ description: event.target.value })} placeholder="Consignes facultatives" /></Field></div>}
  </section>;
}

function DetailsStep({ form, selectedGroupId, selectedDate, selectedPlanningEventId, selectedTime, groups, athletes, planningEvents, evaluationPlacement, evaluationChoices, onEvaluationPlacementChange }: { form: ReturnType<typeof useForm<FormValues>>; selectedGroupId: string; selectedDate: string; selectedPlanningEventId: string; selectedTime: string; groups: BuilderGroup[]; athletes: BuilderAthlete[]; planningEvents: BuilderPlanningEvent[]; evaluationPlacement: string; evaluationChoices: Array<{ value: string; label: string }>; onEvaluationPlacementChange: (value: string) => void }) {
  return (
    <Card>
      <CardHeader><CardTitle>Quand et pour qui ?</CardTitle><p className="text-sm text-[var(--color-ink-muted)]">Les informations du groupe et du créneau seront reprises dans le planning.</p></CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <Field label="Nom (optionnel)"><Input placeholder="Ex. Technique d’entrée — Groupe provincial" {...form.register("title")} />{form.formState.errors.title && <span role="alert" className="text-xs font-bold text-[var(--color-danger)]">{form.formState.errors.title.message}</span>}</Field>
        <Field label="Date"><Input type="date" {...form.register("date")} />{form.formState.errors.date && <span role="alert" className="text-xs font-bold text-[var(--color-danger)]">Choisis la date de la séance.</span>}</Field>
        <Field label="Heure">{selectedPlanningEventId ? <><Input type="time" value={selectedTime} disabled /><input type="hidden" {...form.register("time")} /></> : <Input type="time" required {...form.register("time")} />}<span className="mt-1 block text-xs font-semibold normal-case text-[var(--color-ink-muted)]">{selectedPlanningEventId ? "Reprise de l’horaire sélectionné." : "Heure de début."}</span>{form.formState.errors.time && <span role="alert" className="text-xs font-bold text-[var(--color-danger)]">Choisis l’heure de début.</span>}</Field>
        <Field label="Groupe">
          <select className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm font-semibold focus:outline-none focus:shadow-[var(--focus-ring)]" {...form.register("groupId")}>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
        </Field>
        <Field label="Durée totale de l’entraînement (minutes)">
          <Input type="number" min={15} max={600} step={5} {...form.register("duration", { valueAsNumber: true })} />
          <span className="mt-1 block text-xs font-semibold normal-case text-[var(--color-ink-muted)]">{selectedPlanningEventId ? "Préremplie selon la durée de l’événement du planning; ajuste-la au besoin." : "Confirme la durée totale prévue pour cet entraînement."}</span>
          {form.formState.errors.duration && <span role="alert" className="text-xs font-bold text-[var(--color-danger)]">{form.formState.errors.duration.message}</span>}
        </Field>
        <Field label="Horaire du groupe" className="md:col-span-2">
          <select className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm font-semibold focus:outline-none focus:shadow-[var(--focus-ring)]" {...form.register("planningEventId")}>
            <option value="">Aucun horaire lié</option>
            {planningEvents.filter((event) => (!event.groupId || event.groupId === selectedGroupId) && toMontrealDateInputValue(event.startsAt) === selectedDate).map((event) => <option key={event.id} value={event.id}>{event.title} · {new Intl.DateTimeFormat("fr-CA", { dateStyle: "short", timeStyle: "short", timeZone: "America/Toronto" }).format(event.startsAt)}{event.duration ? ` · ${event.duration} min` : ""}{event.location ? ` · ${event.location}` : ""}</option>)}
          </select>
          <span className="mt-1 block text-xs font-semibold normal-case text-[var(--color-ink-muted)]">L’horaire reste affiché dans le planning; la séance sera ouverte depuis ce même élément.</span>
        </Field>
        <div className="md:col-span-2"><div className="mb-2 text-sm font-black">Athlètes ({athletes.length})</div><AthleteAvatarGroup ids={athletes.map((athlete) => athlete.id)} athletes={athletes} limit={8} /></div>
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
  groupName: string;
  targetAthleteIds: string[];
  selectedBlockId: string;
  programMode: "team" | "individual";
  flashBlock: string | null;
  onSelectBlock: (blockId: string) => void;
  onProgramModeChange: (mode: "team" | "individual") => void;
  onTargetAthletesChange: (ids: string[]) => void;
  onToggleExercise: (blockId: string, exerciseId: string, selected: boolean, occurrenceIndex?: number) => void;
  onMoveExercise: (blockId: string, occurrenceIndex: number, direction: -1 | 1) => void;
  onUpdateBlock: (blockId: string, update: Partial<Omit<BuilderDrylandBlock, "id">>) => void;
  onAddBlock: () => void;
  onRemoveBlock: (blockId: string) => void;
  onSaveAndContinue: () => void;
  onBack: () => void;
  onCreateExercise: (input: QuickExerciseInput) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [showLibrary, setShowLibrary] = useState(false);
  const selectedBlock = props.blocks.find((block) => block.id === props.selectedBlockId);
  const selectedIndex = props.blocks.findIndex((block) => block.id === props.selectedBlockId);
  const selectedExercises = selectedBlock ? orderExercises(props.exercises, selectedBlock.exerciseIds) : [];
  const completedCount = props.blocks.filter((block) => block.exerciseIds.length > 0 && block.athleteIds.length > 0).length;
  const progress = props.blocks.length > 0 ? Math.round(completedCount / props.blocks.length * 100) : 0;
  const nextBlock = selectedIndex >= 0 ? props.blocks[selectedIndex + 1] : undefined;
  const availableExercises = props.exercises.filter((exercise) => `${exercise.name} ${exercise.category} ${exercise.equipment ?? ""}`.toLocaleLowerCase("fr").includes(search.trim().toLocaleLowerCase("fr")));

  function updateExercise(exercise: BuilderExercise, field: "sets" | "reps" | "duration", value: number | null) {
    if (!selectedBlock) return;
    const previous = selectedBlock.exerciseOverrides[exercise.id];
    props.onUpdateBlock(selectedBlock.id, {
      exerciseOverrides: {
        ...selectedBlock.exerciseOverrides,
        [exercise.id]: {
          sets: previous?.sets ?? exercise.sets,
          reps: previous?.reps ?? exercise.reps,
          duration: previous?.duration ?? exercise.duration,
          notes: previous?.notes ?? null,
          [field]: value
        }
      }
    });
  }

  return <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-card)]">
    <div className="grid min-h-[520px] lg:grid-cols-[245px_minmax(0,1fr)]">
      <aside className="border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between"><h3 className="font-black">Blocs dryland ({props.blocks.length})</h3><Button type="button" size="sm" variant="outline" aria-label="Ajouter un bloc dryland" onClick={props.onAddBlock}><Plus className="h-4 w-4"/></Button></div>
        <p className="mt-1 text-xs font-semibold text-[var(--color-ink-muted)]">{completedCount} / {props.blocks.length} complétés</p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--color-border)]"><div className="h-full rounded-full bg-[var(--color-brand)] transition-all" style={{ width: `${progress}%` }}/></div>
        <div className="mt-4 space-y-2">{props.blocks.map((block, index) => {
          const isSelected = block.id === props.selectedBlockId;
          const isComplete = block.exerciseIds.length > 0 && block.athleteIds.length > 0;
          return <button key={block.id} type="button" aria-current={isSelected ? "step" : undefined} onClick={() => props.onSelectBlock(block.id)} className={cn("flex w-full items-center gap-3 rounded-xl border p-3 text-left transition", isSelected ? "border-amber-400 bg-amber-50" : "border-[var(--color-border)] bg-white hover:border-[var(--color-brand)]")}>
            <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-black", isComplete ? "bg-[var(--color-success)] text-white" : isSelected ? "bg-amber-500 text-white" : "bg-[var(--color-surface-raised)] text-[var(--color-ink-muted)]")}>{isComplete ? <CheckCircle2 className="h-4 w-4"/> : index + 1}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{block.title || `Dryland ${index + 1}`}</span><span className="block text-xs text-[var(--color-ink-muted)]">{block.duration} min</span></span><ChevronRight className="h-4 w-4 text-[var(--color-ink-muted)]"/>
          </button>;
        })}</div>
        {props.blocks.length === 0 && <p className="mt-4 text-sm text-[var(--color-ink-muted)]">Ajoute un bloc depuis l’étape Blocs.</p>}
      </aside>

      <div className="min-w-0 p-4 sm:p-5">
        {selectedBlock ? <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-52 flex-1">
              <Input aria-label="Nom du bloc dryland" value={selectedBlock.title} onChange={(event) => props.onUpdateBlock(selectedBlock.id, { title: event.target.value })} className="h-auto border-0 bg-transparent px-0 text-2xl font-black shadow-none focus-visible:shadow-none"/>
              <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{selectedBlock.duration} min · {props.groupName} · {props.programMode === "team" ? props.targetAthleteIds.length : selectedBlock.athleteIds.length} athlètes</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
              <div className="flex items-center gap-2 text-xs font-black"><Users className="h-4 w-4"/>{props.programMode === "team" ? "Même circuit pour tout le groupe" : "Athlètes du programme"}</div>
              <div className="mt-2"><AthleteAvatarGroup ids={props.programMode === "team" ? props.targetAthleteIds : selectedBlock.athleteIds} athletes={props.athletes} limit={6}/></div>
              {props.programMode === "team" && <details className="group mt-2"><summary className="cursor-pointer list-none text-xs font-bold underline">Exclure un athlète <ChevronDown className="ml-1 inline h-3 w-3 transition group-open:rotate-180"/></summary><div className="mt-2 space-y-1">{props.athletes.map((athlete) => { const included = props.targetAthleteIds.includes(athlete.id); return <button key={athlete.id} type="button" aria-pressed={included} onClick={() => props.onTargetAthletesChange(included ? props.targetAthleteIds.filter((id) => id !== athlete.id) : [...props.targetAthleteIds, athlete.id])} className="flex w-full justify-between rounded-md px-2 py-1 text-left text-xs hover:bg-amber-100">{athlete.firstName} {athlete.lastName}<span>{included ? "Inclus" : "Exclu"}</span></button>; })}</div></details>}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 rounded-xl bg-[var(--color-surface-raised)] p-1">
            <button type="button" aria-pressed={props.programMode === "team"} onClick={() => props.onProgramModeChange("team")} className={cn("rounded-lg px-3 py-2 text-sm font-black", props.programMode === "team" ? "bg-[var(--color-brand)] text-white" : "text-[var(--color-ink-muted)]")}><Users className="mr-2 inline h-4 w-4"/>Équipe</button>
            <button type="button" aria-pressed={props.programMode === "individual"} onClick={() => props.onProgramModeChange("individual")} className={cn("rounded-lg px-3 py-2 text-sm font-black", props.programMode === "individual" ? "bg-[var(--color-brand)] text-white" : "text-[var(--color-ink-muted)]")}><UserRound className="mr-2 inline h-4 w-4"/>Par athlète</button>
          </div>
          {props.programMode === "individual" && <div className="mt-3"><AssignmentSelector selected={selectedBlock.athleteIds} onChange={(ids) => props.onUpdateBlock(selectedBlock.id, { athleteIds: ids })} athletes={props.athletes}/></div>}

          <section className="mt-4 rounded-xl border border-[var(--color-border)] p-3 sm:p-4">
            <h3 className="mb-3 flex items-center gap-2 font-black"><Dumbbell className="h-4 w-4 text-[var(--block-dryland-fg)]"/>{props.programMode === "team" ? "Circuit de l’équipe" : "Circuit individuel"}</h3>
            <div className="space-y-2">{selectedExercises.map((exercise, index) => {
              const override = selectedBlock.exerciseOverrides[exercise.id];
              const sets = override?.sets ?? exercise.sets ?? 1;
              const reps = override?.reps ?? exercise.reps;
              const seconds = override?.duration ?? exercise.duration;
              const quantity = exercise.roundTrip ? "Aller-retour" : seconds ? `${sets} × ${seconds} s` : `${sets} × ${reps ?? "—"}`;
              return <div key={`${exercise.id}-${index}`} className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-white px-3 py-2">
                <GripVertical className="h-4 w-4 shrink-0 text-[var(--color-ink-soft)]"/>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{exercise.name}</p><p className="text-xs text-[var(--color-ink-muted)]">{exercise.category}</p></div>
                <span className="whitespace-nowrap text-sm font-semibold text-[var(--color-ink-muted)]">{quantity}</span>
                <details className="relative"><summary className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-raised)]"><MoreHorizontal className="h-4 w-4"/></summary><div className="absolute right-0 z-20 mt-1 w-52 rounded-xl border border-[var(--color-border)] bg-white p-3 shadow-[var(--shadow-soft)]"><div className="mb-2 text-xs font-black">Modifier l’exercice</div><div className="grid grid-cols-2 gap-2"><Input aria-label={`Séries ${exercise.name}`} type="number" min="1" value={sets} onChange={(event) => updateExercise(exercise, "sets", Number(event.target.value) || 1)} placeholder="Séries"/>{!exercise.roundTrip && <Input aria-label={`Répétitions ${exercise.name}`} type="number" min="1" value={reps ?? ""} onChange={(event) => updateExercise(exercise, "reps", Number(event.target.value) || null)} placeholder="Répétitions"/>}{!exercise.roundTrip && <Input aria-label={`Durée en secondes ${exercise.name}`} type="number" min="1" value={seconds ?? ""} onChange={(event) => updateExercise(exercise, "duration", Number(event.target.value) || null)} placeholder="Secondes"/>}</div><div className="mt-2 flex justify-between gap-2"><button type="button" onClick={() => props.onMoveExercise(selectedBlock.id, index, -1)} disabled={index === 0} className="text-xs font-bold text-[var(--color-brand-strong)] disabled:opacity-40">Monter</button><button type="button" onClick={() => props.onMoveExercise(selectedBlock.id, index, 1)} disabled={index === selectedExercises.length - 1} className="text-xs font-bold text-[var(--color-brand-strong)] disabled:opacity-40">Descendre</button><button type="button" onClick={() => props.onToggleExercise(selectedBlock.id, exercise.id, true, index)} className="text-xs font-bold text-[var(--color-danger)]">Retirer</button></div></div></details>
              </div>;
            })}</div>
            {selectedExercises.length === 0 && <p className="rounded-lg bg-[var(--color-surface-raised)] p-3 text-sm text-[var(--color-ink-muted)]">Ajoute des exercices pour composer ce circuit.</p>}
            <Button type="button" variant="outline" className="mt-3 w-full border-dashed text-[var(--color-brand-strong)]" onClick={() => setShowLibrary((value) => !value)}><Plus className="h-4 w-4"/>Ajouter un exercice</Button>
            {showLibrary && <div className="mt-3 space-y-3">
              <label className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-soft)]"/><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un exercice…" aria-label="Rechercher un exercice" className="pl-9"/></label>
              <div className="max-h-64 space-y-2 overflow-y-auto">{availableExercises.map((exercise) => <button key={exercise.id} type="button" onClick={() => { props.onToggleExercise(selectedBlock.id, exercise.id, false); setShowLibrary(false); setSearch(""); }} className="flex w-full items-center justify-between rounded-lg border border-[var(--color-border)] p-3 text-left text-sm hover:border-[var(--color-brand)]"><span><strong>{exercise.name}</strong><span className="ml-2 text-xs text-[var(--color-ink-muted)]">{exercise.category}</span></span><Plus className="h-4 w-4 text-[var(--color-brand-strong)]"/></button>)}{availableExercises.length === 0 && <p className="p-3 text-sm text-[var(--color-ink-muted)]">Aucun exercice trouvé.</p>}</div>
              <details><summary className="cursor-pointer text-sm font-bold text-[var(--color-brand-strong)]">Créer un exercice rapide</summary><div className="mt-3"><QuickExerciseForm onCreateExercise={props.onCreateExercise}/></div></details>
            </div>}
          </section>
          <div className="mt-3 flex justify-end"><Button type="button" variant="outline" size="sm" onClick={() => props.onRemoveBlock(selectedBlock.id)}><Trash2 className="h-4 w-4"/>Supprimer ce bloc</Button></div>
        </> : <div className="flex min-h-80 flex-col items-center justify-center gap-3 text-center"><Dumbbell className="h-10 w-10 text-[var(--block-dryland-fg)]"/><p className="font-bold">Aucun bloc dryland</p><Button type="button" onClick={props.onAddBlock}><Plus className="h-4 w-4"/>Ajouter un bloc</Button></div>}
      </div>
    </div>

    <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] bg-white/95 p-3 backdrop-blur">
      <Button type="button" variant="outline" disabled={selectedIndex <= 0} onClick={props.onBack}><ArrowLeft className="h-4 w-4"/>Bloc précédent{selectedIndex > 0 && props.blocks[selectedIndex - 1] ? <span className="hidden sm:inline"> · {props.blocks[selectedIndex - 1].title}</span> : null}</Button>
      <div className="text-center text-xs font-semibold text-[var(--color-ink-muted)]">Étape 3 sur 5 · Dryland</div>
      <Button type="button" variant="action" onClick={props.onSaveAndContinue}>Enregistrer ce bloc et continuer<ArrowRight className="h-4 w-4"/><span className="hidden text-[10px] font-medium sm:inline">{nextBlock ? `Bloc suivant : ${nextBlock.title}` : "Continuer vers Piscine"}</span></Button>
    </div>
  </div>;
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
        defaultDuration: null,
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
        {!roundTrip && <Input name="reps" type="number" min="1" placeholder="Répétitions" />}
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
    if (title.length < 2) {
      setError("Complète le nom du bloc.");
      return;
    }

    onAdd({
      id: `custom-pool-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title,
      duration: 30,
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
      <Input name="title" placeholder="Nom du bloc" required />
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
      {recentBlocks.length > 0 && <details className="rounded-2xl border border-[var(--color-border)] bg-white p-4"><summary className="cursor-pointer font-black">Reprendre une liste récente <span className="ml-1 text-sm font-semibold text-[var(--color-ink-muted)]">({recentBlocks.length})</span></summary><div className="mt-3 grid gap-2 md:grid-cols-2">{recentBlocks.map((block) => <div key={block.id} className="flex items-center justify-between gap-3 rounded-xl bg-[var(--color-surface-raised)] p-3"><div className="min-w-0"><div className="truncate font-bold">{block.title}</div><div className="text-xs text-[var(--color-ink-muted)]">{block.sections.reduce((sum, section) => sum + section.dives.length, 0)} plongeons</div></div><Button type="button" size="sm" variant="outline" onClick={() => onReusePoolBlock(block)}>Ajouter</Button></div>)}</div></details>}
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
        <p className="text-xs font-black uppercase tracking-wide text-[var(--color-brand)]">Étape 3 · Dryland</p>
        <h2 className="mt-2 text-2xl font-black">Organiser le dryland</h2>
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

function PoolAthletesStep({ athletes, groupName, averagePoolVolumeByAthlete, blocks, assignments, rowsByAthleteBlock, recentBlocks, onRowsChange, onCopyRows, onLoadRows }: { athletes: BuilderAthlete[]; groupName: string; averagePoolVolumeByAthlete: Record<string, number>; blocks: BuilderPoolBlock[]; assignments: Record<string, string[]>; rowsByAthleteBlock: Record<string, PoolListRow[]>; recentBlocks: BuilderPoolBlock[]; onRowsChange: (athleteId: string, blockId: string, rows: PoolListRow[]) => void; onCopyRows: (sourceId: string, targetId: string) => void; onLoadRows: (athleteId: string, blockId: string, rows: PoolListRow[]) => void }) {
  const [selectedAthleteId, setSelectedAthleteId] = useState(athletes[0]?.id ?? "");
  const [copyTargetId, setCopyTargetId] = useState("");
  const selectedAthlete = athletes.find((athlete) => athlete.id === selectedAthleteId) ?? athletes[0];
  const athleteBlocks = selectedAthlete ? blocks.filter((block) => (assignments[block.id] ?? []).includes(selectedAthlete.id)) : [];
  const readyAthleteCount = athletes.filter((athlete) => {
    const assigned = blocks.filter((block) => (assignments[block.id] ?? []).includes(athlete.id));
    return assigned.length > 0 && assigned.every((block) => {
      const rows = rowsByAthleteBlock[poolAthleteBlockKey(athlete.id, block.id)] ?? poolSectionsToRows(block.sections);
      return rows.length > 0 && rows.every((row) => validatePoolListRow(row).errors.length === 0);
    });
  }).length;
  const totalVolume = athletes.reduce((total, athlete) => total + blocks.filter((block) => (assignments[block.id] ?? []).includes(athlete.id)).reduce((sum, block) => {
    const rows = rowsByAthleteBlock[poolAthleteBlockKey(athlete.id, block.id)] ?? poolSectionsToRows(block.sections);
    return sum + rows.reduce((rowSum, row) => rowSum + validatePoolListRow(row).total, 0);
  }, 0), 0);
  const selectedVolume = athleteBlocks.reduce((sum, block) => sum + (rowsByAthleteBlock[poolAthleteBlockKey(selectedAthlete?.id ?? "", block.id)] ?? poolSectionsToRows(block.sections)).reduce((rowSum, row) => rowSum + validatePoolListRow(row).total, 0), 0);
  const selectedIndex = athletes.findIndex((athlete) => athlete.id === selectedAthlete?.id);

  return <div className="space-y-4">
    <div><p className="text-sm font-bold text-[var(--color-ink-muted)]">Étape 4 sur 5</p><h2 className="mt-1 text-2xl font-black">Piscine · Listes des athlètes</h2><p className="mt-1 text-sm text-[var(--color-ink-muted)]">Prépare et vérifie la liste de plongeons de chaque athlète.</p></div>
    <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Choisir un athlète">{athletes.map((athlete) => {
      const assigned = blocks.filter((block) => (assignments[block.id] ?? []).includes(athlete.id));
      const isReady = assigned.length > 0 && assigned.every((block) => {
        const rows = rowsByAthleteBlock[poolAthleteBlockKey(athlete.id, block.id)] ?? poolSectionsToRows(block.sections);
        return rows.length > 0 && rows.every((row) => validatePoolListRow(row).errors.length === 0);
      });
      return <button key={athlete.id} type="button" role="tab" aria-selected={selectedAthlete?.id === athlete.id} onClick={() => setSelectedAthleteId(athlete.id)} className={cn("shrink-0 rounded-xl border px-3 py-2 text-sm font-bold", selectedAthlete?.id === athlete.id ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-[var(--color-navy)]" : "border-[var(--color-border)] bg-white")}><span className={cn("mr-2 inline-block h-2.5 w-2.5 rounded-full", isReady ? "bg-[var(--color-success)]" : assigned.length ? "bg-[var(--color-brand)]" : "bg-slate-300")}/>{athlete.firstName}</button>;
    })}</div>
    {selectedAthlete && <Card><CardContent className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-brand)]/15 font-black text-[var(--color-brand-strong)]">{selectedAthlete.firstName.slice(0, 1)}{selectedAthlete.lastName.slice(0, 1)}</div><div><h3 className="text-lg font-black">{selectedAthlete.firstName} {selectedAthlete.lastName}</h3><p className="text-sm text-[var(--color-ink-muted)]">{groupName}</p></div></div><div className="text-right text-sm text-[var(--color-ink-muted)]"><div>Volume individuel <strong className="text-[var(--color-ink)]">{selectedVolume} plongeons</strong></div><div className="mt-1">Moyenne par entraînement <strong className="text-[var(--color-ink)]">{averagePoolVolumeByAthlete[selectedAthlete.id] === undefined ? "—" : `${averagePoolVolumeByAthlete[selectedAthlete.id]} plongeons`}</strong></div></div></div>
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] pb-4">
        <Button type="button" size="sm" variant="outline" disabled={athleteBlocks.length === 0} onClick={() => athleteBlocks.forEach((block) => onLoadRows(selectedAthlete.id, block.id, poolSectionsToRows(block.sections)))}><FileText className="h-4 w-4"/>Charger la liste complète</Button>
        <details className="relative"><summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm font-bold"><Waves className="h-4 w-4"/>Charger une base<ChevronDown className="h-4 w-4"/></summary><div className="absolute left-0 z-20 mt-2 max-h-64 w-72 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-white p-2 shadow-[var(--shadow-soft)]">{recentBlocks.length ? recentBlocks.map((base) => <button key={base.id} type="button" onClick={() => { const target = athleteBlocks[0]; if (target) onLoadRows(selectedAthlete.id, target.id, poolSectionsToRows(base.sections)); }} className="block w-full rounded-lg p-2 text-left text-sm hover:bg-[var(--color-surface-raised)]"><span className="font-bold">{base.title}</span><span className="block text-xs text-[var(--color-ink-muted)]">{base.sections.reduce((sum, section) => sum + section.dives.length, 0)} plongeons</span></button>) : <p className="p-2 text-sm text-[var(--color-ink-muted)]">Aucune base disponible</p>}</div></details>
        <div className="ml-auto flex items-center gap-2"><select aria-label="Athlète destinataire" value={copyTargetId} onChange={(event) => setCopyTargetId(event.target.value)} className="h-10 max-w-36 rounded-xl border border-[var(--color-border)] bg-white px-2 text-sm"><option value="">Copier vers…</option>{athletes.filter((athlete) => athlete.id !== selectedAthlete.id).map((athlete) => <option key={athlete.id} value={athlete.id}>{athlete.firstName}</option>)}</select><Button type="button" size="sm" variant="outline" disabled={!copyTargetId} onClick={() => { onCopyRows(selectedAthlete.id, copyTargetId); setCopyTargetId(""); }}><Copy className="h-4 w-4"/>Copier</Button></div>
      </div>
      {athleteBlocks.length ? athleteBlocks.map((block) => <section key={block.id}><h4 className="mb-2 font-black">{block.title}</h4><PoolListTable rows={rowsByAthleteBlock[poolAthleteBlockKey(selectedAthlete.id, block.id)] ?? poolSectionsToRows(block.sections)} onChange={(rows) => onRowsChange(selectedAthlete.id, block.id, rows)}/></section>) : <p className="rounded-xl bg-[var(--color-surface-raised)] p-4 text-sm text-[var(--color-ink-muted)]">Aucun bloc piscine n’est assigné à cet athlète. Retourne à l’étape Dryland pour ajuster ses blocs.</p>}
    </CardContent></Card>}
    <div className="grid gap-2 sm:grid-cols-2"><SummaryMetric icon={Users} label="Listes prêtes" value={`${readyAthleteCount}/${athletes.length}`}/><SummaryMetric icon={CalendarDays} label="Volume total" value={`${totalVolume} plongeons`}/></div>
    <div className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-white p-2"><Button type="button" size="sm" variant="outline" disabled={selectedIndex <= 0} onClick={() => setSelectedAthleteId(athletes[selectedIndex - 1]?.id ?? "")}><ArrowLeft className="h-4 w-4"/>Athlète précédent</Button><span className="text-sm font-black">{selectedVolume} plongeons</span><Button type="button" size="sm" variant="outline" disabled={selectedIndex < 0 || selectedIndex >= athletes.length - 1} onClick={() => setSelectedAthleteId(athletes[selectedIndex + 1]?.id ?? "")}>Athlète suivant<ArrowRight className="h-4 w-4"/></Button></div>
  </div>;
}

function PublicationStep({ title, groupName, scheduleName, date, time, totalVolume, unassignedBlocks, selectedExercises, athleteCount, validationIssues, blocks, athletes }: { title: string; groupName: string; scheduleName: string; date: string; time: string; totalVolume: number; unassignedBlocks: number; selectedExercises: number; athleteCount: number; validationIssues: string[]; blocks: Array<{ id: string; title: string; type: "warmup" | "dryland" | "pool" | "cooldown"; assigned: string[]; content: string }>; athletes: BuilderAthlete[] }) {
  return (
    <Card>
      <CardHeader><p className="text-xs font-black uppercase tracking-wide text-[var(--color-brand-strong)]">Étape 4 · Piscine</p><CardTitle>Organiser la piscine</CardTitle><p className="text-sm text-[var(--color-ink-muted)]">Vérifie les listes et le volume avant de publier.</p></CardHeader>
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

function PublishStep(props: { title: string; groupName: string; date: string; time: string; duration: number; athleteCount: number; athletes: BuilderAthlete[]; blocks: Array<{ id: string; title: string; type: "warmup" | "dryland" | "pool" | "cooldown"; assigned: string[]; content: string; ready: boolean }>; issues: string[]; poolReady: boolean; assignmentsReady: boolean; canPublish: boolean; onEditBlock: (block: { type: "warmup" | "dryland" | "pool" | "cooldown" }) => void }) {
  const checks = [
    { label: "Tous les blocs sont prêts", ready: props.issues.length === 0 },
    { label: "Listes piscine complètes", ready: props.poolReady },
    { label: "Athlètes assignés", ready: props.assignmentsReady },
    { label: "Durée cohérente", ready: props.duration >= 15 && props.duration <= 600 }
  ];
  return <div className="space-y-4">
    <div><h2 className="text-2xl font-black">Aperçu de la séance</h2><p className="mt-1 text-sm text-[var(--color-ink-muted)]">Vérifie une dernière fois le plan avant de le partager.</p></div>
    <Card><CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 p-4 sm:p-5">
      <div className="min-w-48 flex-1"><h3 className="text-xl font-black">{props.title}</h3><div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[var(--color-ink-muted)]"><span className="flex items-center gap-2"><Users className="h-4 w-4"/>{props.athleteCount} athlètes</span><span className="flex items-center gap-2"><Clock3 className="h-4 w-4"/>{formatDurationLabel(props.duration)}</span><span className="flex items-center gap-2"><CalendarDays className="h-4 w-4"/>{formatSessionDate(props.date)}{props.time ? ` · ${props.time}` : ""}</span></div><p className="mt-1 text-sm font-bold text-[var(--color-ink-muted)]">{props.groupName}</p></div>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Contenu de la séance</CardTitle></CardHeader><CardContent className="divide-y divide-[var(--color-border)] p-0">
      {props.blocks.map((block) => <div key={block.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5"><BlockTypeBadge type={block.type}/><div className="min-w-32 flex-1"><div className="font-black">{block.title}</div><div className="text-sm text-[var(--color-ink-muted)]">{block.content}</div></div><AthleteAvatarGroup ids={block.assigned} athletes={props.athletes} limit={6}/><span className={cn("flex items-center gap-2 text-sm font-bold", block.ready ? "text-[var(--color-success)]" : "text-[var(--color-action-strong)]")}><CheckCircle2 className="h-5 w-5"/>{block.ready ? "Prêt" : "À corriger"}</span><button type="button" onClick={() => props.onEditBlock(block)} className="font-bold text-[var(--color-brand-strong)] hover:underline">Modifier</button></div>)}
      {props.blocks.length === 0 && <p className="p-4 text-sm text-[var(--color-ink-muted)]">Aucun bloc ajouté.</p>}
    </CardContent></Card>
    <div className={cn("flex items-start gap-3 rounded-2xl border p-4", props.canPublish ? "border-[var(--color-success)]/20 bg-[var(--color-success-soft)] text-[var(--color-success)]" : "border-[var(--color-action)]/25 bg-[var(--color-action)]/10 text-[var(--color-action-strong)]")}><CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0"/><div><div className="font-black">{props.canPublish ? "Tout est prêt à publier" : "Quelques éléments restent à vérifier"}</div><p className="mt-1 text-sm">{props.canPublish ? "Les athlètes verront la séance après sa publication." : "Consulte les vérifications et utilise les liens Modifier pour compléter la séance."}</p></div></div>
    <Card className="xl:hidden"><CardHeader><CardTitle>Vérifications</CardTitle></CardHeader><CardContent className="space-y-2">{checks.map((check) => <div key={check.label} className="flex items-center gap-3 rounded-xl bg-[var(--color-surface-raised)] p-3 text-sm font-semibold"><CheckCircle2 className={cn("h-5 w-5", check.ready ? "text-[var(--color-success)]" : "text-[var(--color-action)]")}/>{check.label}</div>)}</CardContent></Card>
  </div>;
}

function SummaryPanel(props: { title: string; date: string; blockCount: number; athleteCount: number; unassignedCount: number; totalVolume: number; poolVolume: number; drylandExercises: number; poolReady: boolean; assignmentsReady: boolean; publicationIssues: string[]; duration: number; step: number; isPending: boolean; canPublish: boolean; onBack: () => void; onContinue: () => void; onSaveDraft: () => void; onPublish: () => void }) {
  if (props.step === 4) {
    const checks = [
      { label: "Tous les blocs ont des athlètes", ready: props.assignmentsReady },
      { label: "Listes piscine complètes", ready: props.poolReady },
      { label: "Durée cohérente", ready: props.duration >= 15 && props.duration <= 600 },
      { label: "Contenu complet", ready: props.publicationIssues.length === 0 }
    ];
    return <aside className="hidden space-y-4 lg:block">
      <Card><CardHeader><CardTitle>Vérifications</CardTitle></CardHeader><CardContent className="space-y-2">{checks.map((check) => <div key={check.label} className="flex items-center gap-3 rounded-xl bg-[var(--color-surface-raised)] p-3 text-sm font-semibold"><CheckCircle2 className={cn("h-5 w-5 shrink-0", check.ready ? "text-[var(--color-success)]" : "text-[var(--color-action)]")}/>{check.label}</div>)}{props.publicationIssues.map((issue) => <p key={issue} className="text-sm font-semibold text-[var(--color-danger)]">{issue}</p>)}</CardContent></Card>
      <Card><CardHeader><CardTitle>Charge de travail (résumé)</CardTitle></CardHeader><CardContent className="space-y-3"><SummaryMetric icon={Waves} label="Piscine" value={`${props.poolVolume} répétitions`}/><SummaryMetric icon={Dumbbell} label="Dryland" value={`${props.drylandExercises} exercices`}/></CardContent></Card>
      <div className="space-y-2"><Button type="button" variant="outline" className="w-full" disabled={props.isPending} onClick={props.onBack}>Retour</Button><Button type="button" variant="outline" className="w-full" disabled={props.isPending || !props.canPublish} onClick={props.onSaveDraft}><FileText className="h-4 w-4" /> Enregistrer comme brouillon</Button><Button type="button" variant="action" className="w-full" disabled={props.isPending || !props.canPublish} onClick={props.onPublish}>{props.isPending ? "Publication…" : "Publier la séance"}<Send className="h-4 w-4" /></Button></div>
    </aside>;
  }
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-6 space-y-4">
      <Card>
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
        </CardContent>
      </Card>
      <div className="flex gap-2"><Button type="button" variant="outline" className="flex-1" disabled={props.step === 0 || props.isPending} onClick={props.onBack}>Retour</Button><Button type="button" variant="action" className="flex-1" disabled={props.isPending} onClick={props.onContinue}>Continuer <ChevronDown className="h-4 w-4 -rotate-90" /></Button></div>
      </div>
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

function formatDurationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder} min`;
  return remainder ? `${hours} h ${String(remainder).padStart(2, "0")}` : `${hours} h`;
}

function canPublishSession({ visibleAthletes, groups, time, drylandBlocks, poolBlocks, poolAssignmentValues, hasOptionalBlock }: {
  visibleAthletes: BuilderAthlete[];
  groups: BuilderGroup[];
  time: string;
  drylandBlocks: BuilderDrylandBlock[];
  poolBlocks: BuilderPoolBlock[];
  poolAssignmentValues: string[][];
  hasOptionalBlock: boolean;
}) {
  return visibleAthletes.length > 0 && groups.length > 0 && Boolean(time) &&
    (drylandBlocks.length > 0 || poolBlocks.length > 0 || hasOptionalBlock) &&
    drylandBlocks.every((block) => block.title.trim().length > 0 && Number.isInteger(block.duration) && block.duration > 0 && block.exerciseIds.length > 0 && block.athleteIds.length > 0) &&
    poolBlocks.every(poolBlockIsValid) && poolAssignmentValues.every((ids) => ids.length > 0);
}

function getPublicationIssues({ drylandBlocks, poolBlocks, hasOptionalBlock }: { drylandBlocks: BuilderDrylandBlock[]; poolBlocks: BuilderPoolBlock[]; hasOptionalBlock: boolean }) {
  const issues: string[] = [];
  if (drylandBlocks.length === 0 && poolBlocks.length === 0 && !hasOptionalBlock) issues.push("Ajoute au moins un bloc d’entraînement.");
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
      // Keep an explicitly cleared context empty; null means the default label
      // should be shown for a new custom section.
      label: row.context,
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

function poolAthleteBlockKey(athleteId: string, blockId: string) {
  return `${athleteId}:${blockId}`;
}

function optionalNumber(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}
