"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";

type FormAction = (formData: FormData) => void | Promise<void>;
export function ConfirmFormButton({ action, fields, label, title, description, confirmLabel = "Confirmer", danger = false, disabled = false, className }: {
  action: FormAction; fields: Record<string, string>; label: ReactNode; title: string; description: string; confirmLabel?: string; danger?: boolean; disabled?: boolean; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const { notify } = useToast();
  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    cancelRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && !pendingRef.current) setOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => { window.removeEventListener("keydown", closeOnEscape); trigger?.focus(); };
  }, [open]);
  async function submit(formData: FormData) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    try {
      await action(formData);
      setOpen(false);
    } catch {
      notify("L’action a échoué. Réessayez.", "error");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }
  return <>
    <button ref={triggerRef} type="button" disabled={disabled} onClick={() => setOpen(true)} className={className}>{label}</button>
    <form action={submit}>
      {Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      {open && <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) setOpen(false); }}>
        <section role="alertdialog" aria-modal="true" aria-labelledby="confirm-form-title" aria-describedby="confirm-form-description" className="w-full max-w-md rounded-t-2xl border border-slate-200 bg-white p-5 shadow-2xl motion-safe:animate-[toast-in_180ms_ease-out] sm:rounded-2xl sm:p-6">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />
          <div className={`mx-auto grid h-11 w-11 place-items-center rounded-full ${danger ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-700"}`}><AlertTriangle className="h-5 w-5" /></div>
          <h2 id="confirm-form-title" className="mt-3 text-center text-lg font-black text-slate-950">{title}</h2>
          <p id="confirm-form-description" className="mx-auto mt-2 max-w-sm text-center text-sm leading-5 text-slate-600">{description}</p>
          <div className="mt-6 grid grid-cols-2 gap-2">
            <button ref={cancelRef} type="button" disabled={pending} onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:pointer-events-none disabled:opacity-50">Garder</button>
            <Button type="submit" disabled={pending} className={danger ? "bg-red-600 text-white hover:bg-red-700" : ""}>{pending ? "En cours…" : confirmLabel}</Button>
          </div>
        </section>
      </div>}
    </form>
  </>;
}
