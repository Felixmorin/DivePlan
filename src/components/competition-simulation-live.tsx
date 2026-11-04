"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { startVisiblePolling } from "@/lib/visible-polling";

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
  const [draftRating, setDraftRating] = useState(5);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/competition-simulation/${sessionId}`, { cache: "no-store" });
    if (!response.ok) throw new Error("La simulation n’a pas pu être chargée.");
    setSnapshot(await response.json() as Snapshot);
  }, [sessionId]);

  useEffect(() => {
    return startVisiblePolling({
      poll: () => refresh().catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Erreur de connexion.");
      }),
      isVisible: () => document.visibilityState === "visible",
      subscribe: (listener) => {
        document.addEventListener("visibilitychange", listener);
        return () => document.removeEventListener("visibilitychange", listener);
      },
      intervalMs: 2500,
      schedule: (callback, delayMs) => window.setTimeout(callback, delayMs) as unknown as ReturnType<typeof setTimeout>,
      cancel: (timer) => window.clearTimeout(timer as unknown as number),
    });
  }, [refresh]);

  useEffect(() => {
    if (snapshot) setDraftRating(snapshot.ownRating ?? 5);
  }, [snapshot?.turnIndex, snapshot?.ownRating]);

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
  const canJudge = snapshot.status === "LIVE" && (snapshot.role === "JUDGE" || (coach && snapshot.role === "COACH"));
  const updateDraft = (value: number) => setDraftRating(Math.min(10, Math.max(0, Math.round(value * 2) / 2)));

  return <main className="mx-auto min-h-screen w-full max-w-lg bg-[#071a2b] p-4 pb-10 text-white sm:my-6 sm:min-h-0 sm:rounded-[2rem] sm:border sm:border-white/10 sm:p-6">
    <header className="mb-5 flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-widest text-cyan-300">Simulation en direct</p><h1 className="mt-1 text-xl font-black">{snapshot.status === "COMPLETED" ? "Simulation terminée" : `Passage ${Math.min(snapshot.turnIndex + 1, snapshot.totalTurns)} / ${snapshot.totalTurns}`}</h1></div><span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold">{snapshot.status === "LIVE" ? "En direct" : snapshot.status === "READY" ? "À démarrer" : "Terminée"}</span></header>
    {turn && snapshot.status !== "COMPLETED" && <section className="rounded-3xl bg-gradient-to-br from-[#153c59] to-[#102b41] p-6 sm:p-8"><p className="text-sm font-bold text-white/65">{turn.athleteName} plonge</p><div className="mt-2 text-5xl font-black sm:text-6xl">{turn.diveCode}</div><p className="mt-1 text-base text-white/65">{turn.diveName} · {heightLabel}</p></section>}
    {snapshot.status === "READY" && <p className="mt-5 rounded-2xl bg-white/8 p-4 text-sm">En attente du coach pour démarrer la simulation.</p>}
    {snapshot.status === "LIVE" && snapshot.role === "DIVER" && <p className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 font-bold">C’est ton plongeon. Tu ne juges pas ce passage.</p>}
    {snapshot.status === "LIVE" && snapshot.role === "NEXT" && <p className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 font-bold">Tu es le prochain à plonger. Prépare-toi; tu ne juges pas ce passage.</p>}
    {canJudge && <section className="mt-5 space-y-5 rounded-3xl bg-[#102b41] p-5 sm:p-6"><div><h2 className="text-2xl font-black">{snapshot.receivedCount} / {snapshot.expectedCount} note{snapshot.expectedCount === 1 ? "" : "s"} reçue{snapshot.expectedCount === 1 ? "" : "s"}</h2><p className="mt-3 text-xl font-black">{coach ? "Ta note de coach" : "Ta note"}</p></div><div className="grid grid-cols-4 gap-2 sm:gap-3">{Array.from({ length: 11 }, (_, rating) => <button key={rating} type="button" disabled={pending || snapshot.ownRating !== null} aria-pressed={draftRating === rating} onClick={() => updateDraft(rating)} className={`min-h-16 rounded-2xl text-2xl font-black transition-colors sm:min-h-20 sm:text-3xl ${draftRating === rating ? "bg-cyan-300 text-slate-950" : "bg-white/10 hover:bg-white/20"} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-60`}>{rating}</button>)}</div><div className="flex items-center justify-between gap-2"><button type="button" disabled={pending || snapshot.ownRating !== null || draftRating <= 0} onClick={() => updateDraft(draftRating - 0.5)} className="min-h-12 rounded-xl border-2 border-cyan-300 px-4 text-lg font-black text-white hover:bg-cyan-300/10 disabled:opacity-50">−0,5</button><output aria-live="polite" className="text-3xl font-black sm:text-4xl">{draftRating.toLocaleString("fr-CA", { maximumFractionDigits: 1 })} / 10</output><button type="button" disabled={pending || snapshot.ownRating !== null || draftRating >= 10} onClick={() => updateDraft(draftRating + 0.5)} className="min-h-12 rounded-xl border-2 border-cyan-300 px-4 text-lg font-black text-white hover:bg-cyan-300/10 disabled:opacity-50">+0,5</button></div>{snapshot.ownRating === null ? <Button variant="action" disabled={pending} onClick={() => void send({ action: "vote", turnIndex: snapshot.turnIndex, rating: draftRating })}>{coach ? "Enregistrer ma note" : "Envoyer ma note"}</Button> : <p role="status" className="rounded-xl bg-emerald-400/15 p-3 font-bold text-emerald-200">Ta note {snapshot.ownRating.toLocaleString("fr-CA", { maximumFractionDigits: 1 })} est enregistrée.</p>}{coach && <><Button variant="action" disabled={pending || snapshot.receivedCount < snapshot.expectedCount} onClick={() => void send({ action: "advance", force: false })}>{snapshot.turnIndex + 1 >= snapshot.totalTurns ? "Terminer la simulation" : "Plongeur suivant"}</Button>{snapshot.receivedCount < snapshot.expectedCount && <Button variant="outline" disabled={pending} onClick={() => void send({ action: "advance", force: true }, true)}>Passer avec des notes manquantes</Button>}</>}</section>}
    {snapshot.status === "READY" && coach && <Button className="mt-5 w-full" variant="action" disabled={pending} onClick={() => void send({ action: "start" })}>Démarrer la simulation</Button>}
    {snapshot.status === "LIVE" && snapshot.role !== "COACH" && <p className="mt-5 text-center text-sm text-white/55">Notes reçues : {snapshot.receivedCount} / {snapshot.expectedCount}</p>}
    {snapshot.status === "COMPLETED" && <section className="mt-5 rounded-3xl bg-[#102b41] p-5"><h2 className="font-black">Notes par passage</h2><p className="mt-1 text-sm text-white/60">Les notes individuelles sont visibles après la fin de la simulation.</p><div className="mt-4 space-y-4">{snapshot.completedTurns.map((completedTurn, turnIndex) => { const scores = snapshot.scores.filter((score) => score.turnIndex === turnIndex); return <div key={turnIndex} className="rounded-xl bg-white/5 p-3"><strong>{completedTurn.athleteName} · {completedTurn.diveCode}</strong><div className="mt-2 flex flex-wrap gap-2">{scores.map((score, index) => <span key={`${score.judgeAthleteId ?? score.judgeCoachId}-${index}`} className="rounded-lg bg-white/10 px-2 py-1 text-sm">{score.judgeCoachId ? "Coach" : "Juge"} {score.rating}/10</span>)}</div></div>; })}</div>{!coach && <Button asChild variant="action" className="mt-5 w-full"><Link href={`/athlete/session/${sessionId}`}>Continuer l’entraînement</Link></Button>}{coach && <Button asChild variant="action" className="mt-5 w-full"><Link href={`/coach/simulations/${sessionId}`}>Voir le classement</Link></Button>}</section>}
    {error && <p role="alert" className="mt-4 rounded-xl bg-red-500/15 p-3 text-sm font-bold text-red-200">{error}</p>}
  </main>;
}
