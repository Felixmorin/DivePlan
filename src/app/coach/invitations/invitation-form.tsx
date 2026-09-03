"use client";

import { useActionState } from "react";
import { Copy, Link2 } from "lucide-react";
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
      <Button disabled={pending} type="submit" variant="action"><Link2 className="h-4 w-4" /> {pending ? "Creation..." : "Creer le lien"}</Button>
      {state.inviteLink && (
        <Alert variant="success" title="Lien pret">
          <p className="mb-2">Partage ce lien avec la personne invitee. Il ouvre la page d&apos;activation et permet de choisir un mot de passe.</p>
          <a href={state.inviteLink} className="block break-all rounded-xl bg-white/70 p-3 font-semibold text-[var(--color-ink)] underline-offset-4 hover:underline">{state.inviteLink}</a>
          <Button className="mt-3" type="button" variant="outline" onClick={() => navigator.clipboard.writeText(state.inviteLink ?? "")}><Copy className="h-4 w-4" /> Copier le lien d&apos;activation</Button>
        </Alert>
      )}
    </form>
  );
}
