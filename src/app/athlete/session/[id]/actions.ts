"use server";

import { revalidatePath } from "next/cache";
import { ATHLETE_SESSION_PREVIEW_EVENT, trackEvent } from "@/lib/monitoring";
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

const competitionEvaluationSchema = z.object({
  sessionId: z.string().min(1),
  ratings: z.array(z.object({ competitionDiveId: z.string().min(1), rating: z.number().int().min(1).max(5) })).min(1)
});

export async function saveCompetitionDiveEvaluation(input: z.infer<typeof competitionEvaluationSchema>) {
  const athlete = await getCurrentAthlete();
  if (!athlete) throw new Error("Aucun athlete actif trouve.");
  const data = competitionEvaluationSchema.parse(input);
  const session = await prisma.trainingSession.findFirst({
    where: {
      id: data.sessionId,
      status: "READY",
      OR: [
        { competitionEvaluationAtStart: true },
        { blocks: { some: { competitionEvaluation: true, assignments: { some: { athleteId: athlete.id } } } } }
      ],
      blocks: { some: { assignments: { some: { athleteId: athlete.id } } } }
    },
    select: { id: true, completions: { where: { athleteId: athlete.id, status: "IN_PROGRESS" }, select: { athleteId: true }, take: 1 } }
  });
  if (!session || session.completions.length === 0) throw new Error("Cette évaluation n’est pas activée pour cette séance.");
  const dives = await prisma.competitionDive.findMany({ where: { athleteId: athlete.id }, select: { id: true, diveCode: true, height: true } });
  const uniqueIds = new Set(data.ratings.map((entry) => entry.competitionDiveId));
  if (dives.length === 0 || uniqueIds.size !== dives.length || dives.some((dive) => !uniqueIds.has(dive.id))) {
    throw new Error("Une note doit être choisie pour chacun de tes plongeons de compétition.");
  }
  const previous = await prisma.athleteCompetitionDiveEvaluation.count({ where: { athleteId: athlete.id, sessionId: session.id, evaluator: "ATHLETE" } });
  if (previous > 0) throw new Error("Cette évaluation a déjà été enregistrée.");
  const evaluatedAt = new Date();
  await prisma.athleteCompetitionDiveEvaluation.createMany({
    data: dives.map((dive) => ({
      athleteId: athlete.id,
      sessionId: session.id,
      competitionDiveId: dive.id,
      diveCode: dive.diveCode,
      height: dive.height,
      rating: data.ratings.find((entry) => entry.competitionDiveId === dive.id)!.rating,
      evaluator: "ATHLETE",
      evaluatedAt
    }))
  });
  revalidatePath(`/athlete/session/${session.id}`);
  revalidatePath("/athlete/profile");
  revalidatePath("/athlete");
}

