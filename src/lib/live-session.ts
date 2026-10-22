import type { CoachSession } from "./coach-session";

export type LiveProgress = {
  status: string;
  planVersion: string;
  absences: Array<{ athleteId: string }>;
  diveLogs: Array<{ athleteId: string; poolDiveId: string; repetitionsCompleted: number }>;
  exerciseLogs: Array<{ athleteId: string; exerciseId: string; completed: boolean }>;
};

/** Explicit allowlist: never serialize user records, photos, notes or log metadata. */
export function liveSessionForClient(session: CoachSession) {
  return {
    id: session.id,
    date: session.date instanceof Date ? session.date.toISOString() : session.date,
    week: { group: { name: session.week.group.name } },
    absences: session.absences.map(({ athleteId }) => ({ athleteId })),
    diveLogs: session.diveLogs.map(({ athleteId, poolDiveId, repetitionsCompleted }) => ({ athleteId, poolDiveId, repetitionsCompleted })),
    exerciseLogs: session.exerciseLogs.map(({ athleteId, exerciseId, completed }) => ({ athleteId, exerciseId, completed })),
    blocks: session.blocks.map((block) => ({
      id: block.id, type: block.type, title: block.title, position: block.position,
      assignments: block.assignments.map(({ athleteId }) => ({ athleteId })),
      drylandExercises: block.drylandExercises.map(({ exerciseId, sets, reps, duration, exercise }) => ({
        exerciseId, sets, reps, duration, exercise: { name: exercise.name }
      })),
      poolTraining: block.poolTraining ? { sections: block.poolTraining.sections.map((section) => ({
        id: section.id, height: section.height, label: section.label,
        dives: section.dives.map(({ id, diveCode, repetitions }) => ({ id, diveCode, repetitions }))
      })) } : null
    }))
  };
}

export type LiveSession = ReturnType<typeof liveSessionForClient>;
