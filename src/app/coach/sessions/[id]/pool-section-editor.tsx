"use client";

import { useActionState, useState } from "react";
import { Pencil, X } from "lucide-react";
import { updatePoolSectionLine } from "@/app/coach/sessions/actions";
import { Button } from "@/components/ui/button";
import { ActualDiveCorrectionForm } from "./actual-dive-correction-form";

type Dive = { id: string; diveCode: string; repetitions: number };
type ActualCorrection = { athleteId: string; firstName: string; diveId: string; diveCode: string; repetitions: number };

export function PoolSectionEditor({
  sessionId,
  sectionId,
  context,
  dives,
  actualCorrections,
  canEditPlan
}: {
  sessionId: string;
  sectionId: string;
  context: string;
  dives: Dive[];
  actualCorrections: ActualCorrection[];
  canEditPlan: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(updatePoolSectionLine, { success: false });

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`Modifier la ligne piscine ${context}`} title="Modifier cette ligne piscine" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-ink-muted)] transition hover:border-[var(--color-brand-strong)] hover:text-[var(--color-brand-strong)]">
        <Pencil className="h-4 w-4" />
      </button>
      {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
        <section role="dialog" aria-modal="true" aria-labelledby={`pool-editor-title-${sectionId}`} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-[var(--color-brand-strong)]">Ligne piscine</p>
              <h2 id={`pool-editor-title-${sectionId}`} className="mt-1 text-xl font-black">Modifier {context}</h2>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fermer" className="rounded-lg p-2 text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-raised)]"><X className="h-5 w-5" /></button>
          </div>

          {canEditPlan ? <form action={action} className="mt-5 space-y-4">
            <input type="hidden" name="sessionId" value={sessionId} />
            <input type="hidden" name="sectionId" value={sectionId} />
            <div>
              <h3 className="text-sm font-black">Plongeons de la ligne</h3>
              <p className="mt-1 text-xs text-[var(--color-ink-muted)]">Ajuste la hauteur, le code et les répétitions de chaque plongeon.</p>
            </div>
            <div className="space-y-3">
              {dives.map((dive, index) => <div key={dive.id} className="grid gap-3 rounded-xl bg-[var(--color-surface-raised)] p-3 sm:grid-cols-[1fr_1fr_130px]">
                <label className="text-sm font-bold">Hauteur ou contexte
                  <input name="diveContexts" defaultValue={context} required placeholder="1m, 3m, Plateforme…" className="mt-1 h-10 w-full rounded-lg border border-[var(--color-border)] bg-white px-3" />
                </label>
                <label className="text-sm font-bold">Plongeon {index + 1}
                  <input name="diveCodes" defaultValue={dive.diveCode} maxLength={8} required className="mt-1 h-10 w-full rounded-lg border border-[var(--color-border)] bg-white px-3" />
                </label>
                <label className="text-sm font-bold">Répétitions
                  <input name="repetitions" type="number" min="1" max="500" defaultValue={dive.repetitions} required className="mt-1 h-10 w-full rounded-lg border border-[var(--color-border)] bg-white px-3" />
                </label>
              </div>)}
            </div>
            <p className="text-xs text-[var(--color-ink-muted)]">Si les plongeons ont des hauteurs différentes, ils seront séparés en lignes automatiquement. Leur suivi reste associé à chaque plongeon.</p>
            <div className="flex flex-wrap items-center gap-3 border-t border-[var(--color-border)] pt-4">
              <Button type="submit" variant="action" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer les changements"}</Button>
              {state.success && <span role="status" className="text-sm font-semibold text-[var(--color-success)]">Le changement a bien été fait.</span>}
            </div>
          </form> : <p className="mt-5 rounded-xl bg-[var(--color-surface-raised)] p-3 text-sm text-[var(--color-ink-muted)]">Le plan est modifiable avant le démarrage ou pendant la séance.</p>}

          {actualCorrections.length > 0 && <div className="mt-6 border-t border-[var(--color-border)] pt-4">
            <h3 className="font-black">Corrections du réalisé</h3>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">Modifie le plongeon ou les répétitions enregistrées pour les athlètes ayant terminé la séance.</p>
            <div className="mt-2 divide-y divide-[var(--color-border)]">
              {actualCorrections.map((correction) => <ActualDiveCorrectionForm
                key={`${correction.athleteId}-${correction.diveId}`}
                sessionId={sessionId}
                poolDiveId={correction.diveId}
                athleteId={correction.athleteId}
                firstName={correction.firstName}
                diveCode={correction.diveCode}
                repetitions={correction.repetitions}
              />)}
            </div>
          </div>}
        </section>
      </div>}
    </>
  );
}
