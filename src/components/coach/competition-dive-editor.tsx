"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, X } from "lucide-react";
import { addCompetitionDive, removeCompetitionDive, reorderCompetitionDives, updateCompetitionDiveDifficulty } from "@/app/coach/athletes/actions";
import { worldAquaticsDifficulty } from "@/lib/world-aquatics-dd";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type CompetitionDive = {
  id: string;
  height: "ONE_METER" | "THREE_METER" | "PLATFORM" | "CUSTOM";
  code: string;
  difficulty: number | null;
};

const heights = [
  { value: "ONE_METER", label: "1 m" },
  { value: "THREE_METER", label: "3 m" },
  { value: "PLATFORM", label: "Plateforme" }
] as const;

export function CompetitionDiveEditor({ athleteId, dives, demo }: { athleteId: string; dives: CompetitionDive[]; demo: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [error, setError] = useState("");

  function saveOrder(height: CompetitionDive["height"], current: CompetitionDive[], dragged: string, target: string) {
    if (demo || pending || dragged === target) return;
    const from = current.findIndex((dive) => dive.id === dragged);
    const to = current.findIndex((dive) => dive.id === target);
    if (from < 0 || to < 0) return;
    const ordered = [...current];
    const [item] = ordered.splice(from, 1);
    ordered.splice(to, 0, item);
    setError("");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("athleteId", athleteId);
      formData.set("height", height);
      formData.set("diveIds", JSON.stringify(ordered.map((dive) => dive.id)));
      try {
        await reorderCompetitionDives(formData);
        router.refresh();
      } catch {
        setError("Impossible d’enregistrer le nouvel ordre. Réessaie.");
        router.refresh();
      }
    });
  }

  return (
    <Card className="mb-6 overflow-hidden">
      <CardHeader className="border-b border-[var(--color-border)] bg-[var(--color-surface-raised)]">
        <CardTitle>Liste de compétition</CardTitle>
        <p className="text-sm leading-6 text-[var(--color-ink-muted)]">Cette liste est visible dans le profil de l’athlète. Fais glisser les plongeons pour modifier l’ordre de passage.</p>
        {error && <p role="alert" className="text-sm font-bold text-[var(--color-danger)]">{error}</p>}
        {pending && <p role="status" className="text-sm font-semibold text-[var(--color-ink-muted)]">Enregistrement de l’ordre…</p>}
      </CardHeader>
      <CardContent className="grid gap-5 p-5 lg:grid-cols-3">
        {heights.map((height) => {
          const items = dives.filter((dive) => dive.height === height.value);

          return (
            <section key={height.value} className="rounded-[var(--radius-ui)] border border-[var(--color-border)] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-lg font-black">{height.label}</h3>
                <Badge variant="outline">{items.length}</Badge>
              </div>

              <div className="space-y-2" aria-label={`Ordre des plongeons, ${height.label}`}>
                {items.map((dive, index) => (
                  <div
                    key={dive.id}
                    draggable={!demo && !pending}
                    onDragStart={(event) => {
                      setDraggedId(dive.id);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", dive.id);
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const dragged = event.dataTransfer.getData("text/plain") || draggedId;
                      if (dragged) saveOrder(height.value, items, dragged, dive.id);
                      setDraggedId(null);
                    }}
                    onDragEnd={() => setDraggedId(null)}
                    className={`flex items-center gap-2 rounded-xl bg-[var(--color-surface-raised)] p-3 ${draggedId === dive.id ? "opacity-40" : ""} ${!demo && !pending ? "cursor-grab active:cursor-grabbing" : ""}`}
                  >
                    <GripVertical className="h-5 w-5 shrink-0 text-[var(--color-ink-muted)]" aria-hidden="true" />
                    <span className="w-5 shrink-0 text-xs font-bold text-[var(--color-ink-muted)]">{index + 1}.</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-black">{dive.code} <span className="ml-1 text-sm font-semibold text-[var(--color-ink-muted)]">{dive.difficulty?.toFixed(1) ?? "—"}</span></div>
                      {!demo && <form action={updateCompetitionDiveDifficulty} className="mt-2 flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                        <input type="hidden" name="diveId" value={dive.id} />
                        <label className="sr-only" htmlFor={`dd-${dive.id}`}>Modifier le DD de {dive.code}</label>
                        <input id={`dd-${dive.id}`} name="difficulty" inputMode="decimal" placeholder="DD" defaultValue={dive.difficulty?.toFixed(1) ?? ""} className="min-h-9 w-20 rounded-lg border border-[var(--color-border)] bg-white px-2 text-sm outline-none focus:border-[var(--color-brand)] focus:shadow-[var(--focus-ring)]" />
                        <Button type="submit" size="sm" variant="outline" disabled={pending}>Enregistrer DD</Button>
                      </form>}
                    </div>
                    {!demo && <div className="flex shrink-0 items-center">
                      <Button type="button" variant="ghost" size="icon" disabled={pending || index === 0} aria-label={`Monter ${dive.code}`} onClick={() => saveOrder(height.value, items, dive.id, items[index - 1]?.id ?? dive.id)}>
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" disabled={pending || index === items.length - 1} aria-label={`Descendre ${dive.code}`} onClick={() => saveOrder(height.value, items, dive.id, items[index + 1]?.id ?? dive.id)}>
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    </div>}
                    <form action={demo ? undefined : removeCompetitionDive}>
                      <input type="hidden" name="diveId" value={dive.id} />
                      <Button type="submit" variant="ghost" size="icon" disabled={demo || pending} aria-label={`Retirer ${dive.code}`} className="text-[var(--color-danger)]">
                        <X className="h-4 w-4" />
                      </Button>
                    </form>
                  </div>
                ))}
                {items.length === 0 && <p className="py-3 text-sm font-semibold text-[var(--color-ink-muted)]">Aucun plongeon.</p>}
              </div>

              <form action={demo ? undefined : addCompetitionDive} className="mt-4 grid gap-2 border-t border-[var(--color-border)] pt-4">
                <input type="hidden" name="athleteId" value={athleteId} />
                <input type="hidden" name="height" value={height.value} />
                <div className="grid grid-cols-[1fr_5rem] gap-2">
                  <input name="diveCode" required maxLength={12} placeholder="Code" aria-label={`Code du plongeon ${height.label}`} onChange={(event) => {
                    const form = event.currentTarget.form;
                    const difficultyInput = form?.elements.namedItem("difficulty");
                    if (difficultyInput instanceof HTMLInputElement) {
                      const value = worldAquaticsDifficulty(event.currentTarget.value, height.value);
                      difficultyInput.value = value === null ? "" : value.toFixed(1);
                    }
                  }} className="min-h-11 rounded-xl border border-[var(--color-border)] bg-white px-3 text-base outline-none focus:border-[var(--color-brand)] focus:shadow-[var(--focus-ring)]" />
                  <input name="difficulty" inputMode="decimal" placeholder="DD" aria-label={`Degré de difficulté ${height.label}`} className="min-h-11 rounded-xl border border-[var(--color-border)] bg-white px-3 text-base outline-none focus:border-[var(--color-brand)] focus:shadow-[var(--focus-ring)]" />
                </div>
                <p className="text-xs text-[var(--color-ink-muted)]">DD World Aquatics proposé automatiquement pour les codes reconnus; modifiable au besoin.</p>
                <Button type="submit" disabled={demo || pending} variant="default" className="w-full"><Plus className="h-4 w-4" /> Ajouter</Button>
              </form>
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}
