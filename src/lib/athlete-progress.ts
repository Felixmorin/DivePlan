import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type AthleteProgressPayload = {
  sessionId: string;
  sessionFeedback?: {
    rating: string | null;
    note: string | null;
  };
  exercises: Array<{
    exerciseId: string;
    completed: boolean;
    rating: string | null;
    note: string | null;
  }>;
  dives: Array<{
    poolDiveId: string;
    repetitionsCompleted: number;
    rating: string | null;
    note: string | null;
  }>;
};

type AssignedSessionBlock = Prisma.SessionBlockGetPayload<{
  include: {
    drylandExercises: true;
    poolTraining: {
      include: {
        sections: {
          include: {
            dives: true;
          };
        };
      };
    };
  };
}>;

export async function getAssignedSessionBlocks(sessionId: string, athleteId: string) {
  return prisma.sessionBlock.findMany({
    where: {
      sessionId,
      assignments: { some: { athleteId } }
    },
    include: {
      drylandExercises: true,
      poolTraining: {
        include: {
          sections: { include: { dives: true } }
        }
      }
    }
  });
}

export async function persistAthleteProgress(
  payload: AthleteProgressPayload,
  athleteId: string,
  assignedBlocks: AssignedSessionBlock[],
  afterPersist?: (tx: Prisma.TransactionClient) => Promise<void>
) {
  const validExerciseIds = new Set(assignedBlocks.flatMap((block) => block.drylandExercises.map((exercise) => exercise.exerciseId)));
  const validDiveIds = new Set(assignedBlocks.flatMap((block) => block.poolTraining?.sections.flatMap((section) => section.dives.map((dive) => dive.id)) ?? []));
  const repetitionsByDiveId = new Map(
    assignedBlocks.flatMap((block) => block.poolTraining?.sections.flatMap((section) => section.dives.map((dive) => [dive.id, dive.repetitions] as const)) ?? [])
  );
  const sessionFeedback =
    payload.sessionFeedback === undefined
      ? undefined
      : {
          rating: normalizeText(payload.sessionFeedback.rating),
          note: normalizeText(payload.sessionFeedback.note)
        };

  const exerciseLogs = payload.exercises
    .filter((exercise) => validExerciseIds.has(exercise.exerciseId))
    .map((exercise) => ({
      athleteId,
      sessionId: payload.sessionId,
      exerciseId: exercise.exerciseId,
      completed: exercise.completed,
      rating: normalizeText(exercise.rating),
      note: normalizeText(exercise.note)
    }));

  const diveLogs = payload.dives
    .filter((dive) => validDiveIds.has(dive.poolDiveId))
    .map((dive) => ({
      athleteId,
      sessionId: payload.sessionId,
      poolDiveId: dive.poolDiveId,
      repetitionsCompleted: Math.max(0, Math.min(dive.repetitionsCompleted, repetitionsByDiveId.get(dive.poolDiveId) ?? 0)),
      rating: normalizeText(dive.rating) ?? "moyen",
      note: normalizeText(dive.note)
    }));

  await prisma.$transaction(async (tx) => {
    for (const exercise of exerciseLogs) {
      await tx.athleteExerciseLog.upsert({
        where: {
          athleteId_sessionId_exerciseId: {
            athleteId: exercise.athleteId,
            sessionId: exercise.sessionId,
            exerciseId: exercise.exerciseId
          }
        },
        create: exercise,
        update: {
          completed: exercise.completed,
          rating: exercise.rating,
          note: exercise.note
        }
      });
    }

    for (const dive of diveLogs) {
      await tx.athleteDiveLog.upsert({
        where: {
          athleteId_sessionId_poolDiveId: {
            athleteId: dive.athleteId,
            sessionId: dive.sessionId,
            poolDiveId: dive.poolDiveId
          }
        },
        create: dive,
        update: {
          repetitionsCompleted: dive.repetitionsCompleted,
          rating: dive.rating,
          note: dive.note,
          timestamp: new Date()
        }
      });
    }

    const sessionFeedbackCreate = sessionFeedback
      ? {
          rating: sessionFeedback.rating,
          note: sessionFeedback.note
        }
      : {};
    const sessionFeedbackUpdate = sessionFeedback
      ? {
          rating: sessionFeedback.rating,
          note: sessionFeedback.note
        }
      : {};

    await tx.athleteSessionCompletion.upsert({
      where: { athleteId_sessionId: { athleteId, sessionId: payload.sessionId } },
      create: {
        athleteId,
        sessionId: payload.sessionId,
        startedAt: new Date(),
        status: "IN_PROGRESS",
        ...sessionFeedbackCreate
      },
      update: {
        startedAt: new Date(),
        ...sessionFeedbackUpdate
      }
    });

    await afterPersist?.(tx);
  });
}

function normalizeText(value: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
