"use client";

import { useState } from "react";
import { CalendarPlus } from "lucide-react";
import { createPlanningEvent } from "@/app/coach/planning/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type PlanningTarget = { id: string; label: string; kind: "group" | "athlete" };

export function PlanningEventForm({ targets, demo }: { targets: PlanningTarget[]; demo: boolean }) {
  const [type, setType] = useState("COMPETITION");

  return (
    <Card className="mb-5">
      <CardContent className="p-4">
        <form action={demo ? undefined : createPlanningEvent} className="grid gap-3 lg:grid-cols-[160px_1.2fr_190px_160px_1fr_auto]">
          <Field label="Type">
            <select name="type" value={type} onChange={(event) => setType(event.target.value)} disabled={demo} className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm font-semibold focus:outline-none focus:shadow-[var(--focus-ring)]">
              <option value="COMPETITION">Compétition</option>
              <option value="CAMP">Camp</option>
              <option value="TRAINING_SCHEDULE">Horaire entraînement</option>
            </select>
          </Field>
          <Field label="Titre"><Input name="title" placeholder="Ex: Camp technique" disabled={demo} required /></Field>
          <Field label="Date et heure"><Input name="startsAt" type="datetime-local" disabled={demo} required /></Field>
          {type === "COMPETITION" && <Field label="Fin (compétition)"><Input name="endsAt" type="datetime-local" disabled={demo} required /></Field>}
          <Field label="Durée"><Input name="duration" type="number" min="1" placeholder="minutes" disabled={demo} /></Field>
          <Field label="Répétition">
            <select name="recurrence" disabled={demo} defaultValue="NONE" className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm font-semibold focus:outline-none focus:shadow-[var(--focus-ring)]">
              <option value="NONE">Une seule fois</option>
              <option value="WEEKLY">Chaque semaine</option>
            </select>
          </Field>
          <Field label="Jusqu&apos;au (si répétition)"><Input name="recurrenceUntil" type="date" disabled={demo} /></Field>
          <Field label="Association">
            <select name="target" disabled={demo} className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm font-semibold focus:outline-none focus:shadow-[var(--focus-ring)]">
              <option value="club">Club complet</option>
              {targets.map((target) => <option key={`${target.kind}:${target.id}`} value={`${target.kind}:${target.id}`}>{target.kind === "group" ? "Groupe" : "Athlète"} · {target.label}</option>)}
            </select>
          </Field>
          <div className="flex items-end"><Button type="submit" variant="action" disabled={demo} className="w-full lg:w-auto"><CalendarPlus className="h-4 w-4" /> Ajouter</Button></div>
          <Field label="Lieu" className="lg:col-span-2"><Input name="location" placeholder="Piscine, ville, bassin..." disabled={demo} /></Field>
          <Field label="Notes" className="lg:col-span-4"><Textarea name="notes" placeholder="Détails utiles pour le coach" disabled={demo} className="min-h-11" /></Field>
        </form>
        {demo && <p className="mt-3 text-sm font-semibold text-[var(--color-ink-muted)]">Les événements sont visibles en démo, mais l&apos;ajout est disponible avec un club connecté à la base de données.</p>}
      </CardContent>
    </Card>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={`block min-w-0 text-xs font-black uppercase text-[var(--color-ink-muted)] ${className ?? ""}`}><span className="mb-1 block">{label}</span>{children}</label>;
}
