"use client";

import { useEffect, useState } from "react";
import { Award, X } from "lucide-react";

type EarnedMilestone = { key: string; title: string; description: string; awardedAt: string };

export function MilestonesDialog({ milestones }: { milestones: EarnedMilestone[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return <>
    <button type="button" onClick={() => setOpen(true)} aria-label="Voir mes milestones" className="flex h-11 w-11 items-center justify-center rounded-xl border border-amber-300/25 bg-amber-400/10 text-amber-200 transition hover:bg-amber-400/20 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">
      <Award className="h-5 w-5" />
    </button>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#04111d]/85 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="athlete-milestones-title" className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-[1.5rem] border border-amber-300/20 bg-[#0b1e30] p-5 text-white shadow-2xl">
        <header className="flex items-center gap-3">
          <Award className="h-6 w-6 text-amber-300" />
          <h2 id="athlete-milestones-title" className="flex-1 text-xl font-black">Mes milestones</h2>
          <button type="button" onClick={() => setOpen(false)} aria-label="Fermer" className="flex h-10 w-10 items-center justify-center rounded-xl text-white/65 hover:bg-white/8 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"><X className="h-5 w-5" /></button>
        </header>
        {milestones.length ? <div className="mt-4 space-y-2">
          {milestones.map((milestone) => <article key={milestone.key} className="flex items-center gap-3 rounded-[1.2rem] border border-amber-300/30 bg-amber-400/10 p-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-300 text-[#281500]"><Award className="h-6 w-6" /></span>
            <span className="min-w-0 flex-1"><span className="block font-black">{milestone.title}</span><span className="mt-0.5 block text-xs leading-5 text-white/60">{milestone.description}</span><time className="mt-2 block text-[10px] font-bold text-white/45" dateTime={milestone.awardedAt}>{new Intl.DateTimeFormat("fr-CA", { dateStyle: "medium", timeZone: "America/Toronto" }).format(new Date(milestone.awardedAt))}</time></span>
          </article>)}
        </div> : <p className="mt-5 rounded-xl bg-[#06101d] p-4 text-sm leading-6 text-white/65">Tu n’as pas encore obtenu de milestone.</p>}
      </section>
    </div>}
  </>;
}
