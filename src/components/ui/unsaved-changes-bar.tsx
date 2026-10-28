"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";

function formHasChanges(form: HTMLFormElement) {
  return Array.from(form.elements).some((element) => {
    if (element instanceof HTMLInputElement) {
      if (["submit", "button", "reset", "image"].includes(element.type)) return false;
      return element.type === "checkbox" || element.type === "radio" ? element.checked !== element.defaultChecked : element.value !== element.defaultValue;
    }
    if (element instanceof HTMLTextAreaElement) return element.value !== element.defaultValue;
    if (element instanceof HTMLSelectElement) return Array.from(element.options).some((option) => option.selected !== option.defaultSelected);
    return false;
  });
}

export function UnsavedChangesBar({ formIds, resetKey }: { formIds: string[]; resetKey: string }) {
  const [activeFormId, setActiveFormId] = useState<string | null>(null);

  useEffect(() => {
    const forms = formIds.map((id) => document.getElementById(id)).filter((element): element is HTMLFormElement => element instanceof HTMLFormElement);
    const update = (event?: Event) => {
      const eventForm = event?.target instanceof HTMLFormElement ? event.target : event?.target instanceof HTMLElement ? event.target.closest("form") : null;
      const dirtyForms = forms.filter((form) => formHasChanges(form));
      const lastChanged = eventForm && dirtyForms.includes(eventForm) ? eventForm : dirtyForms.at(-1);
      setActiveFormId(lastChanged?.id ?? null);
    };
    const onReset = (event: Event) => queueMicrotask(() => update(event));
    for (const form of forms) {
      form.addEventListener("input", update);
      form.addEventListener("change", update);
      form.addEventListener("reset", onReset);
    }
    update();
    return () => {
      for (const form of forms) {
        form.removeEventListener("input", update);
        form.removeEventListener("change", update);
        form.removeEventListener("reset", onReset);
      }
    };
  }, [formIds, resetKey]);

  if (!activeFormId) return null;
  return <div role="status" className="fixed inset-x-3 bottom-3 z-30 mx-auto flex max-w-[1570px] flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f4d8a2] bg-[#fffaf0]/95 px-4 py-2.5 shadow-[0_8px_28px_rgba(80,55,8,.12)] backdrop-blur sm:inset-x-[calc(17rem+1.5rem)]">
    <div><p className="text-[13px] font-extrabold text-[#8b5c00]">Modifications non enregistrées</p><p className="text-[11px] text-[#61718e]">Enregistrez vos changements avant de quitter cette page.</p></div>
    <button type="submit" form={activeFormId} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#ff604c] px-5 text-[13px] font-extrabold text-white shadow-sm hover:bg-[#e64f3d]"><Save className="h-4 w-4" /> Enregistrer les modifications</button>
  </div>;
}
