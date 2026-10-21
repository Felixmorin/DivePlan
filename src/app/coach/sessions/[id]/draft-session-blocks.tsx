"use client";

import { useState } from "react";
import { CheckCircle2, Clock3, Dumbbell, Layers3, Timer, Users, Waves, ChevronDown } from "lucide-react";
import type { getCoachSession } from "@/lib/coach-session";

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
      {visibleBlocks.map((block) => <details key={block.id} className="draft-block">
        <summary><span className="draft-block-number">{blocks.indexOf(block) + 1}</span><span className={`draft-kind ${kindStyle(block.type)}`}>{kindLabel(block.type)}</span><span className="draft-block-info"><strong>{block.title}</strong><span className="draft-block-meta"><span><Clock3 />{block.duration} min</span><span><Users />{block.assignments.length} athlètes</span>{block.estimatedVolume > 0 && <span><Waves />{block.estimatedVolume} répétitions</span>}</span></span><ChevronDown className="draft-chevron" /></summary>
        <div className="draft-block-content">
          {block.description && <p>{block.description}</p>}
          {block.drylandExercises.length > 0 && <div className="draft-exercises">{block.drylandExercises.map((item) => <div key={`${item.exerciseId}-${item.order}`}><strong>{item.exercise.name}</strong><span>{item.sets ?? 1} séries · {item.reps ?? `${item.duration ?? 30} sec`}</span>{item.notes && <small>{item.notes}</small>}</div>)}</div>}
          {block.poolTraining?.sections.map((section) => <div className="draft-section" key={section.id}><div className="draft-section-head"><strong>{section.label ?? poolHeightContext(section.height)}</strong><span>{section.dives.length} plongeons · {section.dives.reduce((sum, dive) => sum + dive.repetitions, 0)} reps</span></div>
            <div className="draft-table-scroll"><table><thead><tr><th>Athlète</th><th>Hauteur</th><th>Plongeons planifiés</th><th>Aperçu des plongeons</th></tr></thead><tbody>{block.assignments.map(({ athlete }) => <tr key={athlete.id}><td><span className="draft-avatar">{athlete.user.firstName[0]}{athlete.user.lastName[0]}</span>{athlete.user.firstName} {athlete.user.lastName}</td><td>{poolHeightContext(section.height)}</td><td>{section.dives.reduce((sum, dive) => sum + dive.repetitions, 0)}</td><td>{section.dives.slice(0, 4).map((dive) => dive.diveCode).join(", ")}{section.dives.length > 4 ? "…" : ""}</td></tr>)}{block.assignments.length === 0 && <tr><td colSpan={4}>Aucun athlète assigné à ce bloc.</td></tr>}</tbody></table></div>
          </div>)}
          {block.competitionEvaluation && <p className="draft-eval"><CheckCircle2 /> Évaluation de la liste de compétition prévue dans ce bloc.</p>}
        </div>
      </details>)}
      {visibleBlocks.length === 0 && <p className="draft-empty">Aucun bloc dans cette séance pour le moment.</p>}
    </div>
  </>;
}
