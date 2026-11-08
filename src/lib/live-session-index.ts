import type { LiveProgress } from "./live-session";

type DrylandExercise = {
  exerciseId: string;
  sets?: number | null;
  reps?: number | null;
};

/** Indexes live logs once per progress snapshot so UI rerenders do not rescan every row. */
export function indexLiveSessionProgress(progress: Pick<LiveProgress, "diveLogs" | "exerciseLogs">) {
  const repetitionsByAthlete = new Map<string, Map<string, number>>();
  for (const log of progress.diveLogs) {
    let byDive = repetitionsByAthlete.get(log.athleteId);
    if (!byDive) {
      byDive = new Map();
      repetitionsByAthlete.set(log.athleteId, byDive);
    }
    byDive.set(log.poolDiveId, (byDive.get(log.poolDiveId) ?? 0) + log.repetitionsCompleted);
  }

  const completedByAthlete = new Map<string, Map<string, number>>();
  for (const log of progress.exerciseLogs) {
    if (!log.completed) continue;
    let byExercise = completedByAthlete.get(log.athleteId);
    if (!byExercise) {
      byExercise = new Map();
      completedByAthlete.set(log.athleteId, byExercise);
    }
    byExercise.set(log.exerciseId, (byExercise.get(log.exerciseId) ?? 0) + 1);
  }

  function countCompletedExercise(exerciseId: string, athleteIds: ReadonlySet<string>) {
    let count = 0;
    for (const athleteId of athleteIds) count += completedByAthlete.get(athleteId)?.get(exerciseId) ?? 0;
    return count;
  }

  return {
    sumDiveRepetitions(athleteIds: ReadonlySet<string>, diveIds: ReadonlySet<string>) {
      let total = 0;
      for (const athleteId of athleteIds) {
        const byDive = repetitionsByAthlete.get(athleteId);
        if (!byDive) continue;
        for (const diveId of diveIds) total += byDive.get(diveId) ?? 0;
      }
      return total;
    },
    countCompletedExercise,
    completedExerciseUnits(athleteIds: ReadonlySet<string>, exercises: readonly DrylandExercise[]) {
      let total = 0;
      const counted = new Set<string>();
      for (const exercise of exercises) {
        // The old log scan used find(), so duplicate exercise IDs used the first plan entry.
        if (counted.has(exercise.exerciseId)) continue;
        counted.add(exercise.exerciseId);
        total += countCompletedExercise(exercise.exerciseId, athleteIds) * (exercise.sets ?? 1) * (exercise.reps ?? 1);
      }
      return total;
    }
  };
}
