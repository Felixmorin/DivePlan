"use client";

import { useState, useTransition } from "react";
import { Check, Pencil, X } from "lucide-react";
import { updateAthleteProfileField } from "@/app/athlete/profile/actions";

type ProfileFormProps = {
  firstName: string;
  lastName: string;
  username: string | null;
};

const fields = [
  { key: "firstName", label: "Prénom", required: true },
  { key: "lastName", label: "Nom", required: true },
  { key: "username", label: "Nom d’utilisateur", required: false }
] as const;

export function ProfileForm({ firstName, lastName, username }: ProfileFormProps) {
  const values = { firstName, lastName, username: username ?? "" };
  const [editing, setEditing] = useState<keyof typeof values | null>(null);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function beginEdit(field: keyof typeof values) {
    setDraft(values[field]);
    setMessage("");
    setEditing(field);
  }

  function save(field: keyof typeof values) {
    setMessage("");
    startTransition(async () => {
      const result = await updateAthleteProfileField(field, draft);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setEditing(null);
      setMessage("Modifications enregistrées.");
    });
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-[#0b1e30] p-4" aria-labelledby="athlete-profile-settings-title">
      <h3 id="athlete-profile-settings-title" className="text-lg font-black text-white">Modifier mon profil</h3>
      <div className="mt-2 divide-y divide-white/10">
        {fields.map(({ key, label, required }) => (
          <div key={key} className="py-3 first:pt-2 last:pb-1">
            {editing === key ? (
              <div>
                <label htmlFor={`profile-${key}`} className="block text-sm font-bold text-white/65">{label}</label>
                <div className="mt-1.5 flex gap-2">
                  <input
                    id={`profile-${key}`}
                    autoFocus
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); save(key); } }}
                    required={required}
                    minLength={key === "username" ? 3 : undefined}
                    maxLength={key === "username" ? 30 : 50}
                    pattern={key === "username" ? "[A-Za-z0-9._-]+" : undefined}
                    autoComplete={key === "username" ? "username" : "off"}
                    className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/15 bg-white/[0.06] px-3 text-base text-white outline-none focus:border-cyan-300/60 focus:shadow-[var(--focus-ring)]"
                  />
                  <button type="button" onClick={() => save(key)} disabled={isPending} aria-label={`Enregistrer ${label.toLowerCase()}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-club-red)] text-white disabled:opacity-50"><Check className="h-5 w-5" /></button>
                  <button type="button" onClick={() => { setEditing(null); setMessage(""); }} disabled={isPending} aria-label="Annuler" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 text-white/70 disabled:opacity-50"><X className="h-5 w-5" /></button>
                </div>
              </div>
            ) : (
              <div className="flex min-h-10 items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-white/50">{label}</p>
                  <p className="truncate text-base font-bold text-white">{values[key] || <span className="font-medium text-white/40">À définir</span>}</p>
                </div>
                <button type="button" onClick={() => beginEdit(key)} aria-label={`Modifier ${label.toLowerCase()}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white/60 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"><Pencil className="h-4 w-4" /></button>
              </div>
            )}
          </div>
        ))}
      </div>
      {message && <p role="status" className={`mt-3 text-sm ${message.startsWith("Modifications") ? "text-emerald-300" : "text-rose-300"}`}>{message}</p>}
      <p className="mt-3 text-xs text-white/45">Le nom d’utilisateur sert à te connecter à DivePlan.</p>
    </section>
  );
}
