"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";

export function RefreshDashboardButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return <button
    type="button"
    onClick={() => startTransition(() => router.refresh())}
    disabled={isPending}
    aria-label={isPending ? "Actualisation des données" : "Actualiser les données"}
    aria-busy={isPending}
    title={isPending ? "Actualisation…" : "Actualiser"}
    className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-cyan-500 hover:text-cyan-800 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
  >
    <RotateCw aria-hidden="true" className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
  </button>;
}
