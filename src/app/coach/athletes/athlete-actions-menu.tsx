"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { deleteAthlete, updateAthleteProfile } from "@/app/coach/athletes/actions";

type GroupOption = { id: string; name: string };

export function AthleteActionsMenu({ athlete, groups, demo = false, directEdit = false }: {
  athlete: { id: string; firstName: string; lastName: string; level: string; groupId?: string | null; birthDate?: string | null; active: boolean };
  groups: GroupOption[];
  demo?: boolean;
  directEdit?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteForm = useRef<HTMLFormElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ top?: number; bottom?: number; right: number }>({ top: 0, right: 0 });

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: PointerEvent) {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function toggleMenu() {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const opensUp = window.innerHeight - rect.bottom < 112;
      setMenuPosition({
        top: opensUp ? undefined : rect.bottom + 4,
        bottom: opensUp ? window.innerHeight - rect.top + 4 : undefined,
        right: Math.max(8, window.innerWidth - rect.right)
      });
    }
    setOpen(true);
  }

  return (
    <div className="relative inline-flex items-center justify-end gap-1">
      {directEdit && <button type="button" disabled={demo} onClick={() => setEditing(true)} className="flex h-9 items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 text-xs font-bold text-[var(--color-ink)] hover:bg-[var(--color-surface-raised)] disabled:opacity-40"><Pencil className="h-3.5 w-3.5"/> Modifier le profil</button>}
      <button ref={triggerRef} type="button" aria-label={`Actions pour ${athlete.firstName} ${athlete.lastName}`} aria-expanded={open} onClick={toggleMenu} disabled={demo} className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-ink)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:opacity-40"><MoreVertical className="h-5 w-5" /></button>
      {open && createPortal(<div ref={menuRef} style={{ position: "fixed", top: menuPosition.top, bottom: menuPosition.bottom, right: menuPosition.right }} className="z-[110] min-w-48 rounded-xl border border-[var(--color-border)] bg-white p-1.5 shadow-xl">
        <button type="button" onClick={() => { setEditing(true); setOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-raised)]"><Pencil className="h-4 w-4" />Modifier le profil</button>
        <button type="button" onClick={() => { setConfirmDelete(true); setOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-[var(--color-danger)] hover:bg-red-50"><Trash2 className="h-4 w-4" />Supprimer</button>
      </div>, document.body)}

      {editing && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(false); }}>
        <section role="dialog" aria-modal="true" aria-labelledby={`edit-athlete-title-${athlete.id}`} className="w-full max-w-lg rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-2xl">
          <h2 id={`edit-athlete-title-${athlete.id}`} className="text-lg font-black">Modifier le profil</h2>
          <form action={updateAthleteProfile} onSubmit={() => setEditing(false)} className="mt-4 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="athleteId" value={athlete.id} />
            <label className="grid gap-1 text-sm font-semibold">Prénom<input name="firstName" defaultValue={athlete.firstName} required maxLength={50} className="h-10 rounded-lg border border-[var(--color-border)] px-3" /></label>
            <label className="grid gap-1 text-sm font-semibold">Nom<input name="lastName" defaultValue={athlete.lastName} required maxLength={50} className="h-10 rounded-lg border border-[var(--color-border)] px-3" /></label>
            <label className="grid gap-1 text-sm font-semibold">Niveau<input name="level" defaultValue={athlete.level} required maxLength={50} className="h-10 rounded-lg border border-[var(--color-border)] px-3" /></label>
            <label className="grid gap-1 text-sm font-semibold">Groupe<select name="groupId" defaultValue={athlete.groupId ?? ""} className="h-10 rounded-lg border border-[var(--color-border)] bg-white px-3"><option value="">Aucun groupe</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-semibold">Date de naissance<input name="birthDate" type="date" defaultValue={athlete.birthDate ?? ""} className="h-10 rounded-lg border border-[var(--color-border)] px-3" /></label>
            <label className="grid gap-1 text-sm font-semibold">Statut<select name="active" defaultValue={athlete.active ? "true" : "false"} className="h-10 rounded-lg border border-[var(--color-border)] bg-white px-3"><option value="true">Actif</option><option value="false">Inactif</option></select></label>
            <div className="col-span-full mt-2 flex justify-end gap-2"><button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-bold">Annuler</button><button type="submit" className="rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-bold text-white">Enregistrer</button></div>
          </form>
        </section>
      </div>}

      {confirmDelete && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmDelete(false); }}>
        <section role="alertdialog" aria-modal="true" aria-labelledby={`delete-athlete-title-${athlete.id}`} className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-2xl">
          <h2 id={`delete-athlete-title-${athlete.id}`} className="text-lg font-black">Confirmer la suppression</h2>
          <p className="mt-2 text-sm text-[var(--color-ink-muted)]">Supprimer le profil de {athlete.firstName} {athlete.lastName} et ses données associées ? Cette action est définitive.</p>
          <form ref={deleteForm} action={deleteAthlete}><input type="hidden" name="athleteId" value={athlete.id} /></form>
          <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setConfirmDelete(false)} className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-bold">Annuler</button><button type="button" onClick={() => deleteForm.current?.requestSubmit()} className="rounded-lg bg-[var(--color-danger)] px-4 py-2 text-sm font-bold text-white">Supprimer</button></div>
        </section>
      </div>}
    </div>
  );
}
