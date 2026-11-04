import Link from "next/link";
import { CalendarDays, Trophy, Users } from "lucide-react";
import { CoachShell } from "@/components/coach/coach-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCoach } from "@/lib/current-user";
import { query } from "@/lib/db";
import { fillCompetitionDiveDifficulties, rankCompetitionAthletes, type CompetitionScore } from "@/lib/competition-results";
import type { CompetitionTurn } from "@/lib/competition-simulation";
import { formatMontrealDate } from "@/lib/timezone";

type SimulationRow = { id: string; sessionId: string; turns: CompetitionTurn[]; title: string; date: Date; groupName: string };
type ScoreRow = CompetitionScore & { simulationId: string };

export default async function CoachSimulationsPage() {
  const { clubId } = await requireCoach();
  const simulations = (await query<SimulationRow>(
    `SELECT cs.id,cs."sessionId",cs.turns,s.title,s.date,g.name AS "groupName" FROM "CompetitionSimulation" cs
     JOIN "TrainingSession" s ON s.id=cs."sessionId" JOIN "TrainingWeek" w ON w.id=s."weekId"
     JOIN "TrainingGroup" g ON g.id=w."groupId" WHERE w."clubId"=$1 AND cs.status='COMPLETED' ORDER BY cs."updatedAt" DESC`, [clubId]
  )).rows;
  const scores = simulations.length ? (await query<ScoreRow>(
    `SELECT score."simulationId",score."turnIndex",score."judgeAthleteId",score."judgeCoachId",score.rating
     FROM "CompetitionSimulationScore" score JOIN "CompetitionSimulation" cs ON cs.id=score."simulationId"
     JOIN "TrainingSession" s ON s.id=cs."sessionId" JOIN "TrainingWeek" w ON w.id=s."weekId"
     WHERE w."clubId"=$1 AND cs.status='COMPLETED' ORDER BY score."turnIndex",score."createdAt"`, [clubId]
  )).rows : [];

  return <CoachShell active="Simulation">
    <header className="mb-6"><p className="text-sm font-black uppercase text-[var(--color-brand-strong)]">Compétitions</p><h1 className="mt-2 text-3xl font-black">Simulations</h1><p className="mt-1 text-sm text-[var(--color-ink-muted)]">Classements et résultats des simulations terminées.</p></header>
    {simulations.length === 0 ? <Card><CardContent className="p-6 text-sm text-[var(--color-ink-muted)]">Aucune simulation terminée pour le moment. Les résultats apparaîtront ici après la prochaine simulation.</CardContent></Card> : <div className="space-y-4">
      {simulations.map(async (simulation) => {
        const turns = await fillCompetitionDiveDifficulties(simulation.turns, clubId);
        const results = rankCompetitionAthletes(turns, scores.filter((score) => score.simulationId === simulation.id));
        return <Card key={simulation.id}><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle><Link className="hover:underline" href={`/coach/simulations/${simulation.sessionId}`}>{simulation.title}</Link></CardTitle><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--color-ink-muted)]"><span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4"/>{formatMontrealDate(simulation.date)}</span><span>{simulation.groupName}</span></div></div><span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-surface-raised)] px-3 py-1 text-sm font-bold"><Users className="h-4 w-4"/>{results.length} athlète{results.length === 1 ? "" : "s"} · {turns.length} passage{turns.length === 1 ? "" : "s"}</span></div></CardHeader><CardContent className="space-y-2"><h2 className="mb-3 flex items-center gap-2 font-black"><Trophy className="h-4 w-4 text-[var(--color-brand-strong)]"/>Classement</h2>{results.map((result,index)=><Link key={result.athleteId} href={`/coach/simulations/${simulation.sessionId}`} className="flex flex-wrap justify-between gap-2 rounded-xl border border-[var(--color-border)] bg-white p-3 font-bold focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"><span><span className="mr-2 text-[var(--color-ink-muted)]">{index+1}.</span>{result.athleteName}</span><span className="text-sm text-[var(--color-ink-muted)]">{result.missingPassages ? `${result.scoredPassages}/${result.passages.length} passages notés` : `${result.totalPoints.toFixed(2)} pts`}</span></Link>)}</CardContent></Card>;
      })}
    </div>}
  </CoachShell>;
}
