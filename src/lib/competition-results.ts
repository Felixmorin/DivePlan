import "server-only";
import type { CompetitionTurn } from "./competition-simulation";
import { query } from "./db";

export type CompetitionScore = {
  turnIndex: number;
  judgeAthleteId: string | null;
  judgeCoachId: string | null;
  rating: number;
};

export type ScoredCompetitionPassage = {
  turnIndex: number;
  turn: CompetitionTurn;
  scores: CompetitionScore[];
  countedScores: CompetitionScore[];
  discardedScores: CompetitionScore[];
  points: number | null;
};

export type RankedCompetitionAthlete = {
  athleteId: string;
  athleteName: string;
  totalPoints: number;
  scoredPassages: number;
  missingPassages: number;
  passages: ScoredCompetitionPassage[];
};

export async function fillCompetitionDiveDifficulties(turns: CompetitionTurn[], clubId: string) {
  const missing = turns.filter((turn) => turn.difficulty == null);
  if (missing.length === 0) return turns;
  const athleteIds = Array.from(new Set(missing.map((turn) => turn.athleteId)));
  const diveCodes = Array.from(new Set(missing.map((turn) => turn.diveCode)));
  const heights = Array.from(new Set(missing.map((turn) => turn.height)));
  const rows = (await query<{ athleteId: string; diveCode: string; height: string; difficulty: number | null }>(
    `SELECT d."athleteId",d."diveCode",d.height::text AS height,d.difficulty
     FROM "CompetitionDive" d
     JOIN "CompetitionDiveList" l ON l.id=d."listId" AND l.position=0
     JOIN "Athlete" a ON a.id=d."athleteId"
     WHERE a."clubId"=$4 AND d."athleteId"=ANY($1::text[]) AND d."diveCode"=ANY($2::text[]) AND d.height::text=ANY($3::text[])
     ORDER BY d.position,d."createdAt"`,
    [athleteIds, diveCodes, heights, clubId]
  )).rows;
  const difficulties = new Map<string, number | null>();
  for (const row of rows) difficulties.set(`${row.athleteId}:${row.diveCode}:${row.height}`, row.difficulty);
  return turns.map((turn) => ({
    ...turn,
    difficulty: turn.difficulty ?? difficulties.get(`${turn.athleteId}:${turn.diveCode}:${turn.height}`) ?? null
  }));
}

export function rankCompetitionAthletes(turns: CompetitionTurn[], scores: CompetitionScore[]): RankedCompetitionAthlete[] {
  const scoresByTurn = new Map<number, CompetitionScore[]>();
  for (const score of scores) scoresByTurn.set(score.turnIndex, [...(scoresByTurn.get(score.turnIndex) ?? []), score]);
  const athletes = new Map<string, RankedCompetitionAthlete>();

  turns.forEach((turn, turnIndex) => {
    const athlete = athletes.get(turn.athleteId) ?? {
      athleteId: turn.athleteId,
      athleteName: turn.athleteName,
      totalPoints: 0,
      scoredPassages: 0,
      missingPassages: 0,
      passages: []
    };
    const turnScores = scoresByTurn.get(turnIndex) ?? [];
    const sortedScores = turnScores.map((score, index) => ({ score, index })).sort((a, b) => a.score.rating - b.score.rating || a.index - b.index);
    const removedPerSide = turnScores.length >= 7 ? 2 : turnScores.length >= 5 ? 1 : 0;
    const counted = sortedScores.slice(removedPerSide, sortedScores.length - removedPerSide);
    const discarded = [...sortedScores.slice(0, removedPerSide), ...sortedScores.slice(sortedScores.length - removedPerSide)];
    const countedScores = counted.map(({ score }) => score);
    const points = turn.difficulty != null && countedScores.length > 0
      ? turn.difficulty * countedScores.reduce((sum, score) => sum + score.rating, 0)
      : null;

    athlete.passages.push({
      turnIndex,
      turn,
      scores: turnScores,
      countedScores,
      discardedScores: discarded.map(({ score }) => score),
      points
    });
    if (points == null) athlete.missingPassages++;
    else {
      athlete.totalPoints += points;
      athlete.scoredPassages++;
    }
    athletes.set(turn.athleteId, athlete);
  });

  return Array.from(athletes.values()).sort((a, b) =>
    (b.missingPassages === 0 ? 1 : 0) - (a.missingPassages === 0 ? 1 : 0)
    || b.totalPoints - a.totalPoints
    || a.athleteName.localeCompare(b.athleteName, "fr")
  );
}
