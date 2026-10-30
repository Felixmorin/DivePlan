import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { query, withTransaction } from "@/lib/db";

export type AthleteProgressPayload = {
  sessionId: string;
  sessionFeedback?: { rating: string | null; note: string | null };
  exercises: Array<{ exerciseId: string; completed: boolean; rating: string | null; note: string | null }>;
  dives: Array<{ poolDiveId: string; repetitionsCompleted: number; goldenRepetitions: number; feedbackCompleted: boolean; rating: string | null; note: string | null }>;
};

type AssignedSessionBlock = { id: string; exerciseIds: string[]; diveIds: string[] };

export async function getAssignedSessionBlocks(sessionId: string, athleteId: string): Promise<AssignedSessionBlock[]> {
  // Saving only needs membership, not the plan's text, parameters or ordering.
  // Keep empty assigned blocks so a feedback-only save remains authorized.
  // Scheduled closure still permits saves by athletes who already started.
  // UNION ALL avoids multiplying exercises by dives in mixed blocks.
  const result = await query<{ blockId: string; kind: "block" | "exercise" | "dive"; itemId: string }>(
    `WITH assigned_blocks AS (
       SELECT b.id FROM "SessionBlock" b
       JOIN "SessionBlockAssignment" a ON a."sessionBlockId" = b.id
       JOIN "TrainingSession" s ON s.id = b."sessionId"
       WHERE b."sessionId" = $1 AND a."athleteId" = $2 AND (
         s.status IN ('READY','IN_PROGRESS') OR (s.status = 'COMPLETED' AND EXISTS (
           SELECT 1 FROM "AthleteSessionCompletion" c
           WHERE c."sessionId" = s.id AND c."athleteId" = $2 AND c.status IN ('IN_PROGRESS','COMPLETED')
         ))
       )
     )
     SELECT b.id AS "blockId", 'block' AS kind, b.id AS "itemId" FROM assigned_blocks b
     UNION ALL
     SELECT b.id, 'exercise', e."exerciseId" FROM assigned_blocks b
       JOIN "DrylandBlockExercise" e ON e."blockId" = b.id
     UNION ALL
     SELECT b.id, 'dive', d.id FROM assigned_blocks b
       JOIN "PoolTraining" p ON p."blockId" = b.id
       JOIN "PoolSection" s ON s."poolTrainingId" = p."blockId"
       JOIN "PoolDive" d ON d."poolSectionId" = s.id`,
    [sessionId, athleteId]
  );
  const blocks = new Map<string, AssignedSessionBlock>();
  for (const row of result.rows) {
    let block = blocks.get(row.blockId);
    if (!block) {
      block = { id: row.blockId, exerciseIds: [], diveIds: [] };
      blocks.set(row.blockId, block);
    }
    if (row.kind === "exercise") block.exerciseIds.push(row.itemId);
    if (row.kind === "dive") block.diveIds.push(row.itemId);
  }
  return [...blocks.values()];
}

export async function persistAthleteProgress<T = void>(
  payload: AthleteProgressPayload,
  athleteId: string,
  assignedBlocks: AssignedSessionBlock[],
  afterPersist?: (tx: PoolClient) => Promise<T>
): Promise<T | undefined> {
  const validExerciseIds = new Set(assignedBlocks.flatMap((block) => block.exerciseIds));
  const validDiveIds = new Set(assignedBlocks.flatMap((block) => block.diveIds));
  const feedbackProvided = payload.sessionFeedback !== undefined;
  const rating = feedbackProvided ? normalizeText(payload.sessionFeedback?.rating ?? null) : null;
  const note = feedbackProvided ? normalizeText(payload.sessionFeedback?.note ?? null) : null;
  // Full-session saves can repeat an exercise used in multiple blocks. Logs
  // are keyed by athlete/session/item, so each upsert must receive one snapshot
  // per item. Keep the last snapshot (as sequential saves would), never sum reps.
  const exerciseLogs = [...new Map(payload.exercises.filter((item) => validExerciseIds.has(item.exerciseId))
    .map((item) => [item.exerciseId, item])).values()];
  const diveLogs = [...new Map(payload.dives.filter((item) => validDiveIds.has(item.poolDiveId))
    .map((item) => [item.poolDiveId, item])).values()].map((item) => ({
    ...item,
    // Athletes may add extra reps during a session; retain all completed work.
    repetitionsCompleted: Math.max(0, Math.min(item.repetitionsCompleted, 500)),
    goldenRepetitions: Math.max(0, Math.min(item.goldenRepetitions, item.repetitionsCompleted, 500)),
    rating: normalizeText(item.rating) ?? "moyen",
    note: normalizeText(item.note)
  }));

  return withTransaction(async (tx) => {
    if (exerciseLogs.length) {
      await tx.query(
        `INSERT INTO "AthleteExerciseLog" (id, "athleteId", "sessionId", "exerciseId", completed, rating, note)
         SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::boolean[], $6::text[], $7::text[])
         ON CONFLICT ("athleteId", "sessionId", "exerciseId") DO UPDATE SET completed = EXCLUDED.completed, rating = EXCLUDED.rating, note = EXCLUDED.note`,
        [exerciseLogs.map(() => randomUUID()), exerciseLogs.map(() => athleteId), exerciseLogs.map(() => payload.sessionId), exerciseLogs.map((item) => item.exerciseId), exerciseLogs.map((item) => item.completed), exerciseLogs.map((item) => normalizeText(item.rating)), exerciseLogs.map((item) => normalizeText(item.note))]
      );
    }
    if (diveLogs.length) {
      const now = new Date();
      await tx.query(
        `INSERT INTO "AthleteDiveLog" (id, "athleteId", "sessionId", "poolDiveId", "repetitionsCompleted", "goldenRepetitions", "feedbackCompleted", rating, note, timestamp)
         SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::int[], $6::int[], $7::boolean[], $8::text[], $9::text[], $10::timestamptz[])
         ON CONFLICT ("athleteId", "sessionId", "poolDiveId") DO UPDATE SET "repetitionsCompleted" = EXCLUDED."repetitionsCompleted", "goldenRepetitions" = EXCLUDED."goldenRepetitions", "feedbackCompleted" = EXCLUDED."feedbackCompleted", rating = EXCLUDED.rating, note = EXCLUDED.note, timestamp = EXCLUDED.timestamp`,
        [diveLogs.map(() => randomUUID()), diveLogs.map(() => athleteId), diveLogs.map(() => payload.sessionId), diveLogs.map((item) => item.poolDiveId), diveLogs.map((item) => item.repetitionsCompleted), diveLogs.map((item) => item.goldenRepetitions), diveLogs.map((item) => item.feedbackCompleted), diveLogs.map((item) => item.rating), diveLogs.map((item) => normalizeText(item.note)), diveLogs.map(() => now)]
      );
    }
    await tx.query(
      `INSERT INTO "AthleteSessionCompletion" ("athleteId", "sessionId", "startedAt", status, rating, note)
       VALUES ($1, $2, $3, 'IN_PROGRESS', $4, $5)
       ON CONFLICT ("athleteId", "sessionId") DO UPDATE SET "startedAt" = COALESCE("AthleteSessionCompletion"."startedAt", EXCLUDED."startedAt"),
         rating = CASE WHEN $6 THEN EXCLUDED.rating ELSE "AthleteSessionCompletion".rating END,
         note = CASE WHEN $6 THEN EXCLUDED.note ELSE "AthleteSessionCompletion".note END`,
      [athleteId, payload.sessionId, new Date(), rating, note, feedbackProvided]
    );
    return await afterPersist?.(tx);
  });
}

function normalizeText(value: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
