import { notFound } from "next/navigation";
import { CompetitionSimulationLive } from "@/components/competition-simulation-live";
import { CoachShell } from "@/components/coach/coach-shell";
import { requireCoach } from "@/lib/current-user";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function CoachCompetitionSimulationPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, coach] = await Promise.all([params, requireCoach()]);
  const simulation = await query(`SELECT 1 FROM "CompetitionSimulation" cs JOIN "TrainingSession" s ON s.id=cs."sessionId" JOIN "TrainingWeek" w ON w.id=s."weekId" WHERE cs."sessionId"=$1 AND w."clubId"=$2`, [id, coach.clubId]);
  if (!simulation.rowCount) notFound();
  return <CoachShell active="Seances"><CompetitionSimulationLive sessionId={id} coach /></CoachShell>;
}
