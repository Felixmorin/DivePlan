"use client";

import Link from "@/components/ui/app-link";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function CoachError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[55vh] max-w-xl flex-col items-start justify-center px-5 py-12" role="alert">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700"><AlertTriangle className="h-6 w-6"/></span>
      <h1 className="mt-5 text-2xl font-black text-[var(--color-navy)]">L’accueil n’a pas pu se charger</h1>
      <p className="mt-2 text-sm leading-6 text-[var(--color-ink-muted)]">Les données du tableau de bord sont momentanément indisponibles. Réessaie ou consulte une autre section.</p>
      <div className="mt-5 flex flex-wrap gap-3"><button type="button" onClick={() => reset()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0969ef] px-4 text-sm font-bold text-white"><RefreshCw className="h-4 w-4"/> Réessayer</button><Link href="/coach/planning" className="inline-flex min-h-11 items-center rounded-xl border border-[var(--color-border)] bg-white px-4 text-sm font-bold">Ouvrir le calendrier</Link></div>
    </main>
  );
}
