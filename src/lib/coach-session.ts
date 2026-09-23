import { notFound } from "next/navigation";
import { requireCoach } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

export async function getCoachSession(sessionId: string) {
  const { clubId } = await requireCoach();
  const session = await prisma.trainingSession.findFirst({
    where: {
      id: sessionId,
      week: { clubId }
    },
    include: {
      week: { include: { group: true } },
      completions: { include: { athlete: { include: { user: true } } } },
      absences: { select: { athleteId: true } },
      diveLogs: { include: { athlete: { include: { user: true } }, poolDive: true } },
      exerciseLogs: { include: { athlete: { include: { user: true } }, exercise: true } },
      blocks: {
        orderBy: { position: "asc" },
        include: {
          assignments: { include: { athlete: { include: { user: true } } } },
          drylandExercises: { orderBy: { order: "asc" }, include: { exercise: true } },
          poolTraining: {
            include: {
              sections: {
                orderBy: { order: "asc" },
                include: { dives: { orderBy: { order: "asc" } } }
              }
            }
          }
        }
      }
    }
  });

  if (!session) {
    notFound();
  }

  return session;
}

export async function getAthleteAverageRepsByTraining(athleteIds: string[], excludedSessionId: string) {
  if (athleteIds.length === 0) return new Map<string, number>();

  const completions = await prisma.athleteSessionCompletion.findMany({
    where: {
      athleteId: { in: athleteIds },
      sessionId: { not: excludedSessionId },
      status: "COMPLETED"
    },
    select: {
      athleteId: true,
      session: {
        select: {
          blocks: {
            select: {
              assignments: { select: { athleteId: true } },
              drylandExercises: { select: { exerciseId: true, sets: true, reps: true } },
              poolTraining: {
                select: {
                  sections: {
                    select: { dives: { select: { repetitions: true } } }
                  }
                }
              }
            }
          },
          exerciseLogs: {
            where: { athleteId: { in: athleteIds }, completed: true },
            select: { athleteId: true, exerciseId: true }
          },
          diveLogs: {
            where: { athleteId: { in: athleteIds } },
            select: { athleteId: true, repetitionsCompleted: true }
          }
        }
      }
    }
  });

  const totals = new Map<string, { reps: number; trainings: number }>();

  for (const completion of completions) {
    const athleteId = completion.athleteId;
    const exerciseReps = new Map<string, number>();

    for (const block of completion.session.blocks) {
      if (!block.assignments.some((assignment) => assignment.athleteId === athleteId)) continue;

      for (const item of block.drylandExercises) {
        exerciseReps.set(item.exerciseId, (exerciseReps.get(item.exerciseId) ?? 0) + (item.sets ?? 1) * (item.reps ?? 0));
      }
    }

    const drylandReps = completion.session.exerciseLogs
      .filter((log) => log.athleteId === athleteId)
      .reduce((sum, log) => sum + (exerciseReps.get(log.exerciseId) ?? 0), 0);
    const poolReps = completion.session.diveLogs
      .filter((log) => log.athleteId === athleteId)
      .reduce((sum, log) => sum + log.repetitionsCompleted, 0);
    const current = totals.get(athleteId) ?? { reps: 0, trainings: 0 };
    totals.set(athleteId, { reps: current.reps + drylandReps + poolReps, trainings: current.trainings + 1 });
  }

  return new Map(Array.from(totals, ([athleteId, total]) => [athleteId, Math.round(total.reps / total.trainings)]));
}
