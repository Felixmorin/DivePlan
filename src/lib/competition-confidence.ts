import "server-only";
import { query } from "@/lib/db";
import type { SessionPoolHeight } from "@/lib/session-template";

export type CompetitionConfidenceRow = {
  competitionDiveId: string;
  diveCode: string;
  height: SessionPoolHeight;
  rating: number;
  evaluator: "ATHLETE" | "COACH";
  evaluatedAt: Date;
};

export async function getCompetitionConfidence(athleteId: string, mode: "history" | "latest-athlete"): Promise<CompetitionConfidenceRow[]> {
  // Callers must authorize the athlete first. No shared cache is introduced.
  // The competition table consumes only the latest ATHLETE rating of current
  // dives; chart views still require every historical row, including COACH.
  if (mode === "latest-athlete") {
    return (await query<CompetitionConfidenceRow>(
      `SELECT DISTINCT ON (e."competitionDiveId") e."competitionDiveId",e."diveCode",e.height,e.rating,e.evaluator,e."evaluatedAt"
       FROM "AthleteCompetitionDiveEvaluation" e JOIN "CompetitionDive" d ON d.id=e."competitionDiveId"
       WHERE e."athleteId"=$1 AND d."athleteId"=$1 AND e.evaluator='ATHLETE'
       ORDER BY e."competitionDiveId",e."evaluatedAt" DESC,e.id DESC`, [athleteId]
    )).rows;
  }
  return (await query<CompetitionConfidenceRow>(
    `SELECT "competitionDiveId","diveCode",height,rating,evaluator,"evaluatedAt" FROM "AthleteCompetitionDiveEvaluation" WHERE "athleteId"=$1 ORDER BY "evaluatedAt"`, [athleteId]
  )).rows;
}
