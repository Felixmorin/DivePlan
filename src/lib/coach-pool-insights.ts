import type { WellnessSession } from "@/components/coach/athlete-wellness-trends";
import { query } from "@/lib/db";

export type PoolInsightHeight = "ONE_METER" | "THREE_METER" | "PLATFORM" | "CUSTOM";
export type AthletePoolInsight = {
  wellnessSessions: WellnessSession[];
  families: Array<{ family: string; volume: number }>;
  competitionDives: Array<{ id: string; position: number; height: PoolInsightHeight; platformHeight: number | null; code: string; volume: number; averageRating: number | null; ratingCount: number }>;
};

/** Historical logged pool volume and athlete-authored confidence for competition dives. */
export async function getCoachPoolInsights(athleteIds: string[], clubId: string): Promise<Record<string, AthletePoolInsight>> {
  const result = Object.fromEntries(athleteIds.map((id) => [id, { families: [], competitionDives: [], wellnessSessions: [] }])) as Record<string, AthletePoolInsight>;
  if (!athleteIds.length) return result;

  const [familyRows, competitionRows, wellnessRows] = await Promise.all([
    query<{ athleteId: string; family: string; volume: number | string }>(
      `SELECT l."athleteId", COALESCE(l."familyOverride", CASE LEFT(l."diveCode", 1)
          WHEN '1' THEN 'Avant' WHEN '2' THEN 'Arriere' WHEN '3' THEN 'Renverse' WHEN '4' THEN 'Retourne' WHEN '5' THEN 'Vrille' ELSE 'Equilibre' END) AS family,
        SUM(l."repetitionsCompleted")::int AS volume
       FROM "AthleteDiveRepetition" l JOIN "Athlete" a ON a.id=l."athleteId"
       LEFT JOIN "AthleteSessionCompletion" c ON c."athleteId"=l."athleteId" AND c."sessionId"=l."sessionId"
       LEFT JOIN "TrainingSession" s ON s.id=l."sessionId" LEFT JOIN "TrainingWeek" w ON w.id=s."weekId"
       WHERE l."athleteId"=ANY($1::text[]) AND a."clubId"=$2
         AND (l."sessionId" IS NULL OR (w."clubId"=$2 AND c.status='COMPLETED'))
       GROUP BY l."athleteId", family`, [athleteIds, clubId]),
      query<{ athleteId: string; id: string; position: number; height: PoolInsightHeight; platformHeight: number | null; code: string; volume: number | string; averageRating: number | string | null; ratingCount: number | string | null }>(
      `WITH dives AS (
         SELECT a.id AS "athleteId", cd.id, cd.position, cd.height, cd."platformHeight", cd."diveCode" AS code
         FROM "Athlete" a
         JOIN "CompetitionDiveList" active_list ON active_list."athleteId"=a.id AND active_list.position=0
         JOIN "CompetitionDive" cd ON cd."athleteId"=a.id AND cd."listId"=active_list.id
         WHERE a.id=ANY($1::text[])
       ), volume AS (
         SELECT l."athleteId", l."diveCode" AS code, l.height, l."heightLabel",
           SUM(l."repetitionsCompleted")::int AS volume
         FROM "AthleteDiveRepetition" l JOIN "Athlete" a ON a.id=l."athleteId"
         WHERE l."athleteId"=ANY($1::text[]) AND a."clubId"=$2
         GROUP BY l."athleteId", code, l.height, l."heightLabel"
       ), ratings AS (
         SELECT "competitionDiveId", AVG(rating)::numeric AS "averageRating", COUNT(*)::int AS "ratingCount"
         FROM "AthleteCompetitionDiveEvaluation" WHERE "athleteId"=ANY($1::text[]) AND evaluator='ATHLETE'
         GROUP BY "competitionDiveId"
       )
       SELECT dives."athleteId", dives.id, dives.position, dives.height, dives."platformHeight", dives.code, COALESCE(SUM(volume.volume),0)::int AS volume, ratings."averageRating", ratings."ratingCount"
       FROM dives LEFT JOIN volume ON volume."athleteId"=dives."athleteId" AND volume.code=dives.code AND (
         (dives.height<>'PLATFORM' AND volume.height=dives.height::text) OR
         (dives.height='PLATFORM' AND volume.height IN ('PLATFORM','CUSTOM') AND (
           volume."heightLabel" IS NULL OR (
             dives."platformHeight" IS NOT NULL AND
             (regexp_match(lower(replace(volume."heightLabel", ',', '.')), '(3|5|7\\.5|10)\\s*m(?:t)?'))[1]::numeric=dives."platformHeight"
           )
         ))
       )
       LEFT JOIN ratings ON ratings."competitionDiveId"=dives.id
       GROUP BY dives."athleteId", dives.id, dives.position, dives.height, dives."platformHeight", dives.code, ratings."averageRating", ratings."ratingCount"
       ORDER BY dives."athleteId", dives.height, dives.position, dives.id`, [athleteIds, clubId]),
    query<WellnessSession & { athleteId: string }>(
      `SELECT a.id AS "athleteId", recent.id, recent.date, recent.rating
       FROM "Athlete" a
       CROSS JOIN LATERAL (
         SELECT s.id, s.date, c.rating
         FROM "AthleteSessionCompletion" c
         JOIN "TrainingSession" s ON s.id=c."sessionId"
         JOIN "TrainingWeek" w ON w.id=s."weekId"
         WHERE c."athleteId"=a.id AND w."clubId"=$2
           AND lower(trim(c.rating)) IN ('pas bien','difficile','moyen','bien','très bien')
         ORDER BY s.date DESC, s.id DESC LIMIT 7
       ) recent
       WHERE a.id=ANY($1::text[]) AND a."clubId"=$2`, [athleteIds, clubId])
  ]);

  for (const row of familyRows.rows) result[row.athleteId]?.families.push({ family: row.family, volume: Number(row.volume) });
  for (const row of competitionRows.rows) result[row.athleteId]?.competitionDives.push({ id: row.id, position: row.position, height: row.height, platformHeight: row.platformHeight === null ? null : Number(row.platformHeight), code: row.code, volume: Number(row.volume), averageRating: row.averageRating === null ? null : Number(row.averageRating), ratingCount: Number(row.ratingCount ?? 0) });
  for (const row of wellnessRows.rows) result[row.athleteId]?.wellnessSessions.push({ id: row.id, date: new Date(row.date).toISOString(), rating: row.rating });
  return result;
}
