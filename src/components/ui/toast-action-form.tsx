"use client";

import { useState, type ReactNode } from "react";
import { useToast } from "@/components/ui/toast-provider";

type FormAction = (formData: FormData) => void | Promise<void>;
// Actions must revalidate their affected page. Next.js then includes the
// updated UI in the action response; a second router.refresh repeats that work.
export function ToastActionForm({ action, successMessage, className, children }: { action: FormAction; successMessage: string; className?: string; children: ReactNode }) {
  const [pending, setPending] = useState(false);
  const { notify } = useToast();
  async function submit(formData: FormData) {
    if (pending) return;
    setPending(true);
    try {
      await action(formData);
      notify(successMessage);
    } catch {
      notify("L’action n’a pas abouti. Réessayez.", "error");
    } finally {
      setPending(false);
    }
  }
  return <form action={submit} className={className} aria-busy={pending}>{children}</form>;
}
