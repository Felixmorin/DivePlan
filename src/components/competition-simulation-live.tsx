"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";

type Snapshot = {
  status: "READY" | "LIVE" | "COMPLETED";
  turnIndex: number;
  totalTurns: number;
  turn: { athleteId: string; athleteName: string; diveCode: string; diveName: string; height: string } | null;
  completedTurns: Array<{ athleteId: string; athleteName: string; diveCode: string; diveName: string; height: string }>;
  nextDiver: { athleteId: string; athleteName: string } | null;
  role: "DIVER" | "JUDGE" | "NEXT" | "COACH";
  eligibleCount: number;
  receivedCount: number;
  expectedCount: number;
  ownRating: number | null;
  pendingJudges: string[];
  scores: Array<{ turnIndex: number; judgeAthleteId: string | null; judgeCoachId: string | null; rating: number }>;
};

export function CompetitionSimulationLive({ sessionId, coach = false }: { sessionId: string; coach?: boolean }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/competition-simulation/${sessionId}`, { cache: "no-store" });
    if (!response.ok) throw new Error("La simulation n’a pas pu être chargée.");
    setSnapshot(await response.json() as Snapshot);
  }, [sessionId]);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Erreur de connexion.")), 0);
    const timer = window.setInterval(() => void refresh().catch(() => undefined), 2500);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [refresh]);

  async function send(body: Record<string, unknown>, confirmMissing = false) {
    if (!snapshot) return;
    if (confirmMissing && !window.confirm("Passer au plongeur suivant sans toutes les notes ?")) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/competition-simulation/${sessionId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "L’action n’a pas été enregistrée.");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Erreur de connexion.");
    } finally {
      setPending(false);
    }
  }

  if (!snapshot) return <section className="rounded-2xl bg-white p-5 text-sm">{error || "Chargement de la simulation…"}</section>;
  const turn = snapshot.turn;
  const heightLabel = turn?.height === "ONE_METER" ? "1 m" : turn?.height === "THREE_METER" ? "3 m" : turn?.height === "PLATFORM" ? "Plateforme" : turn?.height ?? "";

  return <main className="mx-auto min-h-screen w-full max-w-lg bg-[#071a2b] p-4 pb-10 text-white sm:my-6 sm:min-h-0 sm:rounded-[2rem] sm:border sm:border-white/10 sm:p-6">
    <header className="mb-5 flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-widest text-cyan-300">Simulation en direct</p><h1 className="mt-1 text-xl font-black">{snapshot.status === "COMPLETED" ? "Simulation terminée" : `Passage ${Math.min(snapshot.turnIndex + 1, snapshot.totalTurns)} / ${snapshot.totalTurns}`}</h1></div><span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold">{snapshot.status === "LIVE" ? "En direct" : snapshot.status === "READY" ? "À démarrer" : "Terminée"}</span></header>
    {turn && snapshot.status !== "COMPLETED" && <section className="rounded-3xl bg-[#102b41] p-5"><p className="text-sm font-bold text-white/60">{turn.athleteName} plonge</p><div className="mt-2 text-4xl font-black">{turn.diveCode}</div><p className="mt-1 text-sm text-white/65">{turn.diveName} · {heightLabel}</p></section>}
    {snapshot.status === "READY" && <p className="mt-5 rounded-2xl bg-white/8 p-4 text-sm">En attente du coach pour démarrer la simulation.</p>}
    {snapshot.status === "LIVE" && snapshot.role === "DIVER" && <p className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 font-bold">C’est ton plongeon. Tu ne juges pas ce passage.</p>}
    {snapshot.status === "LIVE" && snapshot.role === "NEXT" && <p className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 font-bold">Tu es le prochain à plonger. Prépare-toi; tu ne juges pas ce passage.</p>}
    {snapshot.status === "LIVE" && snapshot.role === "JUDGE" && <section className="mt-5 rounded-3xl bg-[#102b41] p-5"><h2 className="font-black">Ta note</h2><p className="mb-3 mt-1 text-xs text-white/55">Choisis une note entière de 0 à 10. Elle reste privée avant l’envoi.</p>{snapshot.ownRating === null ? <div className="grid grid-cols-6 gap-2">{Array.from({ length: 11 }, (_, rating) => <button key={rating} type="button" disabled={pending} onClick={() => void send({ action: "vote", turnIndex: snapshot.turnIndex, rating })} className="min-h-12 rounded-xl bg-white/10 text-lg font-black hover:bg-cyan-300 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-50">{rating}</button>)}</div> : <p role="status" className="rounded-xl bg-emerald-400/15 p-3 font-bold text-emerald-200">Ta note {snapshot.ownRating} est enregistrée.</p>}</section>}
    {snapshot.status === "LIVE" && coach && snapshot.role === "COACH" && <section className="mt-5 space-y-3 rounded-3xl bg-[#102b41] p-5"><p className="font-bold">{snapshot.receivedCount} / {snapshot.expectedCount} notes reçues</p>{snapshot.pendingJudges.length > 0 && <p className="text-sm text-white/60">En attente : {snapshot.pendingJudges.join(", ")}</p>}<label className="block text-sm font-bold">Ta note de coach<select aria-label="Ta note de coach" value={snapshot.ownRating ?? ""} disabled={pending || snapshot.ownRating !== null} onChange={(event) => void send({ action: "vote", turnIndex: snapshot.turnIndex, rating: Number(event.target.value) })} className="mt-2 h-12 w-full rounded-xl bg-white px-3 text-lg font-black text-slate-950"><option value="" disabled>Choisir une note</option>{Array.from({ length: 11 }, (_, rating) => <option key={rating} value={rating}>{rating}</option>)}</select></label><Button variant="action" disabled={pending || snapshot.receivedCount < snapshot.expectedCount} onClick={() => void send({ action: "advance", force: false })}>{snapshot.turnIndex + 1 >= snapshot.totalTurns ? "Terminer la simulation" : "Plongeur suivant"}</Button>{snapshot.receivedCount < snapshot.expectedCount && <Button variant="outline" disabled={pending} onClick={() => void send({ action: "advance", force: true }, true)}>Passer avec des notes manquantes</Button>}</section>}
    {snapshot.status === "READY" && coach && <Button className="mt-5 w-full" variant="action" disabled={pending} onClick={() => void send({ action: "start" })}>Démarrer la simulation</Button>}
    {snapshot.status === "LIVE" && snapshot.role !== "COACH" && <p className="mt-5 text-center text-sm text-white/55">Notes reçues : {snapshot.receivedCount} / {snapshot.expectedCount}</p>}
    {snapshot.status === "COMPLETED" && <section className="mt-5 rounded-3xl bg-[#102b41] p-5"><h2 className="font-black">Notes par passage</h2><p className="mt-1 text-sm text-white/60">Les notes individuelles sont visibles après la fin de la simulation.</p><div className="mt-4 space-y-4">{snapshot.completedTurns.map((completedTurn, turnIndex) => { const scores = snapshot.scores.filter((score) => score.turnIndex === turnIndex); return <div key={turnIndex} className="rounded-xl bg-white/5 p-3"><strong>{completedTurn.athleteName} · {completedTurn.diveCode}</strong><div className="mt-2 flex flex-wrap gap-2">{scores.map((score, index) => <span key={`${score.judgeAthleteId ?? score.judgeCoachId}-${index}`} className="rounded-lg bg-white/10 px-2 py-1 text-sm">{score.judgeCoachId ? "Coach" : "Juge"} {score.rating}/10</span>)}</div></div>; })}</div>{!coach && <Button asChild variant="action" className="mt-5 w-full"><Link href={`/athlete/session/${sessionId}`}>Continuer l’entraînement</Link></Button>}{coach && <Button asChild variant="outline" className="mt-5 w-full"><Link href={`/coach/sessions/${sessionId}`}>Retour à la séance</Link></Button>}</section>}
    {error && <p role="alert" className="mt-4 rounded-xl bg-red-500/15 p-3 text-sm font-bold text-red-200">{error}</p>}
  </main>;
}
