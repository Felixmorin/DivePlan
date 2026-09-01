"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { acceptInvitation, type AcceptInviteState } from "@/app/invite/[token]/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: AcceptInviteState = {};

export function AcceptInviteForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(acceptInvitation, initialState);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <Input name="password" type="password" placeholder="Mot de passe" required minLength={10} />
      <Input name="confirmPassword" type="password" placeholder="Confirmer le mot de passe" required minLength={10} />
      {state.error && <p className="text-sm font-semibold text-red-600">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        <CheckCircle2 className="h-4 w-4" />
        {pending ? "Activation..." : "Activer mon compte"}
      </Button>
    </form>
  );
}
