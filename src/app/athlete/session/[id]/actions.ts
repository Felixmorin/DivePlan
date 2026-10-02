"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { ATHLETE_SESSION_PREVIEW_EVENT, trackEvent } from "@/lib/monitoring";
import { query, withTransaction } from "@/lib/db";
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
  const sessionResult = await query<{ id: string }>(
    `SELECT s.id FROM "TrainingSession" s WHERE s.id = $1 AND s.status = 'READY'
     AND EXISTS (SELECT 1 FROM "SessionBlock" b JOIN "SessionBlockAssignment" a ON a."sessionBlockId" = b.id WHERE b."sessionId" = s.id AND a."athleteId" = $2)
     AND (s."competitionEvaluationAtStart" = true OR EXISTS (SELECT 1 FROM "SessionBlock" b JOIN "SessionBlockAssignment" a ON a."sessionBlockId" = b.id WHERE b."sessionId" = s.id AND b."competitionEvaluation" = true AND a."athleteId" = $2))
     AND EXISTS (SELECT 1 FROM "AthleteSessionCompletion" c WHERE c."sessionId" = s.id AND c."athleteId" = $2 AND c.status = 'IN_PROGRESS') LIMIT 1`, [data.sessionId, athlete.id]
  );
  const session = sessionResult.rows[0];
  if (!session) throw new Error("Cette évaluation n’est pas activée pour cette séance.");
  const divesResult = await query<{ id: string; diveCode: string; height: string }>(`SELECT id, "diveCode", height FROM "CompetitionDive" WHERE "athleteId" = $1`, [athlete.id]);
  const dives = divesResult.rows;
  const uniqueIds = new Set(data.ratings.map((entry) => entry.competitionDiveId));
  if (dives.length === 0 || uniqueIds.size !== dives.length || dives.some((dive) => !uniqueIds.has(dive.id))) {
    throw new Error("Une note doit être choisie pour chacun de tes plongeons de compétition.");
  }
  const previous = await query(`SELECT 1 FROM "AthleteCompetitionDiveEvaluation" WHERE "athleteId" = $1 AND "sessionId" = $2 AND evaluator = 'ATHLETE' LIMIT 1`, [athlete.id, session.id]);
  if (previous.rowCount) throw new Error("Cette évaluation a déjà été enregistrée.");
  const evaluatedAt = new Date();
  await withTransaction(async (tx) => {
    for (const dive of dives) {
      await tx.query(
        `INSERT INTO "AthleteCompetitionDiveEvaluation" (id, "athleteId", "sessionId", "competitionDiveId", "diveCode", height, rating, evaluator, "evaluatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,'ATHLETE',$8)`,
        [randomUUID(), athlete.id, session.id, dive.id, dive.diveCode, dive.height, data.ratings.find((entry) => entry.competitionDiveId === dive.id)!.rating, evaluatedAt]
      );
    }
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

  const dive = await query(
    `SELECT d.id FROM "PoolDive" d JOIN "PoolSection" s ON s.id = d."poolSectionId" JOIN "PoolTraining" p ON p."blockId" = s."poolTrainingId"
     JOIN "SessionBlockAssignment" a ON a."sessionBlockId" = p."blockId" WHERE d.id = $1 AND a."athleteId" = $2 LIMIT 1`, [data.poolDiveId, athlete.id]
  );

  if (!dive) {
    throw new Error("Ce plongeon n'est pas accessible a l'athlete courant.");
  }

  if (!data.note) {
    await query(`DELETE FROM "AthleteDiveNote" WHERE "athleteId" = $1 AND "poolDiveId" = $2`, [athlete.id, data.poolDiveId]);
  } else {
    await query(`INSERT INTO "AthleteDiveNote" ("athleteId", "poolDiveId", note) VALUES ($1, $2, $3)
      ON CONFLICT ("athleteId", "poolDiveId") DO UPDATE SET note = EXCLUDED.note, "updatedAt" = now()`, [athlete.id, data.poolDiveId, data.note]);
  }

  revalidatePath(`/athlete/session/${sessionId}`);
}

export async function startAthleteSession(sessionId: string) {
  const athlete = await getCurrentAthlete();

  if (!athlete) {
    throw new Error("Aucun athlete actif trouve.");
  }

  const sessionResult = await query<{ date: Date; status: string }>(
    `SELECT s.date, s.status FROM "TrainingSession" s WHERE s.id = $1 AND s.status = 'READY' AND EXISTS (
       SELECT 1 FROM "SessionBlock" b JOIN "SessionBlockAssignment" a ON a."sessionBlockId" = b.id WHERE b."sessionId" = s.id AND a."athleteId" = $2
     ) LIMIT 1`, [sessionId, athlete.id]
  );
  const session = sessionResult.rows[0];

  if (!session) {
    throw new Error("Cette seance n'est pas assignee a l'athlete courant.");
  }

  if (session.status !== "READY" || !isSessionStartAvailable(session.date)) {
    throw new Error(SESSION_NOT_STARTED_MESSAGE);
  }

  await query(`INSERT INTO "AthleteSessionCompletion" ("athleteId", "sessionId", "startedAt", status) VALUES ($1,$2,$3,'IN_PROGRESS')
    ON CONFLICT ("athleteId", "sessionId") DO UPDATE SET "startedAt" = EXCLUDED."startedAt", status = 'IN_PROGRESS'`, [athlete.id, sessionId, new Date()]);

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

  const sessionResult = await query<{ title: string }>(
    `SELECT s.title FROM "TrainingSession" s WHERE s.id = $1 AND s.status = 'READY' AND EXISTS (
       SELECT 1 FROM "SessionBlock" b JOIN "SessionBlockAssignment" a ON a."sessionBlockId" = b.id WHERE b."sessionId" = s.id AND a."athleteId" = $2
     ) LIMIT 1`, [sessionId, athlete.id]
  );
  const session = sessionResult.rows[0];

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

  const block = await query(`SELECT b.id FROM "SessionBlock" b JOIN "SessionBlockAssignment" a ON a."sessionBlockId" = b.id WHERE b.id = $1 AND b."sessionId" = $2 AND a."athleteId" = $3 LIMIT 1`, [blockId, sessionId, athlete.id]);
  if (!block) throw new Error("Ce bloc n'est pas accessible a l'athlete courant.");

  await query(`INSERT INTO "AthleteBlockTiming" ("athleteId", "blockId", "openedAt") VALUES ($1,$2,$3) ON CONFLICT ("athleteId", "blockId") DO NOTHING`, [athlete.id, blockId, new Date()]);
}

export async function closeAthleteBlock(sessionId: string, blockId: string) {
  const athlete = await getCurrentAthlete();
  if (!athlete) throw new Error("Aucun athlete actif trouve.");

  const readyBlocks = await getAssignedSessionBlocks(sessionId, athlete.id);
  if (!readyBlocks.some((block) => block.id === blockId)) throw new Error("Ce bloc n'est pas accessible a l'athlete courant.");

  await query(`UPDATE "AthleteBlockTiming" t SET "closedAt" = $1 FROM "SessionBlock" b WHERE t."blockId" = b.id AND t."athleteId" = $2 AND t."blockId" = $3 AND b."sessionId" = $4`, [new Date(), athlete.id, blockId, sessionId]);
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

  const hasRecordedWork = payload.exercises.some((exercise) => exercise.completed)
    || payload.dives.some((dive) => dive.repetitionsCompleted > 0);
  if (hasRecordedWork && !payload.sessionFeedback?.rating?.trim()) {
    throw new Error("Choisis ton ressenti final avant d’enregistrer la séance.");
  }

  const evaluationSessionResult = await query<{ id: string }>(
    `SELECT s.id FROM "TrainingSession" s WHERE s.id = $1 AND (s."competitionEvaluationAtStart" = true OR EXISTS (
       SELECT 1 FROM "SessionBlock" b JOIN "SessionBlockAssignment" a ON a."sessionBlockId" = b.id WHERE b."sessionId" = s.id AND b."competitionEvaluation" = true AND a."athleteId" = $2
     )) LIMIT 1`, [payload.sessionId, athlete.id]
  );
  const evaluationSession = evaluationSessionResult.rows[0];
  if (evaluationSession) {
    const [diveCount, evaluationCount] = await Promise.all([
      query<{ count: string }>(`SELECT count(*)::text AS count FROM "CompetitionDive" WHERE "athleteId" = $1`, [athlete.id]),
      query<{ count: string }>(`SELECT count(*)::text AS count FROM "AthleteCompetitionDiveEvaluation" WHERE "athleteId" = $1 AND "sessionId" = $2 AND evaluator = 'ATHLETE'`, [athlete.id, payload.sessionId])
    ]);
    const totalDives = Number(diveCount.rows[0]?.count ?? 0);
    if (totalDives > 0 && Number(evaluationCount.rows[0]?.count ?? 0) !== totalDives) throw new Error("Réponds à tous les plongeons de compétition avant de terminer.");
  }

  await assertSessionStartAvailable(payload.sessionId);

  await persistAthleteProgress(payload, athlete.id, assignedBlocks, async (tx) => {
    const completedAt = new Date();
    await tx.query(
      `UPDATE "AthleteBlockTiming" t SET "closedAt" = $1 FROM "SessionBlock" b
       WHERE b.id = t."blockId" AND b."sessionId" = $2 AND t."athleteId" = $3 AND t."closedAt" IS NULL`,
      [completedAt, payload.sessionId, athlete.id]
    );
    await tx.query(
      `UPDATE "AthleteSessionCompletion" SET "completedAt" = $1, status = 'COMPLETED', rating = $2, note = $3
       WHERE "athleteId" = $4 AND "sessionId" = $5`,
      [completedAt, payload.sessionFeedback?.rating?.trim() || null, payload.sessionFeedback?.note?.trim() || null, athlete.id, payload.sessionId]
    );
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
  const sessionResult = await query<{ date: Date; status: string }>(`SELECT date, status FROM "TrainingSession" WHERE id = $1 LIMIT 1`, [sessionId]);
  const session = sessionResult.rows[0];

  if (!session || session.status !== "READY" || !isSessionStartAvailable(session.date)) {
    throw new Error(SESSION_NOT_STARTED_MESSAGE);
  }
}
