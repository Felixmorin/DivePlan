"use client";

import { useState } from "react";
import { CheckCircle2, Clock3, Dumbbell, Layers3, Timer, Users, Waves, ChevronDown } from "lucide-react";
import type { getCoachSession } from "@/lib/coach-session";
import { PoolProgressTracker } from "@/components/coach/pool-progress-tracker";
import { AthleteAvatarGroup } from "@/components/coach/athlete-avatar-group";

type DraftBlock = Awaited<ReturnType<typeof getCoachSession>>["blocks"][number];
type BlockFilter = "ALL" | DraftBlock["type"];

const categories: Array<{ type: DraftBlock["type"]; label: string; icon: typeof Layers3 }> = [
  { type: "WARMUP", label: "Échauffement", icon: Timer },
  { type: "DRYLAND", label: "Dryland", icon: Dumbbell },
  { type: "POOL", label: "Piscine", icon: Waves },
  { type: "COOLDOWN", label: "Retour au calme", icon: CheckCircle2 }
];

function kindLabel(type: DraftBlock["type"]) {
  return categories.find((category) => category.type === type)?.label ?? type;
}

function kindStyle(type: DraftBlock["type"]) {
  if (type === "WARMUP") return "bg-amber-100 text-amber-800";
  if (type === "DRYLAND") return "bg-violet-100 text-violet-800";
  if (type === "POOL") return "bg-sky-100 text-sky-800";
  return "bg-emerald-100 text-emerald-800";
}

function poolHeightContext(height: string) {
  if (height === "ONE_METER") return "1 m";
  if (height === "THREE_METER") return "3 m";
  if (height === "PLATFORM") return "Plateforme";
  return "Section personnalisée";
}

export function DraftSessionBlocks({ blocks }: { blocks: DraftBlock[] }) {
  const [filter, setFilter] = useState<BlockFilter>("ALL");
  const visibleBlocks = filter === "ALL" ? blocks : blocks.filter((block) => block.type === filter);

  return <>
    <nav className="draft-tabs" aria-label="Sections de la séance">
      <button type="button" className={filter === "ALL" ? "active" : ""} aria-pressed={filter === "ALL"} onClick={() => setFilter("ALL")}><Layers3 /> Aperçu</button>
      {categories.map(({ type, label, icon: Icon }) => {
        const count = blocks.filter((block) => block.type === type).length;
        if (count === 0) return null;
        return <button type="button" key={type} className={filter === type ? "active" : ""} aria-pressed={filter === type} onClick={() => setFilter(type)}><Icon /> {label} ({count})</button>;
      })}
    </nav>
    <div className="draft-blocks">
      {visibleBlocks.map((block) => {
        const repetitions = block.type === "DRYLAND"
          ? block.drylandExercises.reduce((sum, item) => sum + (item.sets ?? 1) * (item.reps ?? 0), 0)
          : block.type === "POOL" ? block.estimatedVolume : 0;
        return <details key={block.id} className="draft-block">
        <summary><span className="draft-block-number">{blocks.indexOf(block) + 1}</span><span className={`draft-kind ${kindStyle(block.type)}`}>{kindLabel(block.type)}</span><span className="draft-block-info"><strong>{block.title}</strong><span className="draft-block-meta"><span><Clock3 />{block.duration} min</span><span><Users />{block.assignments.length} athlètes</span>{repetitions > 0 && <span><Waves />{repetitions} répétitions</span>}</span></span><AthleteAvatarGroup ids={block.assignments.map(({ athleteId }) => athleteId)} athletes={block.assignments.map(({ athlete }) => ({ id: athlete.id, firstName: athlete.user.firstName, lastName: athlete.user.lastName }))} /><ChevronDown className="draft-chevron" /></summary>
        <div className="draft-block-content">
          {block.description && <p>{block.description}</p>}
          {block.drylandExercises.length > 0 && <div className="draft-exercises">{block.drylandExercises.map((item) => <div key={`${item.exerciseId}-${item.order}`}><strong>{item.exercise.name}</strong><span>{item.sets ?? 1}x{item.reps ?? `${item.duration ?? 30} sec`}</span>{item.notes && <small>{item.notes}</small>}</div>)}</div>}
          {block.poolTraining && <>
            <details className="mb-3">
              <summary className="cursor-pointer rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm font-bold text-[var(--color-ink-muted)]">Liste de plongeons ({block.poolTraining.sections.reduce((sum, section) => sum + section.dives.length, 0)} plongeons · {block.estimatedVolume} répétitions)</summary>
              <div className="mt-2 space-y-2">{block.poolTraining.sections.map((section) => <div key={section.id} className="rounded-xl border border-[var(--color-border)] p-3"><strong>{section.label ?? poolHeightContext(section.height)}</strong><div className="mt-2 flex flex-wrap gap-2">{section.dives.map((dive) => <span key={dive.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-2 py-1 text-xs font-bold">{dive.diveCode} · {dive.repetitions} reps</span>)}</div></div>)}</div>
            </details>
            {block.poolTraining.sections.map((section, index) => <PoolProgressTracker key={section.id} sectionLabel={section.label ?? poolHeightContext(section.height)} showLegend={index === 0} activeDiveIds={{}} athletes={block.assignments.map(({ athlete }) => ({ id: athlete.id, firstName: athlete.user.firstName, lastName: athlete.user.lastName }))} dives={section.dives.map(({ id, diveCode, repetitions }) => ({ id, diveCode, repetitions }))} logs={[]} />)}
          </>}
          {block.competitionEvaluation && <p className="draft-eval"><CheckCircle2 /> Évaluation de la liste de compétition prévue dans ce bloc.</p>}
        </div>
      </details>;
      })}
      {visibleBlocks.length === 0 && <p className="draft-empty">Aucun bloc dans cette séance pour le moment.</p>}
    </div>
  </>;
}
