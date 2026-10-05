"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { ATHLETE_SESSION_PREVIEW_EVENT, trackEvent } from "@/lib/monitoring";
import { query, withTransaction } from "@/lib/db";
import { getCurrentAthlete } from "@/lib/athlete-session";
import { getAssignedSessionBlocks, persistAthleteProgress, type AthleteProgressPayload } from "@/lib/athlete-progress";
import { isSessionStartAvailable, SESSION_NOT_STARTED_MESSAGE } from "@/lib/session-availability";
import { z } from "zod";
import { MILESTONES, type MilestoneKey } from "@/lib/milestones";
import { getClubMilestones } from "@/lib/milestone-data";

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

  const earnedMilestones = await persistAthleteProgress(payload, athlete.id, assignedBlocks, async (tx): Promise<MilestoneKey[]> => {
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
    const totalResult = await tx.query<{ total: string }>(`SELECT COALESCE(sum("repetitionsCompleted"), 0)::text AS total FROM "AthleteDiveLog" WHERE "athleteId" = $1`, [athlete.id]);
    const earned: MilestoneKey[] = [];
    if (Number(totalResult.rows[0]?.total ?? 0) >= 500) {
      const personal = await tx.query(
        `INSERT INTO "AthleteMilestone" (id, "athleteId", key) VALUES ($1,$2,$3) ON CONFLICT ("athleteId", key) DO NOTHING RETURNING key`,
        [randomUUID(), athlete.id, MILESTONES.repetitions500.key]
      );
      if (personal.rowCount) earned.push(MILESTONES.repetitions500.key);
      await tx.query(`SELECT id FROM "Club" WHERE id = $1 FOR UPDATE`, [athlete.clubId]);
      const winner = await tx.query(`SELECT 1 FROM "AthleteMilestone" m JOIN "Athlete" a ON a.id = m."athleteId" WHERE a."clubId" = $1 AND m.key = $2 LIMIT 1`, [athlete.clubId, MILESTONES.first500.key]);
      if (!winner.rowCount) {
        const first = await tx.query(
          `INSERT INTO "AthleteMilestone" (id, "athleteId", key) VALUES ($1,$2,$3) ON CONFLICT ("athleteId", key) DO NOTHING RETURNING key`,
          [randomUUID(), athlete.id, MILESTONES.first500.key]
        );
        if (first.rowCount) earned.push(MILESTONES.first500.key);
      }
    }
    const recentSessions = await tx.query<{ repetitions: string }>(
      `SELECT COALESCE(sum(l."repetitionsCompleted"), 0)::text AS repetitions
       FROM "AthleteSessionCompletion" c
       LEFT JOIN "AthleteDiveLog" l ON l."athleteId" = c."athleteId" AND l."sessionId" = c."sessionId"
       WHERE c."athleteId" = $1 AND c.status = 'COMPLETED'
       GROUP BY c."sessionId", c."completedAt"
       ORDER BY c."completedAt" DESC
       LIMIT 5`,
      [athlete.id]
    );
    const recentSessionRepetitions = recentSessions.rows.map((row) => Number(row.repetitions));
    if (recentSessionRepetitions.length === 5 && recentSessionRepetitions.reduce((sum, repetitions) => sum + repetitions, 0) / 5 >= 35) {
      const result = await tx.query(
        `INSERT INTO "AthleteMilestone" (id, "athleteId", key) VALUES ($1,$2,$3) ON CONFLICT ("athleteId", key) DO NOTHING RETURNING key`,
        [randomUUID(), athlete.id, MILESTONES.sessionAverage35.key]
      );
      if (result.rowCount) earned.push(MILESTONES.sessionAverage35.key);
    }
    const allCompetitionDivesDone = await tx.query(
      `SELECT 1 WHERE EXISTS (SELECT 1 FROM "CompetitionDive" WHERE "athleteId" = $1)
       AND NOT EXISTS (SELECT 1 FROM "CompetitionDive" c WHERE c."athleteId" = $1 AND (
         SELECT COALESCE(sum(l."repetitionsCompleted"), 0) FROM "AthleteDiveLog" l
         JOIN "PoolDive" d ON d.id = l."poolDiveId" JOIN "PoolSection" s ON s.id = d."poolSectionId"
         WHERE l."athleteId" = $1 AND d."diveCode" = c."diveCode" AND s.height = c.height
       ) < 5)`, [athlete.id]
    );
    if (allCompetitionDivesDone.rowCount) {
      const result = await tx.query(
        `INSERT INTO "AthleteMilestone" (id, "athleteId", key) VALUES ($1,$2,$3) ON CONFLICT ("athleteId", key) DO NOTHING RETURNING key`,
        [randomUUID(), athlete.id, MILESTONES.competition5.key]
      );
      if (result.rowCount) earned.push(MILESTONES.competition5.key);
    }
    return earned;
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
  revalidatePath("/athlete/profile");
  const milestoneText = await getClubMilestones(athlete.clubId);
  return (earnedMilestones ?? []).map((key) => milestoneText.find((milestone) => milestone.key === key)!);
}

async function assertSessionStartAvailable(sessionId: string) {
  const sessionResult = await query<{ date: Date; status: string }>(`SELECT date, status FROM "TrainingSession" WHERE id = $1 LIMIT 1`, [sessionId]);
  const session = sessionResult.rows[0];

  if (!session || session.status !== "READY" || !isSessionStartAvailable(session.date)) {
    throw new Error(SESSION_NOT_STARTED_MESSAGE);
  }
}
