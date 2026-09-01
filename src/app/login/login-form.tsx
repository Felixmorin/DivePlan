"use client";

import { useActionState } from "react";
import { LogIn } from "lucide-react";
import { login, type LoginState } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(login, initialState);

  return (
    <form action={action} className="space-y-4">
      <Input name="email" type="email" placeholder="coach@diveplan.local" />
      <Input name="password" type="password" placeholder="Mot de passe" />
      <Input name="accessCode" type="password" placeholder="Code pilote temporaire" />
      {state.error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-[var(--color-danger)]">{state.error}</p>}
      <Button type="submit" variant="action" className="w-full" disabled={pending}>
        <LogIn className="h-4 w-4" />
        {pending ? "Connexion..." : "Entrer"}
      </Button>
    </form>
  );
}
