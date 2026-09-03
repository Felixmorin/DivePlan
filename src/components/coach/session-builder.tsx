"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, Clock3, Eye, FileText, MoreHorizontal, Plus, Printer, Send, Tag, Users, Waves } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import type { CreateSessionInput, QuickExerciseInput } from "@/app/coach/sessions/actions";
import { AssignmentSelector } from "@/components/coach/assignment-selector";
import { AthleteAvatarGroup } from "@/components/coach/athlete-avatar-group";
import { BlockTypeBadge } from "@/components/training/block-type-badge";
import { StatusPill } from "@/components/training/status-pill";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { SessionTemplatePayload } from "@/lib/session-template";
import { toMontrealDateInputValue } from "@/lib/timezone";

const schema = z.object({
  title: z.string().min(3, "Nom requis"),
  date: z.string().min(10, "Date requise"),
  groupId: z.string().min(1, "Groupe requis"),
  duration: z.number().min(15, "Minimum 15 minutes"),
  focus: z.string().min(3, "Focus requis"),
  notes: z.string().optional()
});

type FormValues = z.infer<typeof schema>;

type BuilderAthlete = {
  id: string;
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
  equipment: string | null;
  tags: string[];
};

type BuilderGroup = {
  id: string;
  name: string;
};

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
};

type SessionBuilderProps = {
  athletes: BuilderAthlete[];
  drylandLibrary: BuilderExercise[];
  groups: BuilderGroup[];
  poolBlocks: BuilderPoolBlock[];
  initialTemplate?: {
    id: string;
    name: string;
    category: string;
    payload: SessionTemplatePayload;
  } | null;
  onCreate: (input: CreateSessionInput) => Promise<void>;
  onCreateExercise: (input: QuickExerciseInput) => Promise<BuilderExercise>;
};

const steps = ["Details", "Dryland", "Piscine", "Assignations", "Publication"];

