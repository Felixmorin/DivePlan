import type { CoachSession } from "./coach-session";

export type LiveProgress = {
  status: string;
  planVersion: string;
  absences: Array<{ athleteId: string }>;
  diveLogs: Array<{ athleteId: string; poolDiveId: string; repetitionsCompleted: number }>;
  exerciseLogs: Array<{ athleteId: string; exerciseId: string; completed: boolean }>;
};

/** Plan only: progress is supplied once, through initialProgress and subsequent polls. */
export function liveSessionForClient(session: CoachSession) {
  return {
    id: session.id,
    date: session.date instanceof Date ? session.date.toISOString() : session.date,
    week: { group: { name: session.week.group.name } },
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

export type LivePlan = ReturnType<typeof liveSessionForClient>;
export type LiveSession = LivePlan & Pick<LiveProgress, "absences" | "diveLogs" | "exerciseLogs">;
