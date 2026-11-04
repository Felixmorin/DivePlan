"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

const athletes = ["Emma Tremblay", "Charles Gagnon", "Léo Bergeron", "Juliette Roy"];

export function CompetitionVoteDemo() {
  const [judge, setJudge] = useState(athletes[2]);
  const [rating, setRating] = useState(7.5);
  const [votes, setVotes] = useState<Record<string, number>>({});
  const canVote = judge !== athletes[0] && judge !== athletes[1];

  return <main className="mx-auto min-h-screen w-full max-w-lg p-4 pb-10 text-white sm:my-6 sm:min-h-0 sm:rounded-[2rem] sm:border sm:border-white/10 sm:p-6">
    <header className="mb-5"><p className="text-xs font-black uppercase tracking-widest text-cyan-300">Mode démo · votes fictifs</p><h1 className="mt-1 text-2xl font-black">Vote des athlètes</h1><p className="mt-2 text-sm text-white/65">Essaie le parcours comme plusieurs athlètes. Les notes restent dans cette page et ne sont pas enregistrées.</p></header>
    <section className="rounded-3xl bg-gradient-to-br from-[#153c59] to-[#102b41] p-6"><p className="text-sm font-bold text-white/65">Emma Tremblay plonge</p><div className="mt-2 text-5xl font-black">101C</div><p className="mt-1 text-base text-white/65">Avant groupe · 1 m</p></section>
    <section className="mt-5 space-y-5 rounded-3xl bg-[#102b41] p-5">
      <label className="block text-sm font-bold">Je teste le vote comme
        <select value={judge} onChange={(event) => setJudge(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-white/15 bg-[#071a2b] px-3 text-base text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">{athletes.map((name) => <option key={name}>{name}</option>)}</select>
      </label>
      {!canVote ? <p className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-4 font-bold">{judge === athletes[0] ? "C’est ton plongeon : tu ne peux pas voter." : "Tu es le prochain à plonger : tu ne peux pas voter ce passage."}</p> : <>
        <div><h2 className="text-xl font-black">Ta note</h2><div className="mt-4 grid grid-cols-4 gap-2">{Array.from({ length: 11 }, (_, score) => <button key={score} type="button" aria-pressed={rating === score} onClick={() => setRating(score)} className={`min-h-14 rounded-xl text-xl font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${rating === score ? "bg-cyan-300 text-slate-950" : "bg-white/10 hover:bg-white/20"}`}>{score}</button>)}</div></div>
        <div className="flex items-center justify-between gap-2"><button type="button" disabled={rating <= 0} onClick={() => setRating((value) => Math.max(0, value - 0.5))} className="min-h-12 rounded-xl border-2 border-cyan-300 px-4 text-lg font-black disabled:opacity-50">−0,5</button><output aria-live="polite" className="text-3xl font-black">{rating.toLocaleString("fr-CA", { maximumFractionDigits: 1 })} / 10</output><button type="button" disabled={rating >= 10} onClick={() => setRating((value) => Math.min(10, value + 0.5))} className="min-h-12 rounded-xl border-2 border-cyan-300 px-4 text-lg font-black disabled:opacity-50">+0,5</button></div>
        {votes[judge] === undefined ? <Button variant="action" onClick={() => setVotes((current) => ({ ...current, [judge]: rating }))}>Envoyer ma note</Button> : <p role="status" className="rounded-xl bg-emerald-400/15 p-3 font-bold text-emerald-200">Ta note {votes[judge].toLocaleString("fr-CA")} est enregistrée dans la démo.</p>}
      </>}
    </section>
    <section className="mt-5 rounded-2xl bg-white/5 p-4"><h2 className="font-black">Votes reçus · {Object.keys(votes).length} / 2</h2><ul className="mt-2 space-y-1 text-sm text-white/70">{Object.entries(votes).map(([name, score]) => <li key={name}>{name} · {score.toLocaleString("fr-CA")} / 10</li>)}</ul><button type="button" onClick={() => setVotes({})} className="mt-3 text-sm font-bold text-cyan-300 underline">Réinitialiser les votes</button></section>
  </main>;
}
