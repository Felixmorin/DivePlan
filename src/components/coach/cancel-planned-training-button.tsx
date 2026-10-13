"use client";

import type { FormEvent } from "react";
import { XCircle } from "lucide-react";
import { cancelFutureTrainingSchedule } from "@/app/coach/planning/actions";
import { Button } from "@/components/ui/button";

export function CancelPlannedTrainingButton({ eventId, compact = false }: { eventId: string; compact?: boolean }) {
  function confirmCancellation(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm("Annuler cet entraînement futur ? Il restera visible en rouge dans les plannings.")) event.preventDefault();
  }

  return (
    <form action={cancelFutureTrainingSchedule} onSubmit={confirmCancellation} className={compact ? undefined : "w-full"}>
      <input type="hidden" name="eventId" value={eventId} />
      <Button type="submit" size="sm" variant="outline" className={compact ? "min-h-7 px-2 text-[10px]" : "w-full justify-center border-[var(--color-danger)]/30 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/5"}>
        <XCircle className="h-3.5 w-3.5" /> Annuler l’entraînement
      </Button>
    </form>
  );
}
