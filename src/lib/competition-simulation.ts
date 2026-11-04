export type CompetitionTurn = { athleteId: string; athleteName: string; diveCode: string; diveName: string; height: string; difficulty?: number | null };
export type CompetitionDiveRow = CompetitionTurn & { position: number };

export function buildCompetitionTurns(athletes: Array<{ id: string; name: string }>, dives: CompetitionDiveRow[]): CompetitionTurn[] {
  const orderedAthletes = [...athletes].sort((a, b) => a.name.localeCompare(b.name));
  const byAthlete = new Map(orderedAthletes.map((athlete) => [athlete.id, [] as CompetitionDiveRow[]]));
  for (const dive of dives) byAthlete.get(dive.athleteId)?.push(dive);
  for (const rows of byAthlete.values()) rows.sort((a, b) => a.position - b.position);
  const turns: CompetitionTurn[] = [];
  const maxDives = Math.max(0, ...Array.from(byAthlete.values(), (rows) => rows.length));
  for (let round = 0; round < maxDives; round++) {
    for (const athlete of orderedAthletes) {
      const dive = byAthlete.get(athlete.id)?.[round];
      if (dive) turns.push({ athleteId: athlete.id, athleteName: athlete.name, diveCode: dive.diveCode, diveName: dive.diveName, height: dive.height, difficulty: dive.difficulty ?? null });
    }
  }
  return turns;
}

export function eligibleSimulationJudges(turns: CompetitionTurn[], turnIndex: number): string[] {
  const turn = turns[turnIndex];
  if (!turn || new Set(turns.map((item) => item.athleteId)).size < 3) return [];
  const next = turns[(turnIndex + 1) % turns.length];
  return [...new Set(turns.map((item) => item.athleteId))].filter((athleteId) => athleteId !== turn.athleteId && athleteId !== next.athleteId);
}
