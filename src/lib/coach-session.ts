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
    const poolReps = completion.session.diveLogs
      .filter((log) => log.athleteId === athleteId)
      .reduce((sum, log) => sum + log.repetitionsCompleted, 0);
    const current = totals.get(athleteId) ?? { reps: 0, trainings: 0 };
    totals.set(athleteId, { reps: current.reps + poolReps, trainings: current.trainings + 1 });
  }

  return new Map(Array.from(totals, ([athleteId, total]) => [athleteId, Math.round(total.reps / total.trainings)]));
}

export async function getAthleteAverageGoldenRepsByTraining(athleteIds: string[], excludedSessionId: string) {
  if (athleteIds.length === 0) return new Map<string, number>();

  const completions = await prisma.athleteSessionCompletion.findMany({
    where: { athleteId: { in: athleteIds }, sessionId: { not: excludedSessionId }, status: "COMPLETED" },
    select: {
      athleteId: true,
      session: {
        select: {
          diveLogs: {
            where: { athleteId: { in: athleteIds } },
            select: { athleteId: true, goldenRepetitions: true }
          }
        }
      }
    }
  });

  const totals = new Map<string, { reps: number; trainings: number }>();
  for (const completion of completions) {
    const reps = completion.session.diveLogs
      .filter((log) => log.athleteId === completion.athleteId)
      .reduce((sum, log) => sum + log.goldenRepetitions, 0);
    const current = totals.get(completion.athleteId) ?? { reps: 0, trainings: 0 };
    totals.set(completion.athleteId, { reps: current.reps + reps, trainings: current.trainings + 1 });
  }

  return new Map(Array.from(totals, ([athleteId, total]) => [athleteId, Number((total.reps / total.trainings).toFixed(1))]));
}
