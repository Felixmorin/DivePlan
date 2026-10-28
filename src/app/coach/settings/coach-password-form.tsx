"use client";

import { useActionState, useEffect, useRef } from "react";
import { KeyRound, Save } from "lucide-react";
import { updateCoachPassword, type CoachPasswordState } from "@/app/coach/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: CoachPasswordState = {};
const fieldClass = "h-10 rounded-lg border-[#d5e1ee] bg-white px-3 text-[13px] font-medium text-[#0b1943] shadow-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

export function CoachPasswordForm() {
  const [state, action, pending] = useActionState(updateCoachPassword, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.success) formRef.current?.reset(); }, [state.success]);
  return <form ref={formRef} id="coach-password-form" action={action} className="mt-4 grid gap-3">
    <label className="grid gap-1 text-[12px] font-bold">Mot de passe actuel<Input className={fieldClass} name="currentPassword" type="password" autoComplete="current-password" required /></label>
    <label className="grid gap-1 text-[12px] font-bold">Nouveau mot de passe<Input className={fieldClass} name="password" type="password" autoComplete="new-password" minLength={10} maxLength={128} required /></label>
    <label className="grid gap-1 text-[12px] font-bold">Confirmer le nouveau mot de passe<Input className={fieldClass} name="confirmPassword" type="password" autoComplete="new-password" minLength={10} maxLength={128} required /></label>
    <p className="text-[11px] text-[#61718e]">10 caractères minimum, avec au moins une lettre et un chiffre.</p>
    {state.error && <p role="alert" className="rounded-lg bg-[#fff0f0] px-3 py-2 text-[12px] font-semibold text-[#b42318]">{state.error}</p>}
    {state.success && <p role="status" className="rounded-lg bg-[#e9fbf2] px-3 py-2 text-[12px] font-semibold text-[#07864e]">{state.success}</p>}
    <Button type="submit" variant="outline" disabled={pending} className="h-10 min-h-10 justify-self-start rounded-lg border-[#ff604c] px-4 text-[#e6382b] hover:bg-[#fff2f1]"><KeyRound className="h-4 w-4" />{pending ? "Enregistrement…" : <><Save className="h-4 w-4" /> Changer le mot de passe</>}</Button>
  </form>;
}
