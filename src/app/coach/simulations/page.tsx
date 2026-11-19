import { ChevronDown } from "lucide-react";
import { CoachShell } from "@/components/coach/coach-shell";
import { Card, CardContent } from "@/components/ui/card";
import { requireCoach } from "@/lib/current-user";
import { query } from "@/lib/db";
import { fillCompetitionDiveDifficulties, rankCompetitionAthletes, type CompetitionScore } from "@/lib/competition-results";
import type { CompetitionTurn } from "@/lib/competition-simulation";
import { formatMontrealDate } from "@/lib/timezone";
import { SimulationResults } from "./simulation-results";
import styles from "./simulations.module.css";

type SimulationRow = { id: string; sessionId: string; turns: CompetitionTurn[]; title: string; date: Date; groupName: string };
type ScoreRow = CompetitionScore & { simulationId: string };

const heightLabels: Record<string, string | undefined> = {
  ONE_METER: "Tremplin 1 m",
  THREE_METER: "Tremplin 3 m",
  PLATFORM: "Plateforme",
};

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
    <header className="mb-5"><h1 className="text-3xl font-black tracking-tight">Simulations</h1></header>
    {simulations.length === 0 ? <Card><CardContent className="p-6 text-sm text-[var(--color-ink-muted)]">Aucune simulation terminée pour le moment. Les résultats apparaîtront ici après la prochaine simulation.</CardContent></Card> : <div className="space-y-4">
      {simulations.map(async (simulation) => {
        const turns = await fillCompetitionDiveDifficulties(simulation.turns, clubId);
        const results = rankCompetitionAthletes(turns, scores.filter((score) => score.simulationId === simulation.id));
        const heights = Array.from(new Set(turns.map((turn) => turn.height)));
        const location = heights.length === 1 ? heightLabels[heights[0]] ?? simulation.groupName : simulation.groupName;

        return (
          <details key={simulation.id} name="coach-simulations">
            <summary className={styles.banner}>
              <span className={styles.bannerTitle}>{simulation.title}</span>
              <span className={styles.bannerMeta}>
                <span>{formatMontrealDate(simulation.date, { dateStyle: "long" })}</span>
                <span aria-hidden="true">·</span>
                <span>{location}</span>
                <span className={styles.status}>Terminée</span>
              </span>
              <ChevronDown className={styles.bannerChevron} aria-hidden="true" />
            </summary>
            <SimulationResults sessionId={simulation.sessionId} results={results} />
          </details>
        );
      })}
    </div>}
  </CoachShell>;
}
