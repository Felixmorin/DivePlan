"use client";

import { useActionState } from "react";
import { Copy, Send } from "lucide-react";
import { createInvitation, type InviteState } from "@/app/coach/invitations/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type InvitationFormProps = {
  groups: Array<{ id: string; name: string }>;
};

const initialState: InviteState = {};

export function InvitationForm({ groups }: InvitationFormProps) {
  const [state, action, pending] = useActionState(createInvitation, initialState);

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Input name="firstName" placeholder="Prenom" required />
        <Input name="lastName" placeholder="Nom" required />
      </div>
      <Input name="email" type="email" placeholder="email@club.ca" required />
      <div className="grid gap-3 md:grid-cols-2">
        <select name="role" className="min-h-11 rounded-[var(--radius-ui)] border border-[var(--color-border)] bg-white px-3 text-sm font-semibold text-[var(--color-ink)] outline-none transition duration-[var(--duration-fast)] focus-visible:shadow-[var(--focus-ring)]">
          <option value="ATHLETE">Athlete</option>
          <option value="COACH">Coach</option>
        </select>
        <select name="groupId" className="min-h-11 rounded-[var(--radius-ui)] border border-[var(--color-border)] bg-white px-3 text-sm font-semibold text-[var(--color-ink)] outline-none transition duration-[var(--duration-fast)] focus-visible:shadow-[var(--focus-ring)]">
          <option value="">Aucun groupe</option>
          {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select>
      </div>
      {state.error && <Alert variant="destructive" title="Invitation impossible">{state.error}</Alert>}
      <Button disabled={pending} type="submit" variant="action"><Send className="h-4 w-4" /> {pending ? "Creation..." : "Creer l'invitation"}</Button>
      {state.inviteLink && (
        <Alert variant="success" title="Lien pret">
          <div className="break-all font-semibold text-[var(--color-ink)]">{state.inviteLink}</div>
          <Button className="mt-3" type="button" variant="outline" onClick={() => navigator.clipboard.writeText(state.inviteLink ?? "")}><Copy className="h-4 w-4" /> Copier</Button>
        </Alert>
      )}
    </form>
  );
}
