"use client";

import { useRef, useState } from "react";
import { deleteAthlete } from "@/app/coach/athletes/actions";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

export function DeleteAthleteButton({ athleteId, demo, compact = false }: { athleteId: string; demo: boolean; compact?: boolean }) {
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={demo ? undefined : deleteAthlete}>
      <input type="hidden" name="athleteId" value={athleteId} />
      <Button type="button" variant="outline" size={compact ? "sm" : "default"} disabled={demo} onClick={() => setIsConfirmationOpen(true)} className="text-[var(--color-danger)] hover:border-[var(--color-danger)]">
        <Trash2 className="h-4 w-4" /> Supprimer
      </Button>
      {isConfirmationOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsConfirmationOpen(false); }}>
          <section role="alertdialog" aria-modal="true" aria-labelledby="delete-athlete-title" aria-describedby="delete-athlete-description" className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-2xl">
            <h2 id="delete-athlete-title" className="text-lg font-black">Confirmer la suppression</h2>
            <p id="delete-athlete-description" className="mt-2 text-sm text-[var(--color-ink-muted)]">Supprimer cet athlète et toutes ses données associées ? Cette action est définitive.</p>
            <div className="mt-6 flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setIsConfirmationOpen(false)}>Annuler</Button>
              <Button type="button" variant="outline" className="border-[var(--color-danger)] bg-[var(--color-danger)] text-white hover:bg-[var(--color-danger)]" onClick={() => formRef.current?.requestSubmit()}>Supprimer</Button>
            </div>
          </section>
        </div>
      )}
    </form>
  );
}
