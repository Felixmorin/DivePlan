"use server";

import { revalidatePath } from "next/cache";
import { trackEvent } from "@/lib/monitoring";
import { prisma } from "@/lib/prisma";
import { getCurrentAthlete } from "@/lib/athlete-session";
import { getAssignedSessionBlocks, persistAthleteProgress, type AthleteProgressPayload } from "@/lib/athlete-progress";
import { isSessionStartAvailable, SESSION_NOT_STARTED_MESSAGE } from "@/lib/session-availability";
import { z } from "zod";

export type CompleteSessionPayload = AthleteProgressPayload;

export type SaveAthleteProgressPayload = CompleteSessionPayload;

const diveNoteSchema = z.object({
  poolDiveId: z.string().min(1),
  note: z.string().trim().max(2000)
});

export async function saveAthleteDiveNote(sessionId: string, poolDiveId: string, note: string) {
  const athlete = await getCurrentAthlete();

  if (!athlete) {
    throw new Error("Aucun athlete actif trouve.");
  }

  const data = diveNoteSchema.parse({ poolDiveId, note });
  const dive = await prisma.poolDive.findFirst({
    where: {
      id: data.poolDiveId,
      poolSection: { poolTraining: { block: { assignments: { some: { athleteId: athlete.id } } } } }
    },
    select: { id: true }
  });

  if (!dive) {
    throw new Error("Ce plongeon n'est pas accessible a l'athlete courant.");
  }

  if (!data.note) {
    await prisma.athleteDiveNote.deleteMany({ where: { athleteId: athlete.id, poolDiveId: data.poolDiveId } });
  } else {
    await prisma.athleteDiveNote.upsert({
      where: { athleteId_poolDiveId: { athleteId: athlete.id, poolDiveId: data.poolDiveId } },
      create: { athleteId: athlete.id, poolDiveId: data.poolDiveId, note: data.note },
      update: { note: data.note }
    });
  }

  revalidatePath(`/athlete/session/${sessionId}`);
}

export async function startAthleteSession(sessionId: string) {
  const athlete = await getCurrentAthlete();

  if (!athlete) {
    throw new Error("Aucun athlete actif trouve.");
  }

  const session = await prisma.trainingSession.findFirst({
    where: {
      id: sessionId,
      blocks: { some: { assignments: { some: { athleteId: athlete.id } } } }
    },
    select: { date: true }
  });

  if (!session) {
    throw new Error("Cette seance n'est pas assignee a l'athlete courant.");
  }

  if (!isSessionStartAvailable(session.date)) {
    throw new Error(SESSION_NOT_STARTED_MESSAGE);
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

export async function saveAthleteProgress(payload: SaveAthleteProgressPayload) {
  const athlete = await getCurrentAthlete();

  if (!athlete) {
    throw new Error("Aucun athlete actif trouve.");
  }

  const assignedBlocks = await getAssignedSessionBlocks(payload.sessionId, athlete.id);

  if (assignedBlocks.length === 0) {
    throw new Error("Cette seance n'est pas assignee a l'athlete courant.");
  }

  await assertSessionStartAvailable(payload.sessionId);

  await persistAthleteProgress(payload, athlete.id, assignedBlocks);

  revalidatePath("/athlete");
  revalidatePath("/athlete/progress");
  revalidatePath(`/athlete/session/${payload.sessionId}`);
}

export async function completeAthleteSession(payload: CompleteSessionPayload) {
  const athlete = await getCurrentAthlete();

  if (!athlete) {
    throw new Error("Aucun athlete actif trouve.");
  }

  const assignedBlocks = await getAssignedSessionBlocks(payload.sessionId, athlete.id);

  if (assignedBlocks.length === 0) {
    throw new Error("Cette seance n'est pas assignee a l'athlete courant.");
  }

  await assertSessionStartAvailable(payload.sessionId);

  await persistAthleteProgress(payload, athlete.id, assignedBlocks, async (tx) => {
    await tx.athleteSessionCompletion.upsert({
      where: { athleteId_sessionId: { athleteId: athlete.id, sessionId: payload.sessionId } },
      create: {
        athleteId: athlete.id,
        sessionId: payload.sessionId,
        startedAt: new Date(),
        completedAt: new Date(),
        status: "COMPLETED",
        rating: payload.sessionFeedback?.rating?.trim() || null,
        note: payload.sessionFeedback?.note?.trim() || null
      },
      update: {
        completedAt: new Date(),
        status: "COMPLETED",
        rating: payload.sessionFeedback?.rating?.trim() || null,
        note: payload.sessionFeedback?.note?.trim() || null
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
}

async function assertSessionStartAvailable(sessionId: string) {
  const session = await prisma.trainingSession.findUnique({
    where: { id: sessionId },
    select: { date: true }
  });

  if (!session || !isSessionStartAvailable(session.date)) {
    throw new Error(SESSION_NOT_STARTED_MESSAGE);
  }
}
