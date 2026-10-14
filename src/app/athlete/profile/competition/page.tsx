import { redirect } from "next/navigation";
import { AthleteShell } from "@/components/athlete/athlete-shell";
import { CompetitionProgressList } from "@/components/athlete/competition-progress-list";
import type { CompetitionDiveItem } from "@/components/athlete/competition-list";
import { getCurrentAthlete } from "@/lib/athlete-session";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AthleteCompetitionPage() {
  const athlete = await getCurrentAthlete();
  if (!athlete) redirect("/login");
  const volumes = (await query<{ code: string; height: string; heightLabel: string | null; volume: number }>(
    `SELECT d."diveCode" AS code,s.height,s.label AS "heightLabel",COALESCE(SUM(l."repetitionsCompleted"),0)::int AS volume FROM "PoolDive" d JOIN "PoolSection" s ON s.id=d."poolSectionId" LEFT JOIN "AthleteDiveLog" l ON l."poolDiveId"=d.id AND l."athleteId"=$1 GROUP BY d."diveCode",s.height,s.label`, [athlete.id]
  )).rows;
  const dives: CompetitionDiveItem[] = athlete.competitionDives.map((dive) => ({
    id: dive.id,
    height: dive.height,
    code: dive.diveCode,
    difficulty: dive.difficulty,
    platformHeight: dive.platformHeight,
    volume: volumes.filter((entry) => entry.code === dive.diveCode && entry.height === dive.height && (dive.height !== "PLATFORM" || entry.heightLabel === `${dive.platformHeight} m`)).reduce((sum, entry) => sum + entry.volume, 0)
  }));

  return <AthleteShell className="competition-progress-page"><CompetitionProgressList dives={dives} /></AthleteShell>;
}
