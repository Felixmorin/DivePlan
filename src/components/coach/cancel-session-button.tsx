"use client";

import type { FormEvent } from "react";
import { XCircle } from "lucide-react";
import { cancelTrainingSession } from "@/app/coach/sessions/actions";
import { Button } from "@/components/ui/button";

export function CancelSessionButton({ sessionId, compact = false }: { sessionId: string; compact?: boolean }) {
  function confirmCancellation(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm("Annuler cet entraînement publié ? Les athlètes assignés recevront une notification.")) event.preventDefault();
  }

  return (
    <form action={cancelTrainingSession} onSubmit={confirmCancellation}>
      <input type="hidden" name="sessionId" value={sessionId} />
      <Button type="submit" variant="outline" size={compact ? "icon" : "default"} className={compact ? "h-9 min-h-9 w-9" : undefined} aria-label={compact ? "Annuler l’entraînement" : undefined}>
        <XCircle className="h-4 w-4" />{compact ? null : " Annuler l’entraînement"}
      </Button>
    </form>
  );
}
