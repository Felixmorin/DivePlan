"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { trackEvent } from "@/lib/monitoring";
import { prisma } from "@/lib/prisma";
import { getCurrentAthlete } from "@/lib/athlete-session";
import { getAssignedSessionBlocks, persistAthleteProgress, type AthleteProgressPayload } from "@/lib/athlete-progress";
import { isSessionStartAvailable, SESSION_NOT_STARTED_MESSAGE } from "@/lib/session-availability";

export type CompleteSessionPayload = AthleteProgressPayload;

export type SaveAthleteProgressPayload = CompleteSessionPayload;

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
  redirect("/athlete/progress");
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
