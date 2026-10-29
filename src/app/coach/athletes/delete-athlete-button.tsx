"use client";

import { deleteAthlete } from "@/app/coach/athletes/actions";
import { Trash2 } from "lucide-react";
import { ConfirmFormButton } from "@/components/ui/confirm-form-button";

export function DeleteAthleteButton({ athleteId, demo, compact = false }: { athleteId: string; demo: boolean; compact?: boolean }) {
  return <ConfirmFormButton action={deleteAthlete} fields={{ athleteId }} label={<><Trash2 className="h-4 w-4" />Supprimer</>} title="Supprimer cet athlète ?" description="Son compte et toutes ses données associées seront supprimés définitivement." confirmLabel="Supprimer l’athlète" danger disabled={demo} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] px-4 text-sm font-semibold text-[var(--color-danger)] hover:border-[var(--color-danger)] disabled:pointer-events-none disabled:opacity-50 ${compact ? "min-h-9 px-3 text-xs" : ""}`} />;
}
