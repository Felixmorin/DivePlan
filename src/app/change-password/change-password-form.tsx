"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { changeTemporaryPassword, type ChangePasswordState } from "@/app/change-password/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: ChangePasswordState = {};

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changeTemporaryPassword, initialState);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-bold text-[var(--color-ink)]">Nouveau mot de passe</label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} placeholder="Au moins 10 caractères" />
      </div>
      <div>
        <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-bold text-[var(--color-ink)]">Confirmer le mot de passe</label>
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required minLength={10} placeholder="Répète le nouveau mot de passe" />
      </div>
      <p className="text-xs leading-5 text-[var(--color-ink-muted)]">Utilise au moins 10 caractères, dont une lettre et un chiffre.</p>
      {state.error && <Alert variant="destructive">{state.error}</Alert>}
      <Button type="submit" variant="action" className="w-full" disabled={pending}>
        <KeyRound className="h-4 w-4" />
        {pending ? "Enregistrement..." : "Enregistrer mon mot de passe"}
      </Button>
    </form>
  );
}
