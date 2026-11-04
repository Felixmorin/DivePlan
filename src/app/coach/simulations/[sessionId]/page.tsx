import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trophy } from "lucide-react";
import { CoachShell } from "@/components/coach/coach-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCoach } from "@/lib/current-user";
import { fillCompetitionDiveDifficulties, rankCompetitionAthletes, type CompetitionScore } from "@/lib/competition-results";
import type { CompetitionTurn } from "@/lib/competition-simulation";
import { query } from "@/lib/db";
import { formatMontrealDate } from "@/lib/timezone";

type SimulationRow = { id: string; turns: CompetitionTurn[]; title: string; date: Date; groupName: string };

export default async function CompetitionRankingPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const [{ sessionId }, { clubId }] = await Promise.all([params, requireCoach()]);
  const simulation = (await query<SimulationRow>(
    `SELECT cs.id,cs.turns,s.title,s.date,g.name AS "groupName" FROM "CompetitionSimulation" cs
     JOIN "TrainingSession" s ON s.id=cs."sessionId" JOIN "TrainingWeek" w ON w.id=s."weekId"
     JOIN "TrainingGroup" g ON g.id=w."groupId" WHERE cs."sessionId"=$1 AND w."clubId"=$2 AND cs.status='COMPLETED'`, [sessionId, clubId]
  )).rows[0];
  if (!simulation) notFound();
  const scores = (await query<CompetitionScore>(
    `SELECT score."turnIndex",score."judgeAthleteId",score."judgeCoachId",score.rating FROM "CompetitionSimulationScore" score
     JOIN "CompetitionSimulation" cs ON cs.id=score."simulationId" JOIN "TrainingSession" s ON s.id=cs."sessionId"
     JOIN "TrainingWeek" w ON w.id=s."weekId" WHERE cs."sessionId"=$1 AND w."clubId"=$2 ORDER BY score."turnIndex",score."createdAt"`, [sessionId, clubId]
  )).rows;
  const turns = await fillCompetitionDiveDifficulties(simulation.turns, clubId);
  const results = rankCompetitionAthletes(turns, scores);

  return <CoachShell active="Simulation">
    <header className="mb-6"><Link href="/coach/simulations" className="inline-flex items-center gap-2 text-sm font-bold text-[var(--color-brand-strong)]"><ArrowLeft className="h-4 w-4"/>Toutes les simulations</Link><p className="mt-5 text-sm font-black uppercase text-[var(--color-brand-strong)]">{simulation.groupName} · {formatMontrealDate(simulation.date)}</p><h1 className="mt-2 text-3xl font-black">Classement · {simulation.title}</h1><p className="mt-2 text-sm text-[var(--color-ink-muted)]">Points d’un plongeon = DD × somme des notes retenues. Les notes écartées selon le nombre de juges restent visibles.</p></header>
    <div className="space-y-4">{results.map((result,index)=><Card key={result.athleteId}><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="flex items-center gap-2"><Trophy className="h-5 w-5 text-[var(--color-brand-strong)]"/>{index+1}. {result.athleteName}</CardTitle><strong className="text-xl">{result.missingPassages ? `${result.totalPoints.toFixed(2)} pts · ${result.missingPassages} passage${result.missingPassages === 1 ? "" : "s"} incomplet${result.missingPassages === 1 ? "" : "s"}` : `${result.totalPoints.toFixed(2)} pts`}</strong></div></CardHeader><CardContent className="space-y-3">{result.passages.map(({turn,turnIndex,countedScores,discardedScores,points})=><section key={turnIndex} className="rounded-xl bg-[var(--color-surface-raised)] p-4"><div className="flex flex-wrap justify-between gap-2"><div><strong>{turn.diveCode} · {turn.diveName}</strong><p className="text-sm text-[var(--color-ink-muted)]">{turn.height === "ONE_METER" ? "1 m" : turn.height === "THREE_METER" ? "3 m" : turn.height === "PLATFORM" ? "Plateforme" : turn.height} · DD {turn.difficulty ?? "inconnu"}</p></div><strong>{points === null ? "Points indisponibles" : `${points.toFixed(2)} pts`}</strong></div><div className="mt-3 flex flex-wrap gap-2">{[...countedScores.map(score=>({score,discarded:false})),...discardedScores.map(score=>({score,discarded:true}))].map(({score,discarded},index)=><span key={`${score.judgeAthleteId ?? score.judgeCoachId}-${index}`} className={`rounded-md px-2 py-1 text-sm font-semibold ${discarded ? "bg-white text-[var(--color-ink-muted)] line-through" : "bg-white"}`}>{score.judgeCoachId ? "Coach" : "Juge"} {score.rating}{discarded ? " · écartée" : " · retenue"}</span>)}{countedScores.length+discardedScores.length===0&&<span className="text-sm text-[var(--color-ink-muted)]">Aucune note enregistrée</span>}</div></section>)}</CardContent></Card>)}</div>
  </CoachShell>;
}
