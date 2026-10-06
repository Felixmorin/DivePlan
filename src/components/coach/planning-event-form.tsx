"use client";

import { useState } from "react";
import { CalendarPlus, Pencil, Trophy, X } from "lucide-react";
import { createPlanningEvent } from "@/app/coach/planning/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type PlanningTarget = { id: string; label: string; kind: "group" | "athlete" };

export function PlanningEventForm({ targets, demo }: { targets: PlanningTarget[]; demo: boolean }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("TRAINING_SCHEDULE");

  return (
    <>
      <Button type="button" variant="action" onClick={() => setOpen(true)}><CalendarPlus className="h-4 w-4" /> Nouvel événement</Button>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-[var(--color-navy)]/25" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <aside className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-[var(--color-border)] bg-white p-5 shadow-2xl sm:p-7" role="dialog" aria-modal="true" aria-labelledby="new-planning-event-title">
            <div className="mb-7 flex items-start justify-between gap-4">
              <div><p className="text-xs font-black uppercase tracking-wide text-[var(--color-brand-strong)]">Planning</p><h2 id="new-planning-event-title" className="mt-2 text-2xl font-black">Nouvel événement</h2></div>
              <Button type="button" variant="ghost" size="icon" aria-label="Fermer" onClick={() => setOpen(false)}><X className="h-5 w-5" /></Button>
            </div>
            <form action={demo ? undefined : createPlanningEvent} className="flex flex-1 flex-col gap-4" onSubmit={() => setOpen(false)}>
              <div className="grid grid-cols-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-1">
                <button type="button" onClick={() => setType("TRAINING_SCHEDULE")} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-2 text-sm font-black ${type === "TRAINING_SCHEDULE" ? "bg-[var(--block-pool-bg)] text-[var(--block-pool-fg)] shadow-sm" : "text-[var(--color-ink-muted)]"}`}><Pencil className="h-4 w-4" /> Entraînement</button>
                <button type="button" onClick={() => setType("COMPETITION")} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-2 text-sm font-black ${type === "COMPETITION" ? "bg-[var(--block-pool-bg)] text-[var(--block-pool-fg)] shadow-sm" : "text-[var(--color-ink-muted)]"}`}><Trophy className="h-4 w-4" /> Compétition</button>
              </div>
              <input type="hidden" name="type" value={type} />
              <Field label="Titre" required><Input name="title" placeholder="Ex : Camp technique" required disabled={demo} /></Field>
              <Field label="Date et heure" required><Input name="startsAt" type="datetime-local" required disabled={demo} /></Field>
              {type === "COMPETITION" && <Field label="Fin de la compétition" required><Input name="endsAt" type="datetime-local" required disabled={demo} /></Field>}
              <Field label="Durée (minutes)" required><Input name="duration" type="number" min="1" placeholder="120" required disabled={demo} /></Field>
              {type === "TRAINING_SCHEDULE" && <Field label="Répétition"><select name="recurrence" disabled={demo} defaultValue="NONE" className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm"><option value="NONE">Une seule fois</option><option value="WEEKLY">Chaque semaine</option></select></Field>}
              {type === "TRAINING_SCHEDULE" && <Field label="Répéter jusqu’au"><Input name="recurrenceUntil" type="date" disabled={demo} /></Field>}
              <Field label="Association"><select name="target" disabled={demo} defaultValue="club" className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm"><option value="club">Club complet</option>{targets.map((target) => <option key={`${target.kind}:${target.id}`} value={`${target.kind}:${target.id}`}>{target.kind === "group" ? "Groupe" : "Athlète"} · {target.label}</option>)}</select></Field>
              <Field label="Lieu"><Input name="location" placeholder="Piscine, ville, bassin…" disabled={demo} /></Field>
              <details className="rounded-2xl border border-[var(--color-border)] px-4 py-3"><summary className="cursor-pointer text-sm font-black">Notes (optionnel)</summary><Textarea name="notes" placeholder="Détails utiles pour le coach" disabled={demo} className="mt-3 min-h-24" /></details>
              {demo && <p className="text-sm text-[var(--color-ink-muted)]">La création d’événements est disponible avec un club connecté.</p>}
              <div className="mt-auto grid gap-2 border-t border-[var(--color-border)] pt-4">
                <Button type="submit" variant="action" disabled={demo} className="w-full bg-[var(--color-brand-strong)]"><CalendarPlus className="h-4 w-4" /> Ajouter au planning</Button>
                <Button type="button" variant="outline" onClick={() => setOpen(false)} className="w-full">Annuler</Button>
              </div>
            </form>
          </aside>
        </div>
      )}
    </>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <label className="block text-xs font-black text-[var(--color-ink)]"><span className="mb-1.5 block">{label}{required && <span className="ml-1 text-[var(--color-action-strong)]">*</span>}</span>{children}</label>;
}
