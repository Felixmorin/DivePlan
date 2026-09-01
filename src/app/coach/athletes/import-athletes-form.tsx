"use client";

import { useActionState } from "react";
import { Upload } from "lucide-react";
import { importAthletesCsv, type ImportAthletesState } from "@/app/coach/athletes/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const initialState: ImportAthletesState = {};

export function ImportAthletesForm() {
  const [state, action, pending] = useActionState(importAthletesCsv, initialState);

  return (
    <form action={action} className="space-y-4">
      <Textarea
        name="csv"
        className="min-h-40 font-mono text-sm"
        placeholder={'firstName,lastName,email,level,group\nEmma,Tremblay,emma@club.ca,Niveau 4,Provincial'}
      />
      <div className="rounded-[var(--radius-ui)] bg-[var(--color-surface-raised)] p-3 text-sm leading-6 text-[var(--color-ink-muted)]">
        Les lignes incompletes sont ignorees. Si un groupe n&apos;existe pas, il est cree dans le club courant.
      </div>
      {state.error && <Alert variant="destructive" title="Import impossible">{state.error}</Alert>}
      {typeof state.imported === "number" && (
        <Alert variant="success" title="Import termine">
          {state.imported} importes, {state.updated ?? 0} mis a jour. Tu peux maintenant les assigner aux blocs.
        </Alert>
      )}
      <Button type="submit" disabled={pending} variant="action"><Upload className="h-4 w-4" /> {pending ? "Import en cours..." : "Importer CSV"}</Button>
    </form>
  );
}