export function SessionBuilder({ athletes, drylandLibrary, groups, poolBlocks, initialTemplate, onCreate, onCreateExercise }: SessionBuilderProps) {
  const [step, setStep] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [library, setLibrary] = useState(drylandLibrary);
  const athleteIds = athletes.map((athlete) => athlete.id);
  const templateBlocks = initialTemplate?.payload.blocks ?? [];
  const templateDryland = templateBlocks.find((block) => block.type === "DRYLAND");
  const templatePoolBlocks = templateBlocks.filter((block) => block.type === "POOL");
  const activePoolBlocks = templatePoolBlocks.length > 0 ? poolBlocksFromTemplate(templatePoolBlocks) : poolBlocks;
  const templateExerciseIds = uniqueIds(templateBlocks.flatMap((block) => block.drylandExercises.map((item) => item.exerciseId)));
  const [dryAssigned, setDryAssigned] = useState((templateDryland?.athleteIds ?? athleteIds.slice(0, 2)).filter((id) => athleteIds.includes(id)));
  const [poolAssignments, setPoolAssignments] = useState(() =>
    Object.fromEntries(activePoolBlocks.map((block, index) => [block.id, (block.athleteIds.length > 0 ? block.athleteIds : defaultPoolAthletes(index, athleteIds)).filter((id) => athleteIds.includes(id))]))
  );
  const [selectedExerciseIds, setSelectedExerciseIds] = useState(
    (templateExerciseIds.length > 0 ? templateExerciseIds : library.slice(0, 5).map((exercise) => exercise.id)).filter((id) =>
      library.some((exercise) => exercise.id === id)
    )
  );
  const [flashBlock, setFlashBlock] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: initialTemplate?.payload.title ?? "Arriere + ouverture",
      date: toMontrealDateInputValue(),
      groupId: groups[0]?.id ?? "",
      duration: initialTemplate?.payload.duration ?? 90,
      focus: initialTemplate?.payload.focus ?? "203C, 201B, entrees propres",
      notes: initialTemplate?.payload.notes ?? "Priorite aux entrees propres."
    }
  });
  const watched = useWatch({ control: form.control });
  const selectedExercises = useMemo(() => orderExercises(library, selectedExerciseIds), [library, selectedExerciseIds]);
  const poolAssignmentValues = activePoolBlocks.map((block) => poolAssignments[block.id] ?? []);
  const allAssignedIds = uniqueIds([...dryAssigned, ...poolAssignmentValues.flat()]);
  const unassignedBlocks = [
    dryAssigned.length === 0 ? "Dryland" : null,
    ...activePoolBlocks.map((block) => ((poolAssignments[block.id] ?? []).length === 0 ? block.title : null))
  ].filter(Boolean);
  const totalDuration = Number(watched.duration ?? 0);
  const poolVolume = activePoolBlocks.reduce((sum, block) => sum + block.sections.reduce((sectionSum, section) => sectionSum + section.dives.reduce((diveSum, dive) => diveSum + dive.repetitions, 0), 0), 0);
  const dryVolume = selectedExercises.length * Math.max(dryAssigned.length, 1) * 6;
  const totalVolume = poolVolume + dryVolume;

  function pulse(blockId: string) {
    setFlashBlock(blockId);
    window.setTimeout(() => setFlashBlock((current) => (current === blockId ? null : current)), 240);
  }

  function assign(blockId: string, setter: (ids: string[]) => void) {
    return (ids: string[]) => {
      setter(ids);
      pulse(blockId);
    };
  }

  function assignPoolBlock(blockId: string) {
    return (ids: string[]) => {
      setPoolAssignments((current) => ({ ...current, [blockId]: ids }));
      pulse(blockId);
    };
  }

  function toggleExercise(exerciseId: string) {
    setSelectedExerciseIds((current) => {
      const next = current.includes(exerciseId) ? current.filter((id) => id !== exerciseId) : [...current, exerciseId];
      pulse("dryland");
      return next;
    });
  }

  function moveExercise(exerciseId: string, direction: -1 | 1) {
    setSelectedExerciseIds((current) => {
      const index = current.indexOf(exerciseId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      pulse("dryland");
      return next;
    });
  }

  async function addExercise(input: QuickExerciseInput) {
    const exercise = await onCreateExercise(input);
    setLibrary((current) => [exercise, ...current.filter((item) => item.id !== exercise.id)]);
    setSelectedExerciseIds((current) => uniqueIds([exercise.id, ...current]));
    pulse("dryland");
  }

  function publishSession() {
    void form.handleSubmit((values) => {
      startTransition(() => {
        void onCreate({
          ...values,
          templateId: initialTemplate?.id,
          drylandExerciseIds: selectedExerciseIds,
          drylandAthleteIds: dryAssigned,
          poolBlocks: activePoolBlocks.map((block) => ({
            title: block.title,
            duration: block.duration,
            athleteIds: poolAssignments[block.id] ?? [],
            sections: block.sections
          }))
        });
      });
    })();
  }

  return (
    <div className="pb-24 lg:pb-0">
      <Stepper current={step} onStepChange={setStep} />
      {initialTemplate && (
        <div className="mb-5 rounded-[var(--radius-panel)] border border-[var(--color-brand)]/35 bg-[var(--color-brand)]/10 p-4">
          <div className="text-sm font-black uppercase text-[var(--color-brand-strong)]">Modele charge</div>
          <div className="mt-1 text-xl font-black">{initialTemplate.name}</div>
          <p className="mt-1 text-sm font-semibold text-[var(--color-ink-muted)]">
            {initialTemplate.category} - {initialTemplate.payload.blocks.length} blocs seront recrees avec leurs exercices, plongeons et assignations.
          </p>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          {step === 0 && <DetailsStep form={form} groups={groups} />}
          {step === 1 && (
            <DrylandStep
              exercises={library}
              selectedExerciseIds={selectedExerciseIds}
              selectedExercises={selectedExercises}
              assigned={dryAssigned}
              athletes={athletes}
              flash={flashBlock === "dryland"}
              onToggleExercise={toggleExercise}
              onMoveExercise={moveExercise}
              onAssign={assign("dryland", setDryAssigned)}
              onCreateExercise={addExercise}
            />
          )}
          {step === 2 && (
            <PoolStep
              athletes={athletes}
              poolBlocks={activePoolBlocks}
              poolAssignments={poolAssignments}
              flashBlock={flashBlock}
              onAssignPoolBlock={assignPoolBlock}
            />
          )}
          {step === 3 && (
            <AssignmentsStep
              athletes={athletes}
              dryAssigned={dryAssigned}
              poolBlocks={activePoolBlocks}
              poolAssignments={poolAssignments}
              flashBlock={flashBlock}
              onAssignDry={assign("dryland", setDryAssigned)}
              onAssignPoolBlock={assignPoolBlock}
            />
          )}
          {step === 4 && (
            <PublicationStep
              title={watched.title ?? ""}
              focus={watched.focus ?? ""}
              date={watched.date ?? ""}
              totalDuration={totalDuration}
              totalVolume={totalVolume}
              unassignedBlocks={unassignedBlocks.length}
              selectedExercises={selectedExercises.length}
              athleteCount={allAssignedIds.length}
            />
          )}
        </div>

        <SummaryPanel
          title={watched.title ?? "Nouvelle seance"}
          date={watched.date ?? ""}
          duration={totalDuration}
          blockCount={initialTemplate ? initialTemplate.payload.blocks.length : activePoolBlocks.length + 3}
          athleteCount={allAssignedIds.length}
          unassignedCount={unassignedBlocks.length}
          totalVolume={totalVolume}
          isPending={isPending}
          canPublish={
            initialTemplate
              ? athletes.length > 0 && groups.length > 0 && initialTemplate.payload.blocks.length > 0
              : athletes.length > 0 && groups.length > 0 && selectedExerciseIds.length > 0 && dryAssigned.length > 0 && activePoolBlocks.length > 0 && poolAssignmentValues.every((ids) => ids.length > 0)
          }
          onPublish={publishSession}
        />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-border)] bg-white/95 p-3 shadow-[0_-16px_34px_rgba(7,20,35,0.12)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <Button type="button" variant="outline" disabled={step === 0} onClick={() => setStep(step - 1)}>Retour</Button>
          <Button type="button" variant={step === 4 ? "action" : "default"} disabled={isPending} onClick={() => (step === 4 ? publishSession() : setStep(Math.min(4, step + 1)))}>
            {step === 4 ? (isPending ? "Publication..." : "Publier") : "Continuer"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Stepper({ current, onStepChange }: { current: number; onStepChange: (step: number) => void }) {
  return (
    <div className="mb-6 overflow-x-auto">
      <div className="grid min-w-[680px] gap-2 md:grid-cols-5">
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

function DetailsStep({ form, groups }: { form: ReturnType<typeof useForm<FormValues>>; groups: BuilderGroup[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>Details de la seance</CardTitle></CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <Field label="Nom"><Input placeholder="Nom" {...form.register("title")} /></Field>
        <Field label="Date"><Input type="date" {...form.register("date")} /></Field>
        <Field label="Groupe">
          <select className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm font-semibold focus:outline-none focus:shadow-[var(--focus-ring)]" {...form.register("groupId")}>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
        </Field>
        <Field label="Duree totale"><Input type="number" placeholder="Duree" {...form.register("duration", { valueAsNumber: true })} /></Field>
        <Field label="Focus principal" className="md:col-span-2"><Input placeholder="Focus principal" {...form.register("focus")} /></Field>
        <Field label="Notes coach" className="md:col-span-2"><Textarea placeholder="Notes coach" {...form.register("notes")} /></Field>
        {Object.values(form.formState.errors).length > 0 && <div className="md:col-span-2 rounded-2xl bg-[var(--color-action)]/10 p-3 text-sm font-semibold text-[var(--color-action-strong)]">Certains champs requis sont incomplets.</div>}
      </CardContent>
    </Card>
  );
}

function DrylandStep(props: {
  exercises: BuilderExercise[];
  selectedExerciseIds: string[];
  selectedExercises: BuilderExercise[];
  assigned: string[];
  athletes: BuilderAthlete[];
  flash: boolean;
  onToggleExercise: (id: string) => void;
  onMoveExercise: (id: string, direction: -1 | 1) => void;
  onAssign: (ids: string[]) => void;
  onCreateExercise: (input: QuickExerciseInput) => Promise<void>;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <BlockCard type="dryland" title="Dryland partage" duration={22} assigned={props.assigned} athletes={props.athletes} state={props.selectedExercises.length > 0 ? "Pret" : "A completer"} flash={props.flash}>
        <QuickExerciseForm onCreateExercise={props.onCreateExercise} />
        <div className="mb-4 rounded-2xl bg-[var(--color-surface-raised)] p-3 text-sm font-semibold text-[var(--color-ink-muted)]">
          Selectionne les exercices qui seront envoyes au backend. L&apos;ordre ci-dessous est conserve a la creation.
        </div>
        <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
          {props.exercises.map((exercise) => {
            const selected = props.selectedExerciseIds.includes(exercise.id);
            return (
              <div key={exercise.id} className={cn("grid gap-3 rounded-2xl border p-3 sm:grid-cols-[auto_1fr_auto] sm:items-center", selected ? "border-[var(--block-dryland-fg)]/30 bg-[var(--block-dryland-bg)]/45" : "border-[var(--color-border)] bg-white")}>
                <button type="button" onClick={() => props.onToggleExercise(exercise.id)} className={cn("flex h-11 w-11 items-center justify-center rounded-xl border focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]", selected ? "border-[var(--color-success)] bg-[var(--color-success)] text-white" : "border-[var(--color-border)] text-[var(--color-ink-soft)]")}>
                  {selected ? <CheckCircle2 className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                </button>
                <div>
                  <div className="font-black">{exercise.name}</div>
                  <div className="text-sm text-[var(--color-ink-muted)]">{exercise.sets ?? 1} x {exercise.reps ?? `${exercise.duration ?? 30} sec`} - {exercise.equipment ?? "Aucun"}</div>
                  {exercise.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {exercise.tags.map((tag) => <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-raised)] px-2 py-0.5 text-[11px] font-black text-[var(--color-ink-muted)]"><Tag className="h-3 w-3" /> {tag}</span>)}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-[var(--color-ink-muted)]">{exercise.category}</span>
                  {selected && (
                    <details className="relative">
                      <summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-xl border border-[var(--color-border)] bg-white"><MoreHorizontal className="h-4 w-4" /></summary>
                      <div className="absolute right-0 z-10 mt-2 grid w-40 gap-1 rounded-2xl border border-[var(--color-border)] bg-white p-2 shadow-[var(--shadow-soft)]">
                        <button type="button" onClick={() => props.onMoveExercise(exercise.id, -1)} className="flex min-h-9 items-center gap-2 rounded-xl px-2 text-left text-sm font-bold hover:bg-[var(--color-surface-raised)]"><ArrowUp className="h-4 w-4" /> Monter</button>
                        <button type="button" onClick={() => props.onMoveExercise(exercise.id, 1)} className="flex min-h-9 items-center gap-2 rounded-xl px-2 text-left text-sm font-bold hover:bg-[var(--color-surface-raised)]"><ArrowDown className="h-4 w-4" /> Descendre</button>
                      </div>
                    </details>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </BlockCard>
      <AssignmentSelector selected={props.assigned} onChange={props.onAssign} athletes={props.athletes} />
    </div>
  );
}

function QuickExerciseForm({ onCreateExercise }: { onCreateExercise: (input: QuickExerciseInput) => Promise<void> }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
        defaultReps: optionalNumber(formData.get("reps")),
        defaultDuration: optionalNumber(formData.get("duration")),
        tags
      })
        .then(() => form.reset())
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
        <Input name="reps" type="number" min="1" placeholder="Répétitions" />
        <Input name="duration" type="number" min="1" placeholder="Durée sec." />
        <Button type="submit" variant="action" disabled={pending}><Plus className="h-4 w-4" /> {pending ? "Création..." : "Ajouter"}</Button>
      </div>
      {error && <div className="mt-3 rounded-xl bg-[var(--color-danger)]/10 p-3 text-sm font-semibold text-[var(--color-danger)]">{error}</div>}
    </form>
  );
}

function PoolStep({ athletes, poolBlocks, poolAssignments, flashBlock, onAssignPoolBlock }: { athletes: BuilderAthlete[]; poolBlocks: BuilderPoolBlock[]; poolAssignments: Record<string, string[]>; flashBlock: string | null; onAssignPoolBlock: (blockId: string) => (ids: string[]) => void }) {
  return (
    <div className="space-y-5">
      {poolBlocks.map((block) => (
        <PoolBlock key={block.id} block={block} assigned={poolAssignments[block.id] ?? []} athletes={athletes} flash={flashBlock === block.id} onAssign={onAssignPoolBlock(block.id)} />
      ))}
      {poolBlocks.length === 0 && (
        <Card>
          <CardContent className="p-5">
            <WarningText>Aucun bloc piscine disponible. Cree ou charge un modele de seance avec blocs piscine pour alimenter cette etape.</WarningText>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PoolBlock({ block, assigned, athletes, flash, onAssign }: { block: BuilderPoolBlock; assigned: string[]; athletes: BuilderAthlete[]; flash: boolean; onAssign: (ids: string[]) => void }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <BlockCard type="pool" title={block.title} duration={block.duration} assigned={assigned} athletes={athletes} state="Modele serveur" flash={flash}>
        <div className="grid gap-3 md:grid-cols-2">
          {block.sections.map((section) => (
            <div key={`${block.id}-${section.height}-${section.label ?? "section"}`} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3">
              <div className="mb-3 text-sm font-black text-[var(--color-ink-muted)]">{(section.label ?? heightLabel(section.height)).toUpperCase()}</div>
              <div className="space-y-2">
                {section.dives.map((dive) => (
                  <div key={`${dive.diveCode}-${dive.order}`} className="grid grid-cols-[64px_1fr_auto] items-center gap-2 rounded-xl bg-white p-3">
                    <div className="text-xl font-black">{dive.diveCode}</div>
                    <div className="text-sm font-semibold text-[var(--color-ink-muted)]">{dive.diveName}</div>
                    <div className="rounded-full bg-[var(--block-pool-bg)] px-2 py-1 text-xs font-black text-[var(--block-pool-fg)]">{dive.repetitions} reps</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </BlockCard>
      <AssignmentSelector selected={assigned} onChange={onAssign} athletes={athletes} />
    </div>
  );
}

function AssignmentsStep(props: { athletes: BuilderAthlete[]; dryAssigned: string[]; poolBlocks: BuilderPoolBlock[]; poolAssignments: Record<string, string[]>; flashBlock: string | null; onAssignDry: (ids: string[]) => void; onAssignPoolBlock: (blockId: string) => (ids: string[]) => void }) {
  const assignmentBlocks = [
    { id: "dryland", title: "Dryland partage", assigned: props.dryAssigned, onAssign: props.onAssignDry, type: "dryland" as const },
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

function PublicationStep({ title, focus, date, totalDuration, totalVolume, unassignedBlocks, selectedExercises, athleteCount }: { title: string; focus: string; date: string; totalDuration: number; totalVolume: number; unassignedBlocks: number; selectedExercises: number; athleteCount: number }) {
  return (
    <Card>
      <CardHeader><CardTitle>Publication</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-[var(--radius-panel)] border border-[var(--color-navy)] bg-[var(--color-navy)] p-5 text-white">
          <StatusPill status="READY" />
          <h2 className="mt-4 text-3xl font-black leading-none text-white">{title || "Nouvelle seance"}</h2>
          <p className="mt-3 text-sm leading-6 text-white/68">{date || "Date a definir"} - {focus || "Focus a definir"}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            <DarkMetric label="Duree" value={`${totalDuration || 0} min`} />
            <DarkMetric label="Athletes" value={athleteCount} />
            <DarkMetric label="Volume" value={totalVolume} />
            <DarkMetric label="Exercices" value={selectedExercises} />
          </div>
        </div>
        {unassignedBlocks > 0 && <WarningText>{unassignedBlocks} bloc{unassignedBlocks > 1 ? "s" : ""} sans assignation. La publication sera refusee par validation serveur si dryland ou piscine A/B est vide.</WarningText>}
        <div className="rounded-2xl bg-[var(--color-surface-raised)] p-4 text-sm font-semibold text-[var(--color-ink-muted)]">
          La seance est enregistree et publiee uniquement quand tu cliques sur Publier la seance.
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryPanel(props: { title: string; date: string; duration: number; blockCount: number; athleteCount: number; unassignedCount: number; totalVolume: number; isPending: boolean; canPublish: boolean; onPublish: () => void }) {
  return (
    <aside className="hidden xl:block">
      <Card className="sticky top-6">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Resume</CardTitle>
              <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{props.title}</p>
            </div>
            <StatusPill status="DRAFT" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <SummaryMetric icon={Clock3} label="Duree totale" value={`${props.duration || 0} min`} />
          <SummaryMetric icon={FileText} label="Blocs" value={props.blockCount} />
          <SummaryMetric icon={Users} label="Athletes concernes" value={props.athleteCount} />
          <SummaryMetric icon={AlertTriangle} label="Sans assignation" value={props.unassignedCount} tone={props.unassignedCount > 0 ? "warning" : "default"} />
          <SummaryMetric icon={Waves} label="Volume estime" value={props.totalVolume} />
          <div className="rounded-2xl bg-[var(--color-surface-raised)] p-3 text-xs font-semibold text-[var(--color-ink-muted)]">Sauvegarde: non enregistre. Publication: creation serveur en statut publie.</div>
          <div className="grid gap-2">
            <Button type="button" variant="outline" disabled><Eye className="h-4 w-4" /> Apercu apres creation</Button>
            <Button type="button" variant="outline" disabled><Printer className="h-4 w-4" /> Impression apres creation</Button>
            <Button type="button" variant="action" disabled={props.isPending || !props.canPublish} onClick={props.onPublish}><Send className="h-4 w-4" /> {props.isPending ? "Publication..." : "Publier la seance"}</Button>
          </div>
        </CardContent>
      </Card>
    </aside>
  );
}

function BlockCard({ type, title, duration, assigned, athletes, state, flash, children }: { type: "dryland" | "pool"; title: string; duration: number; assigned: string[]; athletes: BuilderAthlete[]; state: string; flash?: boolean; children: React.ReactNode }) {
  return (
    <Card className={cn("overflow-hidden", flash && "builder-pulse")}>
      <div className={cn("h-2", type === "dryland" ? "bg-[var(--block-dryland-fg)]" : "bg-[var(--block-pool-fg)]")} />
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <BlockTypeBadge type={type} />
            <CardTitle className="mt-3 text-2xl">{title}</CardTitle>
            <div className="mt-2 flex flex-wrap gap-3 text-sm font-bold text-[var(--color-ink-muted)]">
              <span>{duration} min</span>
              <span>{assigned.length} athlete{assigned.length > 1 ? "s" : ""}</span>
              <span>{state}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AthleteAvatarGroup ids={assigned} athletes={athletes} limit={5} />
            <details className="relative">
              <summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-xl border border-[var(--color-border)] bg-white focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"><MoreHorizontal className="h-4 w-4" /></summary>
              <div className="absolute right-0 z-10 mt-2 w-52 rounded-2xl border border-[var(--color-border)] bg-white p-3 text-sm font-semibold text-[var(--color-ink-muted)] shadow-[var(--shadow-soft)]">Les actions de duplication et suppression ne sont pas connectees au backend actuel.</div>
            </details>
          </div>
        </div>
        {assigned.length === 0 && <WarningText>Ce bloc n&apos;est assigne a personne.</WarningText>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={cn("grid gap-2 text-sm font-black text-[var(--color-ink-muted)]", className)}><span>{label}</span>{children}</label>;
}

function SummaryMetric({ icon: Icon, label, value, tone = "default" }: { icon: LucideIcon; label: string; value: string | number; tone?: "default" | "warning" }) {
  return <div className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--color-surface-raised)] p-3"><div className="flex items-center gap-2 text-sm font-bold text-[var(--color-ink-muted)]"><Icon className={cn("h-4 w-4", tone === "warning" ? "text-[var(--color-action)]" : "text-[var(--color-brand-strong)]")} /> {label}</div><div className="font-black">{value}</div></div>;
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
    athleteIds: block.athleteIds,
    sections: block.poolTraining?.sections.map((section) => ({
      height: section.height,
      label: section.label,
      dives: section.dives
    })) ?? []
  }));
}

function defaultPoolAthletes(index: number, athleteIds: string[]) {
  if (index === 0) return athleteIds.slice(0, 2);
  if (index === 1) return athleteIds.slice(2, 3);
  return [];
}

function heightLabel(height: BuilderPoolSection["height"]) {
  if (height === "ONE_METER") return "1 metre";
  if (height === "THREE_METER") return "3 metres";
  if (height === "PLATFORM") return "Plateforme";
  return "Section";
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
