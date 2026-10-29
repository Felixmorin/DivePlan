"use client";

import { useState, useTransition } from "react";
import { Check, Copy, KeyRound, RotateCcw } from "lucide-react";
import { resetAthletePassword } from "@/app/coach/athletes/actions";

export function PasswordResetControl({ athleteId, athleteName, disabled = false }: { athleteId: string; athleteName: string; disabled?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [credentials, setCredentials] = useState<{ username: string; temporaryPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function resetPassword() {
    if (!window.confirm(`Réinitialiser le mot de passe de ${athleteName} ? L’ancien mot de passe cessera de fonctionner.`)) return;
    setError("");
    setCredentials(null);
    setCopied(false);
    startTransition(async () => {
      const result = await resetAthletePassword(athleteId);
      if (result.credentials) setCredentials(result.credentials);
      else setError(result.error ?? "La réinitialisation a échoué. Réessaie.");
    });
  }

  async function copyCredentials() {
    if (!credentials) return;
    try {
      await navigator.clipboard.writeText(`Nom d’utilisateur : ${credentials.username}\nMot de passe temporaire : ${credentials.temporaryPassword}`);
      setCopied(true);
    } catch {
      setError("La copie automatique n’est pas disponible. Tu peux sélectionner les identifiants et les copier.");
    }
  }

  return (
    <section className="w-full rounded-xl border border-amber-200 bg-amber-50 p-3 sm:w-auto">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={disabled || pending} onClick={resetPassword} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-amber-700 px-3 py-2 text-sm font-bold text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">
          {pending ? <RotateCcw className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          {pending ? "Réinitialisation…" : "Réinitialiser le mot de passe"}
        </button>
        <span className="text-xs text-amber-950/75">Un nouveau mot de passe temporaire sera généré.</span>
      </div>
      {error && <p className="mt-2 text-sm text-rose-800" role="alert">{error}</p>}
      {credentials && <div className="mt-3 rounded-lg border border-amber-300 bg-white p-3" role="status">
        <p className="flex items-center gap-2 text-sm font-bold text-amber-950"><Check className="h-4 w-4" /> Mot de passe réinitialisé pour {athleteName}</p>
        <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-3">
          <dt className="font-semibold text-slate-600">Nom d’utilisateur</dt><dd className="break-all font-mono">{credentials.username}</dd>
          <dt className="font-semibold text-slate-600">Mot de passe temporaire</dt><dd className="break-all font-mono font-bold">{credentials.temporaryPassword}</dd>
        </dl>
        <button type="button" onClick={copyCredentials} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "Copié" : "Copier les identifiants"}
        </button>
        <p className="mt-2 text-xs leading-5 text-slate-600">Remets ces identifiants à l’athlète par un canal privé. Il devra choisir un nouveau mot de passe à sa prochaine connexion. Cette valeur ne sera plus affichée après avoir quitté cette page.</p>
      </div>}
    </section>
  );
}
