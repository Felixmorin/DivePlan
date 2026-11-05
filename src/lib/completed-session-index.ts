export type CompletedSession = {
  completions: Array<{ athleteId: string; status: string; note: string | null; rating: string | null }>;
  diveLogs: Array<{ athleteId: string; poolDiveId: string; repetitionsCompleted: number }>;
  exerciseLogs: Array<{ athleteId: string; exerciseId: string; completed: boolean }>;
};

export function indexCompletedSession(session: CompletedSession) {
  const completionByAthlete = new Map<string, CompletedSession["completions"][number]>();
  const diveLogsByPoolDive = new Map<string, CompletedSession["diveLogs"]>();
  const diveRepetitionsByAthlete = new Map<string, Map<string, number>>();
  const exerciseLogsByExercise = new Map<string, CompletedSession["exerciseLogs"]>();
  const completedExerciseIdsByAthlete = new Map<string, Set<string>>();

  for (const completion of session.completions) {
    if (!completionByAthlete.has(completion.athleteId)) completionByAthlete.set(completion.athleteId, completion);
  }

  for (const log of session.diveLogs) {
    const diveLogs = diveLogsByPoolDive.get(log.poolDiveId) ?? [];
    diveLogs.push(log);
    diveLogsByPoolDive.set(log.poolDiveId, diveLogs);

    const athleteRepetitions = diveRepetitionsByAthlete.get(log.athleteId) ?? new Map<string, number>();
    athleteRepetitions.set(log.poolDiveId, (athleteRepetitions.get(log.poolDiveId) ?? 0) + log.repetitionsCompleted);
    diveRepetitionsByAthlete.set(log.athleteId, athleteRepetitions);
  }

  for (const log of session.exerciseLogs) {
    const exerciseLogs = exerciseLogsByExercise.get(log.exerciseId) ?? [];
    exerciseLogs.push(log);
    exerciseLogsByExercise.set(log.exerciseId, exerciseLogs);

    if (log.completed) {
      const completedIds = completedExerciseIdsByAthlete.get(log.athleteId) ?? new Set<string>();
      completedIds.add(log.exerciseId);
      completedExerciseIdsByAthlete.set(log.athleteId, completedIds);
    }
  }

  return {
    completionByAthlete,
    diveLogsByPoolDive,
    diveRepetitionsByAthlete,
    exerciseLogsByExercise,
    completedExerciseIdsByAthlete
  };
}
