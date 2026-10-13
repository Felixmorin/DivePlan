"use client";

import type { FormEvent } from "react";
import { X } from "lucide-react";
import { hideCancelledTrainingFromCalendars } from "@/app/coach/planning/actions";
import { Button } from "@/components/ui/button";

export function DismissCancelledTrainingButton({
  eventId,
  sessionId,
  compact = false
}: {
  eventId?: string;
  sessionId?: string;
  compact?: boolean;
}) {
  function confirmRemoval(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm("Retirer cet entraînement annulé de votre calendrier ? Il restera visible pour les athlètes.")) event.preventDefault();
  }

  return (
    <form action={hideCancelledTrainingFromCalendars} onSubmit={confirmRemoval}>
      {eventId && <input type="hidden" name="eventId" value={eventId} />}
      {sessionId && <input type="hidden" name="sessionId" value={sessionId} />}
      <Button
        type="submit"
        size="sm"
        variant="outline"
        aria-label="Retirer du calendrier"
        title="Retirer du calendrier"
        className={compact ? "h-7 w-7 p-0 text-[var(--color-danger)]" : "h-8 w-8 p-0 text-[var(--color-danger)]"}
      >
        <X className="h-4 w-4" />
      </Button>
    </form>
  );
}
