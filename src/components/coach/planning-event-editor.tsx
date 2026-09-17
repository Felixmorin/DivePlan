"use client";

import { useState } from "react";
import { Pencil, Trash2, X } from "lucide-react";
import { deletePlanningEvent, updatePlanningEvent } from "@/app/coach/planning/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type PlanningTarget = { id: string; label: string; kind: "group" | "athlete" };

type PlanningEventEditorProps = {
  event: {
    id: string;
    type: string;
    title: string;
    startsAt: string;
    endsAt: string;
    duration: number | null;
    location: string | null;
    notes: string | null;
    target: string;
  };
  targets: PlanningTarget[];
  compact?: boolean;
};

export function PlanningEventEditor({ event, targets, compact = false }: PlanningEventEditorProps) {
  const [open, setOpen] = useState(false);
  const [eventType, setEventType] = useState(event.type);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={compact ? "h-7 min-h-7 w-7" : "h-8 min-h-8 w-8"}
        aria-label={`Modifier ${event.title}`}
        title="Modifier l’horaire"
        onClick={() => setOpen(true)}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-navy)]/45 p-4" role="presentation" onMouseDown={(click) => { if (click.target === click.currentTarget) setOpen(false); }}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby={`edit-event-${event.id}`}>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase text-[var(--color-brand-strong)]">Planning</p>
                <h2 id={`edit-event-${event.id}`} className="mt-1 text-2xl font-black">Modifier l’horaire</h2>
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label="Fermer" onClick={() => setOpen(false)}><X className="h-5 w-5" /></Button>
            </div>

            <form action={updatePlanningEvent} className="grid gap-4 md:grid-cols-2" onSubmit={() => setOpen(false)}>
              <input type="hidden" name="eventId" value={event.id} />
              <label className="text-xs font-black uppercase text-[var(--color-ink-muted)]"><span className="mb-1 block">Type</span>
                <select name="type" value={eventType} onChange={(change) => setEventType(change.target.value)} className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm font-semibold">
                  <option value="TRAINING_SCHEDULE">Horaire entraînement</option>
                  <option value="COMPETITION">Compétition</option>
                  <option value="CAMP">Camp</option>
                </select>
              </label>
              <label className="text-xs font-black uppercase text-[var(--color-ink-muted)]"><span className="mb-1 block">Titre</span><Input name="title" defaultValue={event.title} required /></label>
              <label className="text-xs font-black uppercase text-[var(--color-ink-muted)]"><span className="mb-1 block">Date et heure</span><Input name="startsAt" type="datetime-local" defaultValue={event.startsAt} required /></label>
              {eventType === "COMPETITION" && <label className="text-xs font-black uppercase text-[var(--color-ink-muted)]"><span className="mb-1 block">Fin (compétition)</span><Input name="endsAt" type="datetime-local" defaultValue={event.endsAt} required /></label>}
              <label className="text-xs font-black uppercase text-[var(--color-ink-muted)]"><span className="mb-1 block">Durée</span><Input name="duration" type="number" min="1" defaultValue={event.duration ?? ""} placeholder="minutes" /></label>
              <label className="text-xs font-black uppercase text-[var(--color-ink-muted)]"><span className="mb-1 block">Association</span>
                <select name="target" defaultValue={event.target} className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm font-semibold">
                  <option value="club">Club complet</option>
                  {targets.map((target) => <option key={`${target.kind}:${target.id}`} value={`${target.kind}:${target.id}`}>{target.kind === "group" ? "Groupe" : "Athlète"} · {target.label}</option>)}
                </select>
              </label>
              <label className="text-xs font-black uppercase text-[var(--color-ink-muted)]"><span className="mb-1 block">Lieu</span><Input name="location" defaultValue={event.location ?? ""} placeholder="Piscine, ville, bassin..." /></label>
              <label className="text-xs font-black uppercase text-[var(--color-ink-muted)] md:col-span-2"><span className="mb-1 block">Notes</span><Textarea name="notes" defaultValue={event.notes ?? ""} placeholder="Détails utiles pour le coach" /></label>
              <div className="flex justify-end gap-2 md:col-span-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button><Button type="submit" variant="action">Enregistrer</Button></div>
            </form>

            <form
              action={deletePlanningEvent}
              className="mt-4 flex justify-start border-t border-[var(--color-border)] pt-4"
              onSubmit={(submitEvent) => {
                if (!window.confirm(`Supprimer l’événement « ${event.title} » ? Cette action est définitive.`)) {
                  submitEvent.preventDefault();
                }
              }}
            >
              <input type="hidden" name="eventId" value={event.id} />
              <Button type="submit" variant="outline" className="border-[var(--color-danger)] text-[var(--color-danger)] hover:bg-red-50">
                <Trash2 className="h-4 w-4" /> Supprimer l’événement
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
