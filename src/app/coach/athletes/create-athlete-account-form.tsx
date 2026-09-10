"use client";

import { useActionState, useState } from "react";
import { Check, Clipboard, KeyRound, UserPlus } from "lucide-react";
import { createAthleteAccount, type CreateAthleteAccountState } from "@/app/coach/athletes/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: CreateAthleteAccountState = {};

export function CreateAthleteAccountForm({ groups, disabled = false }: { groups: Array<{ id: string; name: string }>; disabled?: boolean }) {
  const [state, action, pending] = useActionState(createAthleteAccount, initialState);
  const [copied, setCopied] = useState(false);
  const credentials = state.credentials;

  async function copyCredentials() {
    if (!credentials) return;

    await navigator.clipboard.writeText(`Nom d'utilisateur: ${credentials.username}\nMot de passe temporaire: ${credentials.temporaryPassword}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      {credentials && (
        <Alert variant="success" title={`Compte de ${credentials.athleteName} créé`}>
          <p>Transmets ces identifiants à l’athlète. Le mot de passe ne sera plus affiché après avoir quitté cette page.</p>
          <dl className="mt-3 grid gap-2 rounded-xl bg-white/70 p-3 font-mono text-sm text-[var(--color-ink)] sm:grid-cols-[auto_1fr]">
            <dt className="font-sans font-bold">Nom d’utilisateur</dt><dd className="break-all">{credentials.username}</dd>
            <dt className="font-sans font-bold">Mot de passe</dt><dd className="break-all">{credentials.temporaryPassword}</dd>
          </dl>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={copyCredentials}>
            {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
            {copied ? "Copié" : "Copier les identifiants"}
          </Button>
        </Alert>
      )}

      <form action={action} className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Input name="firstName" placeholder="Prénom" disabled={disabled} required />
        <Input name="lastName" placeholder="Nom" disabled={disabled} required />
        <Input name="username" placeholder="Nom d'utilisateur (ex. emma.roy)" autoComplete="off" disabled={disabled} required minLength={3} maxLength={30} pattern="[A-Za-z0-9._-]+" />
        <Input name="temporaryPassword" type="text" placeholder="Mot de passe temporaire (généré si vide)" autoComplete="off" disabled={disabled} minLength={10} />
        <Input name="level" placeholder="Niveau" disabled={disabled} required />
        <Input name="birthDate" type="date" aria-label="Date de naissance" disabled={disabled} />
        <select name="groupId" disabled={disabled} className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm font-semibold text-[var(--color-ink)] outline-none transition duration-[var(--duration-fast)] focus-visible:shadow-[var(--focus-ring)]">
          <option value="">Aucun groupe</option>
          {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select>
        <Button type="submit" variant="action" disabled={disabled || pending} className="xl:col-span-2">
          {pending ? <KeyRound className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
          {pending ? "Création..." : "Créer le compte athlète"}
        </Button>
      </form>

      {state.error && <Alert variant="destructive">{state.error}</Alert>}
      {disabled && <p className="text-sm font-semibold text-[var(--color-ink-muted)]">Disponible avec un club connecté à la base de données.</p>}
    </div>
  );
}
