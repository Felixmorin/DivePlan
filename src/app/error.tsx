"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="aquatic-grid flex min-h-screen items-center justify-center overflow-x-hidden bg-[var(--color-coach-bg)] px-4">
      <div className="w-full max-w-md rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-white p-6 shadow-[var(--shadow-card)]">
        <h1 className="text-2xl font-black">Une erreur est survenue</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--color-ink-muted)]">L&apos;action n&apos;a pas pu être terminée. L&apos;erreur est visible dans les logs serveur.</p>
        <Button className="mt-4" onClick={reset} variant="action">Réessayer</Button>
      </div>
    </main>
  );
}
