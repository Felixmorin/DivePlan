"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { GripVertical, Plus, X } from "lucide-react";
import { addCompetitionDive, createCompetitionDiveList, removeCompetitionDive, renameCompetitionDiveList, reorderCompetitionDives, updateCompetitionDiveDifficulty } from "@/app/coach/athletes/actions";
import { worldAquaticsDifficulty } from "@/lib/world-aquatics-dd";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type CompetitionDive = {
  id: string;
  listId: string;
  height: "ONE_METER" | "THREE_METER" | "PLATFORM" | "CUSTOM";
  code: string;
  difficulty: number | null;
  platformHeight: number | null;
  volume: number;
};

const heights = [
  { value: "ONE_METER", label: "1 m" },
  { value: "THREE_METER", label: "3 m" },
  { value: "PLATFORM", label: "Plateforme" }
] as const;

export function CompetitionDiveEditor({ athleteId, lists, dives, demo }: { athleteId: string; lists: Array<{ id: string; name: string }>; dives: CompetitionDive[]; demo: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [activeListId, setActiveListId] = useState(lists[0]?.id ?? "");
  const [error, setError] = useState("");
  const activeList = lists.find((list) => list.id === activeListId) ?? lists[0];

  function createList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setError("");
    startTransition(async () => {
      try {
        const created = await createCompetitionDiveList(formData);
        setActiveListId(created.id);
        form.reset();
        router.refresh();
      } catch {
        setError("Impossible de créer cette liste. Vérifie son nom et réessaie.");
      }
    });
  }

  function renameList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError("");
    startTransition(async () => {
      try {
        await renameCompetitionDiveList(formData);
        router.refresh();
      } catch {
        setError("Impossible de renommer cette liste. Vérifie son nom et réessaie.");
      }
    });
  }

  function saveOrder(listId: string, height: CompetitionDive["height"], current: CompetitionDive[], dragged: string, target: string) {
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
      formData.set("listId", listId);
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
        <p className="text-sm leading-6 text-[var(--color-ink-muted)]">Crée des listes avec le nom de ton choix. Chaque liste peut avoir son propre ordre de passage.</p>
        <div className="flex flex-wrap gap-2" aria-label="Listes de compétition">
          {lists.map((list) => <button key={list.id} type="button" aria-pressed={activeList?.id === list.id} onClick={() => setActiveListId(list.id)} className={`rounded-full border px-4 py-2 text-sm font-black ${activeList?.id === list.id ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-white" : "border-[var(--color-border)] bg-white text-[var(--color-ink-muted)]"}`}>{list.name}<span className="ml-2 opacity-75">{dives.filter((dive) => dive.listId === list.id).length}</span></button>)}
        </div>
        {!demo && <form onSubmit={createList} className="flex flex-wrap gap-2">
          <input type="hidden" name="athleteId" value={athleteId} />
          <input name="name" required maxLength={60} placeholder="Nom de la nouvelle liste" aria-label="Nom de la nouvelle liste" className="min-h-10 min-w-56 flex-1 rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm outline-none focus:border-[var(--color-brand)] focus:shadow-[var(--focus-ring)]" />
          <Button type="submit" variant="outline" disabled={pending}><Plus className="h-4 w-4"/>Créer une liste</Button>
        </form>}
        {activeList && !demo && <form onSubmit={renameList} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="listId" value={activeList.id} />
          <label htmlFor={`list-name-${activeList.id}`} className="text-sm font-bold text-[var(--color-ink-muted)]">Nom de la liste</label>
          <input id={`list-name-${activeList.id}`} name="name" required maxLength={60} defaultValue={activeList.name} className="min-h-10 min-w-48 flex-1 rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm outline-none focus:border-[var(--color-brand)] focus:shadow-[var(--focus-ring)]" />
          <Button type="submit" variant="outline" disabled={pending}>Renommer</Button>
        </form>}
        {error && <p role="alert" className="text-sm font-bold text-[var(--color-danger)]">{error}</p>}
        {pending && <p role="status" className="text-sm font-semibold text-[var(--color-ink-muted)]">Enregistrement…</p>}
      </CardHeader>
      <CardContent className="grid gap-5 p-5 lg:grid-cols-3">
        {heights.map((height) => {
          const items = dives.filter((dive) => dive.listId === activeList?.id && dive.height === height.value);

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
                      if (dragged && activeList) saveOrder(activeList.id, height.value, items, dragged, dive.id);
                      setDraggedId(null);
                    }}
                    onDragEnd={() => setDraggedId(null)}
                    className={`flex items-center gap-2 rounded-xl border p-3 ${dive.volume === 0 ? "border-red-200 bg-red-100" : dive.volume < 10 ? "border-orange-200 bg-orange-100" : dive.volume <= 20 ? "border-yellow-200 bg-yellow-100" : "border-green-200 bg-green-100"} ${draggedId === dive.id ? "opacity-40" : ""} ${!demo && !pending ? "cursor-grab active:cursor-grabbing" : ""}`}
                  >
                    <GripVertical className="h-5 w-5 shrink-0 text-[var(--color-ink-muted)]" aria-hidden="true" />
                    <span className="w-5 shrink-0 text-xs font-bold text-[var(--color-ink-muted)]">{index + 1}.</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-black">{dive.code} <span className="ml-1 text-sm font-semibold text-[var(--color-ink-muted)]">{dive.difficulty?.toFixed(1) ?? "—"}</span></div>
                      {height.value === "PLATFORM" && <p className={`mt-1 text-xs font-bold ${dive.platformHeight === null ? "text-red-700" : "text-[var(--color-ink-muted)]"}`}>{dive.platformHeight === null ? "Hauteur à préciser" : `${dive.platformHeight} m`}</p>}
                      {!demo && <form action={updateCompetitionDiveDifficulty} className="mt-2 flex flex-wrap items-center gap-2" onClick={(event) => event.stopPropagation()}>
                        <input type="hidden" name="diveId" value={dive.id} />
                        <label className="sr-only" htmlFor={`dd-${dive.id}`}>Modifier le DD de {dive.code}</label>
                        <input id={`dd-${dive.id}`} name="difficulty" inputMode="decimal" placeholder="DD" defaultValue={dive.difficulty?.toFixed(1) ?? ""} className="min-h-9 w-20 rounded-lg border border-[var(--color-border)] bg-white px-2 text-sm outline-none focus:border-[var(--color-brand)] focus:shadow-[var(--focus-ring)]" />
                        {height.value === "PLATFORM" && <><label className="sr-only" htmlFor={`ph-${dive.id}`}>Hauteur de plateforme de {dive.code}</label><select id={`ph-${dive.id}`} name="platformHeight" required defaultValue={dive.platformHeight?.toString() ?? ""} className="min-h-9 rounded-lg border border-[var(--color-border)] bg-white px-2 text-sm"><option value="" disabled>Hauteur</option><option value="5">5 m</option><option value="7.5">7,5 m</option><option value="10">10 m</option></select></>}
                        <Button type="submit" size="sm" variant="outline" disabled={pending}>Enregistrer</Button>
                      </form>}
                    </div>
                    <span className="shrink-0 text-right text-xs font-bold text-[var(--color-ink-muted)]" aria-label={`${dive.volume} répétitions effectuées`}>
                      <strong className="block text-base font-black leading-none text-[var(--color-brand-strong)]">{dive.volume}</strong>
                      rép.
                    </span>
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
                <input type="hidden" name="listId" value={activeList?.id ?? ""} />
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
                {height.value === "PLATFORM" && <select name="platformHeight" required aria-label="Hauteur du plongeon de plateforme" defaultValue="" className="min-h-11 rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm font-semibold"><option value="" disabled>Hauteur du saut…</option><option value="5">5 m</option><option value="7.5">7,5 m</option><option value="10">10 m</option></select>}
                <Button type="submit" disabled={demo || pending} variant="default" className="w-full"><Plus className="h-4 w-4" /> Ajouter</Button>
              </form>
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}
