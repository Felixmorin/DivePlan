import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="aquatic-grid flex min-h-screen items-center justify-center overflow-x-hidden bg-[var(--color-coach-bg)] px-4">
      <div className="w-full max-w-md rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-white p-6 shadow-[var(--shadow-card)]">
        <h1 className="text-2xl font-black text-[var(--color-ink)]">Page introuvable</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--color-ink-muted)]">La ressource demandée n&apos;existe pas ou n&apos;est plus disponible.</p>
        <Button asChild className="mt-4" variant="action"><Link href="/coach">Retour au dashboard</Link></Button>
      </div>
    </main>
  );
}
