"use client";

import { useEffect, useRef, useState } from "react";
import { createCoachAccount } from "@/app/admin/actions";
import { Send, UserRoundPlus, X } from "lucide-react";

type Club = { id: string; name: string };

export function CoachInviteDialog({ clubs, returnTo, label = "Inviter un coach" }: { clubs: Club[]; returnTo: "coaches" | "users"; label?: string }) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return <>
    <button type="button" onClick={() => setOpen(true)} disabled={!clubs.length} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"><UserRoundPlus className="h-4 w-4" />{label}</button>
    {!clubs.length && <p className="mt-1 text-xs text-amber-800">Créez un club avant d’ajouter un coach.</p>}
    <dialog
      ref={dialogRef}
      aria-labelledby="coach-invite-title"
      onClose={() => setOpen(false)}
      onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[min(40rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/55"
    >
      <div className="flex items-start gap-3 border-b border-slate-100 p-5 sm:p-6">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-700"><Send className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1"><h2 id="coach-invite-title" className="text-xl font-black">Inviter un coach</h2><p className="mt-1 text-sm leading-5 text-slate-500">Créez son compte DivePlan et associez-le à un club.</p></div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Fermer la fenêtre" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"><X className="h-5 w-5" /></button>
      </div>

      <form action={createCoachAccount} onSubmit={() => setOpen(false)} className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
        <input type="hidden" name="returnTo" value={returnTo} />
        <label className="grid gap-1.5 text-sm font-bold">Prénom <span className="sr-only">requis</span><input name="firstName" required maxLength={80} autoComplete="given-name" placeholder="Ex. Félix" className="h-11 rounded-lg border border-slate-200 px-3 font-normal outline-none placeholder:text-slate-400 focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100" /></label>
        <label className="grid gap-1.5 text-sm font-bold">Nom<input name="lastName" required maxLength={80} autoComplete="family-name" placeholder="Ex. Morin" className="h-11 rounded-lg border border-slate-200 px-3 font-normal outline-none placeholder:text-slate-400 focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100" /></label>
        <label className="grid gap-1.5 text-sm font-bold">Courriel<input type="email" name="email" required maxLength={254} autoComplete="email" placeholder="Ex. felix.morin@club.ca" className="h-11 rounded-lg border border-slate-200 px-3 font-normal outline-none placeholder:text-slate-400 focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100" /></label>
        <label className="grid gap-1.5 text-sm font-bold">Club<select name="clubId" required defaultValue="" className="h-11 rounded-lg border border-slate-200 bg-white px-3 font-normal outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"><option value="" disabled>Choisir un club</option>{clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}</select></label>
        <label className="grid gap-1.5 text-sm font-bold sm:col-span-2">Mot de passe temporaire<input name="temporaryPassword" type="password" autoComplete="new-password" minLength={10} maxLength={128} required placeholder="10 caractères minimum" className="h-11 rounded-lg border border-slate-200 px-3 font-normal outline-none placeholder:text-slate-400 focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100" /><span className="text-xs font-normal leading-5 text-slate-500">Le coach devra choisir un nouveau mot de passe à sa première connexion.</span></label>
        <div className="-mx-5 -mb-5 mt-1 flex flex-col-reverse justify-end gap-2 border-t border-slate-100 bg-slate-50/70 p-4 sm:col-span-2 sm:-mx-6 sm:-mb-6 sm:flex-row sm:px-6">
          <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">Annuler</button>
          <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-bold text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"><Send className="h-4 w-4" />Créer l’accès coach</button>
        </div>
      </form>
    </dialog>
  </>;
}