export async function saveAthleteDiveNote(sessionId: string, poolDiveId: string, note: string) {
  const athlete = await getCurrentAthlete();

  if (!athlete) {
    throw new Error("Aucun athlete actif trouve.");
  }

  const data = diveNoteSchema.parse({ poolDiveId, note });
  const readyBlocks = await getAssignedSessionBlocks(sessionId, athlete.id);
  const readyDiveIds = new Set(readyBlocks.flatMap((block) => block.poolTraining?.sections.flatMap((section) => section.dives.map((dive) => dive.id)) ?? []));
  if (!readyDiveIds.has(data.poolDiveId)) throw new Error("Ce plongeon n'est pas accessible a l'athlete courant.");

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
      status: "READY",
      blocks: { some: { assignments: { some: { athleteId: athlete.id } } } }
    },
    select: { date: true, status: true }
  });

  if (!session) {
    throw new Error("Cette seance n'est pas assignee a l'athlete courant.");
  }

  if (session.status !== "READY" || !isSessionStartAvailable(session.date)) {
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

export async function recordAthleteSessionPreview(sessionId: string) {
  const athlete = await getCurrentAthlete();

  if (!athlete) {
    throw new Error("Aucun athlete actif trouve.");
  }

  const session = await prisma.trainingSession.findFirst({
    where: {
      id: sessionId,
      status: "READY",
      blocks: { some: { assignments: { some: { athleteId: athlete.id } } } }
    },
    select: { title: true }
  });

  if (!session) {
    throw new Error("Cette seance n'est pas assignee a l'athlete courant.");
  }

  await trackEvent({
    type: ATHLETE_SESSION_PREVIEW_EVENT,
    message: `${athlete.user.firstName} ${athlete.user.lastName} a consulte l'apercu de la seance "${session.title}"`,
    clubId: athlete.clubId,
    userId: athlete.userId,
    metadata: { sessionId, sessionTitle: session.title }
  });
}

export async function openAthleteBlock(sessionId: string, blockId: string) {
  const athlete = await getCurrentAthlete();
  if (!athlete) throw new Error("Aucun athlete actif trouve.");

  const readyBlocks = await getAssignedSessionBlocks(sessionId, athlete.id);
  if (!readyBlocks.some((block) => block.id === blockId)) throw new Error("Ce bloc n'est pas accessible a l'athlete courant.");

  const block = await prisma.sessionBlock.findFirst({
    where: { id: blockId, sessionId, assignments: { some: { athleteId: athlete.id } } },
    select: { id: true }
  });
  if (!block) throw new Error("Ce bloc n'est pas accessible a l'athlete courant.");

  await prisma.athleteBlockTiming.upsert({
    where: { athleteId_blockId: { athleteId: athlete.id, blockId } },
    create: { athleteId: athlete.id, blockId, openedAt: new Date() },
    update: {}
  });
}

export async function closeAthleteBlock(sessionId: string, blockId: string) {
  const athlete = await getCurrentAthlete();
  if (!athlete) throw new Error("Aucun athlete actif trouve.");

  const readyBlocks = await getAssignedSessionBlocks(sessionId, athlete.id);
  if (!readyBlocks.some((block) => block.id === blockId)) throw new Error("Ce bloc n'est pas accessible a l'athlete courant.");

  await prisma.athleteBlockTiming.updateMany({
    where: { athleteId: athlete.id, blockId, block: { sessionId } },
    data: { closedAt: new Date() }
  });
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

  const evaluationSession = await prisma.trainingSession.findFirst({
    where: {
      id: payload.sessionId,
      OR: [
        { competitionEvaluationAtStart: true },
        { blocks: { some: { competitionEvaluation: true, assignments: { some: { athleteId: athlete.id } } } } }
      ]
    },
    select: { id: true }
  });
  if (evaluationSession) {
    const [diveCount, evaluationCount] = await Promise.all([
      prisma.competitionDive.count({ where: { athleteId: athlete.id } }),
      prisma.athleteCompetitionDiveEvaluation.count({ where: { athleteId: athlete.id, sessionId: payload.sessionId, evaluator: "ATHLETE" } })
    ]);
    if (diveCount > 0 && evaluationCount !== diveCount) throw new Error("Réponds à tous les plongeons de compétition avant de terminer.");
  }

  await assertSessionStartAvailable(payload.sessionId);

  await persistAthleteProgress(payload, athlete.id, assignedBlocks, async (tx) => {
    const completedAt = new Date();
    await tx.athleteBlockTiming.updateMany({
      where: { athleteId: athlete.id, block: { sessionId: payload.sessionId }, closedAt: null },
      data: { closedAt: completedAt }
    });
    await tx.athleteSessionCompletion.upsert({
      where: { athleteId_sessionId: { athleteId: athlete.id, sessionId: payload.sessionId } },
      create: {
        athleteId: athlete.id,
        sessionId: payload.sessionId,
        startedAt: new Date(),
        completedAt,
        status: "COMPLETED",
        rating: payload.sessionFeedback?.rating?.trim() || null,
        note: payload.sessionFeedback?.note?.trim() || null
      },
      update: {
        completedAt,
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
    select: { date: true, status: true }
  });

  if (!session || session.status !== "READY" || !isSessionStartAvailable(session.date)) {
    throw new Error(SESSION_NOT_STARTED_MESSAGE);
  }
}
