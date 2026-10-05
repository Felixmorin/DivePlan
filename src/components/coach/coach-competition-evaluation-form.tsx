"use client";

import { useState, useTransition } from "react";
import { saveCoachCompetitionDiveEvaluation } from "@/app/coach/athletes/actions";
import { Button } from "@/components/ui/button";

type CompetitionDive = {
  id: string;
  code: string;
  height: "ONE_METER" | "THREE_METER" | "PLATFORM" | "CUSTOM";
};

const heightLabels: Record<CompetitionDive["height"], string> = {
  ONE_METER: "1 m",
  THREE_METER: "3 m",
  PLATFORM: "Plateforme",
  CUSTOM: "Autre"
};

export function CoachCompetitionEvaluationForm({ athleteId, dives }: { athleteId: string; dives: CompetitionDive[] }) {
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const complete = dives.length > 0 && dives.every((dive) => ratings[dive.id] !== undefined);
  const groupedDives = Object.entries(heightLabels).map(([height, label]) => ({ height, label, dives: dives.filter((dive) => dive.height === height) })).filter((group) => group.dives.length > 0);

  function save() {
    if (!complete) return;
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await saveCoachCompetitionDiveEvaluation({
          athleteId,
          ratings: dives.map((dive) => ({ competitionDiveId: dive.id, rating: ratings[dive.id] }))
        });
        setRatings({});
        setSaved(true);
      } catch {
        setError("L’évaluation n’a pas pu être enregistrée. Réessaie.");
      }
    });
  }

  return (
    <section className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-white p-5">
      <h2 className="text-xl font-black">Mon évaluation</h2>
      <p className="mt-1 text-sm leading-6 text-[var(--color-ink-muted)]">Évalue ta confiance en chacun des plongeons de compétition de l’athlète. 0 = pas du tout confiant · 5 = très confiant.</p>
      {dives.length === 0 ? <p className="mt-4 rounded-xl bg-[var(--color-surface-raised)] p-4 text-sm font-semibold text-[var(--color-ink-muted)]">Ajoute des plongeons à sa liste de compétition avant de faire une évaluation.</p> : (
        <div className="mt-4 space-y-5">
          {groupedDives.map((group) => <section key={group.height} className="border-t-2 border-[var(--color-brand)]/30 pt-4 first:border-t-0 first:pt-0">
          <h3 className="mb-3 text-base font-black">{group.label}</h3>
          <div className="grid gap-3 sm:grid-cols-2">{group.dives.map((dive) => (
            <fieldset key={dive.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3">
              <legend className="px-1 text-sm font-black">{dive.code}</legend>
              <div className="mt-2 grid grid-cols-6 gap-2">
                {[0, 1, 2, 3, 4, 5].map((rating) => <label key={rating} className={`flex h-10 cursor-pointer items-center justify-center rounded-lg border text-sm font-black transition ${ratings[dive.id] === rating ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-white" : "border-[var(--color-border)] bg-white text-[var(--color-ink-soft)]"}`}>
                  <input type="radio" name={`coach-confidence-${dive.id}`} value={rating} checked={ratings[dive.id] === rating} onChange={() => { setRatings((current) => ({ ...current, [dive.id]: rating })); setSaved(false); }} className="sr-only" />{rating}
                </label>)}
              </div>
            </fieldset>
          ))}</div></section>)}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" disabled={!complete || pending} onClick={save}>{pending ? "Enregistrement…" : "Enregistrer mon évaluation"}</Button>
        {saved && <span role="status" className="text-sm font-bold text-emerald-700">Évaluation enregistrée.</span>}
        {error && <span role="alert" className="text-sm font-bold text-rose-700">{error}</span>}
      </div>
    </section>
  );
}
