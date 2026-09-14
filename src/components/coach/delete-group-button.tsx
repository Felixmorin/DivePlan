"use client";

import { Trash2 } from "lucide-react";
import { deleteTrainingGroup } from "@/app/coach/groups/actions";
import { Button } from "@/components/ui/button";

export function DeleteGroupButton({ groupId, groupName, disabled = false }: { groupId: string; groupName: string; disabled?: boolean }) {
  return (
    <form action={deleteTrainingGroup} onSubmit={(event) => {
      if (!window.confirm(`Supprimer le groupe « ${groupName} » ? Les athlètes seront retirés de ce groupe.`)) event.preventDefault();
    }}>
      <input type="hidden" name="groupId" value={groupId} />
      <Button type="submit" variant="outline" size="sm" disabled={disabled} title={disabled ? "Ce groupe contient des séances planifiées" : "Supprimer le groupe"} className="text-[var(--color-danger)] hover:border-[var(--color-danger)]">
        <Trash2 className="h-4 w-4" /> Supprimer
      </Button>
    </form>
  );
}
