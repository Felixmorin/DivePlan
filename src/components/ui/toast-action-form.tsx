"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast-provider";

type FormAction = (formData: FormData) => void | Promise<void>;
export function ToastActionForm({ action, successMessage, className, children }: { action: FormAction; successMessage: string; className?: string; children: ReactNode }) {
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { notify } = useToast();
  async function submit(formData: FormData) {
    if (pending) return;
    setPending(true);
    try {
      await action(formData);
      notify(successMessage);
      router.refresh();
    } catch {
      notify("L’action n’a pas abouti. Réessayez.", "error");
    } finally {
      setPending(false);
    }
  }
  return <form action={submit} className={className} aria-busy={pending}>{children}</form>;
}
