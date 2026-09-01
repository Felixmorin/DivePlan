"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { trackEvent } from "@/lib/monitoring";
import { prisma } from "@/lib/prisma";
import { getCurrentAthlete } from "@/lib/athlete-session";

export type CompleteSessionPayload = {
  sessionId: string;
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

export async function startAthleteSession(sessionId: string) {
  const athlete = await getCurrentAthlete();

  if (!athlete) {
    throw new Error("Aucun athlete actif trouve.");
  }

  const assignedBlocks = await prisma.sessionBlock.count({
    where: {
      sessionId,
      assignments: { some: { athleteId: athlete.id } }
    }
  });

  if (assignedBlocks === 0) {
    throw new Error("Cette seance n'est pas assignee a l'athlete courant.");
  }

  await prisma.athleteSessionCompletion.upsert({
    where: { athleteId_sessionId: { athleteId: athlete.id, sessionId } },
    create: {
      athleteId: athlete.id,
      sessionId,
      startedAt: new Date(),
      status: "IN_PROGRESS"
    },
    update: {
      startedAt: new Date(),
      status: "IN_PROGRESS"
    }
  });

  await trackEvent({
    type: "session.started",
    message: `${athlete.user.firstName} ${athlete.user.lastName} a demarre une seance`,
    clubId: athlete.clubId,
    userId: athlete.userId,
    metadata: { sessionId }
  });

  revalidatePath("/athlete");
  revalidatePath(`/athlete/session/${sessionId}`);
}

export async function completeAthleteSession(payload: CompleteSessionPayload) {
  const athlete = await getCurrentAthlete();

  if (!athlete) {
    throw new Error("Aucun athlete actif trouve.");
  }

  const assignedBlocks = await prisma.sessionBlock.findMany({
    where: {
      sessionId: payload.sessionId,
      assignments: { some: { athleteId: athlete.id } }
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

  if (assignedBlocks.length === 0) {
    throw new Error("Cette seance n'est pas assignee a l'athlete courant.");
  }

  const validExerciseIds = new Set(assignedBlocks.flatMap((block) => block.drylandExercises.map((exercise) => exercise.exerciseId)));
  const validDiveIds = new Set(assignedBlocks.flatMap((block) => block.poolTraining?.sections.flatMap((section) => section.dives.map((dive) => dive.id)) ?? []));
  const repetitionsByDiveId = new Map(
    assignedBlocks.flatMap((block) => block.poolTraining?.sections.flatMap((section) => section.dives.map((dive) => [dive.id, dive.repetitions] as const)) ?? [])
  );

  const exerciseLogs = payload.exercises
    .filter((exercise) => validExerciseIds.has(exercise.exerciseId))
    .map((exercise) => ({
      athleteId: athlete.id,
      sessionId: payload.sessionId,
      exerciseId: exercise.exerciseId,
      completed: exercise.completed,
      rating: normalizeText(exercise.rating),
      note: normalizeText(exercise.note)
    }));

  const diveLogs = payload.dives
    .filter((dive) => validDiveIds.has(dive.poolDiveId))
    .map((dive) => ({
      athleteId: athlete.id,
      sessionId: payload.sessionId,
      poolDiveId: dive.poolDiveId,
      repetitionsCompleted: Math.max(0, Math.min(dive.repetitionsCompleted, repetitionsByDiveId.get(dive.poolDiveId) ?? 0)),
      rating: normalizeText(dive.rating) ?? "moyen",
      note: normalizeText(dive.note)
    }));

  await prisma.$transaction(async (tx) => {
    await tx.athleteExerciseLog.deleteMany({
      where: {
        athleteId: athlete.id,
        sessionId: payload.sessionId,
        exerciseId: { in: Array.from(validExerciseIds) }
      }
    });

    await tx.athleteDiveLog.deleteMany({
      where: {
        athleteId: athlete.id,
        sessionId: payload.sessionId,
        poolDiveId: { in: Array.from(validDiveIds) }
      }
    });

    if (exerciseLogs.length > 0) {
      await tx.athleteExerciseLog.createMany({ data: exerciseLogs });
    }

    if (diveLogs.length > 0) {
      await tx.athleteDiveLog.createMany({ data: diveLogs });
    }

    await tx.athleteSessionCompletion.upsert({
      where: { athleteId_sessionId: { athleteId: athlete.id, sessionId: payload.sessionId } },
      create: {
        athleteId: athlete.id,
        sessionId: payload.sessionId,
        startedAt: new Date(),
        completedAt: new Date(),
        status: "COMPLETED"
      },
      update: {
        completedAt: new Date(),
        status: "COMPLETED"
      }
    });
  });

  await trackEvent({
    type: "session.completed",
    message: `${athlete.user.firstName} ${athlete.user.lastName} a complete une seance`,
    clubId: athlete.clubId,
    userId: athlete.userId,
    metadata: { sessionId: payload.sessionId }
  });

  revalidatePath("/athlete");
  revalidatePath("/athlete/progress");
  revalidatePath(`/athlete/session/${payload.sessionId}`);
  redirect("/athlete/progress");
}

function normalizeText(value: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
