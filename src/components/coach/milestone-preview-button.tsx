"use client";

import { useState } from "react";
import { PartyPopper, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MILESTONES } from "@/lib/milestones";

export function MilestonePreviewButton() {
  const [open, setOpen] = useState(false);
  return <>
    <Button type="button" variant="outline" onClick={() => setOpen(true)}><PartyPopper className="mr-2 h-4 w-4" />Prévisualiser l’animation</Button>
    {open && <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-hidden bg-[#04111de8] p-5 text-center text-white backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="milestone-preview-title">
      <div className="milestone-confetti" aria-hidden="true">{Array.from({ length: 28 }, (_, index) => <i key={index} style={{ left: `${(index * 37) % 100}%`, animationDelay: `${(index % 9) * -0.19}s`, backgroundColor: ["#facc15", "#22d3ee", "#fb7185", "#a3e635", "#c084fc"][index % 5] }} />)}</div>
      <Button type="button" variant="outline" className="absolute right-4 top-4 z-20 text-white" aria-label="Fermer l’aperçu" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
      <div className="relative z-10 max-w-sm animate-[milestone-pop_500ms_cubic-bezier(.2,.9,.3,1.3)]">
        <div className="text-7xl" aria-hidden="true">🎉</div>
        <p className="mt-4 text-xs font-black uppercase tracking-[.22em] text-amber-300">Nouveau milestone</p>
        <div className="mt-3 rounded-2xl border border-amber-200/25 bg-white/8 p-4"><h2 id="milestone-preview-title" className="text-2xl font-black">{MILESTONES.repetitions500.title}</h2><p className="mt-2 text-sm leading-6 text-white/70">{MILESTONES.repetitions500.description}</p></div>
        <p className="mt-4 text-sm font-semibold text-white/55">Aperçu seulement · aucune réussite n’est enregistrée.</p>
      </div>
    </div>}
  </>;
}
