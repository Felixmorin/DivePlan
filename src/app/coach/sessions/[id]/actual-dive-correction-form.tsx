"use client";

import { useActionState } from "react";
import { updateActualSessionDive } from "@/app/coach/sessions/actions";
import { Button } from "@/components/ui/button";

export function ActualDiveCorrectionForm({
  sessionId,
  poolDiveId,
  athleteId,
  firstName,
  diveCode,
  repetitions
}: {
  sessionId: string;
  poolDiveId: string;
  athleteId: string;
  firstName: string;
  diveCode: string;
  repetitions: number;
}) {
  const [state, action, pending] = useActionState(updateActualSessionDive, { success: false });

  return (
    <form action={action} className="mt-3 flex flex-wrap items-end gap-2 border-t border-[var(--color-border)] pt-3">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="poolDiveId" value={poolDiveId} />
      <input type="hidden" name="athleteId" value={athleteId} />
      <input type="hidden" name="mode" value="actual" />
      <span className="mr-2 text-sm font-bold">{firstName} · Réalisé</span>
      <label className="grid gap-1 text-xs font-bold">
        Plongeon effectué
        <input name="diveCode" defaultValue={diveCode} maxLength={8} required className="h-10 w-28 rounded-lg border border-[var(--color-border)] px-2" />
      </label>
      <label className="grid gap-1 text-xs font-bold">
        Répétitions effectuées
        <input name="repetitions" type="number" min="0" max="500" defaultValue={repetitions} required className="h-10 w-24 rounded-lg border border-[var(--color-border)] px-2" />
      </label>
      <Button size="sm" variant="outline" disabled={pending}>
        {pending ? "Enregistrement…" : "Corriger le réalisé"}
      </Button>
      {state.success && <span role="status" className="text-sm font-semibold text-[var(--color-success)]">Le changement a bien été fait.</span>}
    </form>
  );
}
