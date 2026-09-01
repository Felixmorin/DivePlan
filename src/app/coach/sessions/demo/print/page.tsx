"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { athletes, blocksForAthlete, demoSession } from "@/lib/data";

export default function PrintPage() {
  const activeAthletes = athletes.filter((athlete) => blocksForAthlete(athlete.id).some((block) => block.type === "pool"));
  const commonDry = demoSession.blocks.filter((block) => block.type === "dryland" && block.assignedTo.length > 1);
  return (
    <div className="min-h-screen bg-[var(--color-coach-bg)] p-4 text-[var(--color-ink)] print:p-0">
      <div className="no-print mx-auto mb-4 flex max-w-6xl items-center justify-between rounded-[var(--radius-ui)] border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-card)]">
        <div><h1 className="text-xl font-black">Apercu avant impression</h1><p className="text-sm text-[var(--color-ink-muted)]">Feuille de bassin, fiche individuelle et regroupement par atelier.</p></div>
        <Button onClick={() => window.print()} variant="action"><Printer className="h-4 w-4" /> Imprimer</Button>
      </div>

      <div className="mx-auto max-w-6xl overflow-x-auto pb-4 print:overflow-visible print:pb-0">
      <section className="print-page min-w-[960px] bg-white p-6 print:min-w-0">
        <header className="mb-3 border-b-2 border-black pb-2"><h1 className="text-2xl font-black">FEUILLE DE BASSIN · {demoSession.title.toUpperCase()}</h1><p className="text-sm">{demoSession.date} · {demoSession.group} · {demoSession.duration} min</p></header>
        <div className="print-block mb-3 rounded border border-black p-2">
          <h2 className="font-black">DRYLAND COMMUN</h2>
          {commonDry.length > 0 ? commonDry.map((block) => <div key={block.id} className="text-sm"><strong>{block.assignedTo.map((id) => athletes.find((a) => a.id === id)?.firstName).join(" · ")}</strong> · {block.exercises?.map((e) => `${e.name} ${e.sets} x ${e.reps ?? e.duration}`).join(" · ")}</div>) : <p className="text-sm">Aucun bloc dryland partage.</p>}
        </div>
        <h2 className="mb-2 font-black">ENTRAINEMENTS PISCINE INDIVIDUELS</h2>
        <div className={`grid gap-2 ${activeAthletes.length > 6 ? "grid-cols-4" : "grid-cols-3"}`}>
          {activeAthletes.map((athlete) => {
            const pool = blocksForAthlete(athlete.id).find((block) => block.type === "pool")?.pool;
            const total = [...(pool?.oneMeter ?? []), ...(pool?.threeMeter ?? [])].reduce((sum, dive) => sum + dive.reps, 0);
            return (
              <div key={athlete.id} className="print-athlete-card min-h-52 border border-black p-2 text-xs">
                <h3 className="text-base font-black">{athlete.firstName}</h3>
                <div className="print-keep mt-1 font-black">1 M</div>
                {pool?.oneMeter.map((dive) => <div key={dive.code} className="flex justify-between"><span>□ {dive.code}</span><span>x {dive.reps}</span></div>)}
                <div className="print-keep mt-1 font-black">3 M</div>
                {pool?.threeMeter.map((dive) => <div key={dive.code} className="flex justify-between"><span>□ {dive.code}</span><span>x {dive.reps}</span></div>)}
                <div className="mt-2 border-t border-black pt-1 font-black">Total {total}</div>
                <div className="mt-2 h-10 border border-dashed border-black p-1">Notes</div>
              </div>
            );
          })}
        </div>
      </section>
      </div>

      {activeAthletes.map((athlete) => {
        const blocks = blocksForAthlete(athlete.id);
        const pool = blocks.find((block) => block.type === "pool")?.pool;
        return (
          <section key={athlete.id} className="print-page mx-auto mt-4 max-w-6xl bg-white p-6 print:max-w-none">
            <h1 className="mb-3 border-b-2 border-black pb-2 text-2xl font-black">FICHE INDIVIDUELLE · {athlete.firstName} {athlete.lastName}</h1>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="print-block"><h2 className="font-black">DRYLAND</h2>{blocks.filter((b) => b.type === "dryland").flatMap((b) => b.exercises ?? []).map((e) => <p key={e.name}>□ {e.name} · {e.sets} x {e.reps ?? e.duration}</p>)}</div>
              <div className="print-block"><h2 className="font-black">OBJECTIFS</h2><p>Position de depart · Impulsion · Rotation · Ouverture · Entree</p><div className="mt-4 h-28 border border-black p-2">Notes</div></div>
              <div className="print-block"><h2 className="font-black">1 METRE</h2>{pool?.oneMeter.map((d) => <p key={d.code}>□ {d.code} x {d.reps}</p>)}</div>
              <div className="print-block"><h2 className="font-black">3 METRES</h2>{pool?.threeMeter.map((d) => <p key={d.code}>□ {d.code} x {d.reps}</p>)}</div>
            </div>
          </section>
        );
      })}

      <section className="print-page mx-auto mt-4 max-w-6xl bg-white p-6 print:max-w-none">
        <h1 className="mb-3 border-b-2 border-black pb-2 text-2xl font-black">PAR ATELIER</h1>
        {demoSession.blocks.filter((block) => ["dryland", "pool"].includes(block.type)).map((block) => (
          <div key={block.id} className="print-block mb-3 border border-black p-2">
            <h2 className="font-black">{block.title}</h2>
            <p>{block.assignedTo.length > 1 ? "Partage par " : "Assigne a "}{block.assignedTo.map((id) => athletes.find((a) => a.id === id)?.firstName).join(" · ")}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
