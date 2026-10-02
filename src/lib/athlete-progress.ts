import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { query, withTransaction } from "@/lib/db";

export type AthleteProgressPayload = {
  sessionId: string;
  sessionFeedback?: { rating: string | null; note: string | null };
  exercises: Array<{ exerciseId: string; completed: boolean; rating: string | null; note: string | null }>;
  dives: Array<{ poolDiveId: string; repetitionsCompleted: number; goldenRepetitions: number; rating: string | null; note: string | null }>;
};

type ExerciseBlockItem = { blockId: string; exerciseId: string; sets: number | null; reps: number | null; duration: number | null; notes: string | null; order: number };
type PoolDiveItem = { id: string; poolSectionId: string; diveCode: string; diveName: string; position: string; repetitions: number; notes: string | null; order: number };
type PoolSectionItem = { id: string; poolTrainingId: string; height: "ONE_METER" | "THREE_METER" | "PLATFORM" | "CUSTOM"; label: string | null; order: number; dives: PoolDiveItem[] };
type AssignedSessionBlock = {
  id: string; sessionId: string; type: string; title: string; description: string | null; duration: number; position: number;
  estimatedVolume: number; competitionEvaluation: boolean; drylandExercises: ExerciseBlockItem[];
  poolTraining: { blockId: string; sections: PoolSectionItem[] } | null;
};

export async function getAssignedSessionBlocks(sessionId: string, athleteId: string): Promise<AssignedSessionBlock[]> {
  const session = await query(`SELECT id FROM "TrainingSession" WHERE id = $1 AND status = 'READY' LIMIT 1`, [sessionId]);
  if (!session.rowCount) return [];

  const [blocksResult, exercisesResult, sectionsResult, divesResult] = await Promise.all([
    query<Omit<AssignedSessionBlock, "drylandExercises" | "poolTraining"> & { id: string }>(
      `SELECT b.id, b."sessionId", b.type, b.title, b.description, b.duration, b.position, b."estimatedVolume", b."competitionEvaluation"
       FROM "SessionBlock" b JOIN "SessionBlockAssignment" a ON a."sessionBlockId" = b.id
       WHERE b."sessionId" = $1 AND a."athleteId" = $2 ORDER BY b.position ASC`, [sessionId, athleteId]
    ),
    query<ExerciseBlockItem>(
      `SELECT e."blockId", e."exerciseId", e.sets, e.reps, e.duration, e.notes, e."order"
       FROM "DrylandBlockExercise" e JOIN "SessionBlock" b ON b.id = e."blockId"
       JOIN "SessionBlockAssignment" a ON a."sessionBlockId" = b.id
       WHERE b."sessionId" = $1 AND a."athleteId" = $2 ORDER BY e."order" ASC`, [sessionId, athleteId]
    ),
    query<PoolSectionItem & { poolTrainingId: string }>(
      `SELECT s.id, s."poolTrainingId", s.height, s.label, s."order" FROM "PoolSection" s
       JOIN "PoolTraining" p ON p."blockId" = s."poolTrainingId" JOIN "SessionBlock" b ON b.id = p."blockId"
       JOIN "SessionBlockAssignment" a ON a."sessionBlockId" = b.id
       WHERE b."sessionId" = $1 AND a."athleteId" = $2 ORDER BY b.position ASC, s."order" ASC`, [sessionId, athleteId]
    ),
    query<PoolDiveItem>(
      `SELECT d.id, d."poolSectionId", d."diveCode", d."diveName", d.position, d.repetitions, d.notes, d."order"
       FROM "PoolDive" d JOIN "PoolSection" s ON s.id = d."poolSectionId"
       JOIN "PoolTraining" p ON p."blockId" = s."poolTrainingId" JOIN "SessionBlock" b ON b.id = p."blockId"
       JOIN "SessionBlockAssignment" a ON a."sessionBlockId" = b.id
       WHERE b."sessionId" = $1 AND a."athleteId" = $2 ORDER BY b.position ASC, s."order" ASC, d."order" ASC`, [sessionId, athleteId]
    )
  ]);

  const exerciseItems = exercisesResult.rows;
  const sections = sectionsResult.rows.map((section) => ({ ...section, dives: divesResult.rows.filter((dive) => dive.poolSectionId === section.id) }));
  return blocksResult.rows.map((block) => {
    const blockSections = sections.filter((section) => section.poolTrainingId === block.id);
    return {
      ...block,
      drylandExercises: exerciseItems.filter((exercise) => exercise.blockId === block.id),
      poolTraining: blockSections.length ? { blockId: block.id, sections: blockSections } : null
    };
  });
}

export async function persistAthleteProgress(
  payload: AthleteProgressPayload,
  athleteId: string,
  assignedBlocks: AssignedSessionBlock[],
  afterPersist?: (tx: PoolClient) => Promise<void>
) {
  const validExerciseIds = new Set(assignedBlocks.flatMap((block) => block.drylandExercises.map((exercise) => exercise.exerciseId)));
  const validDiveIds = new Set(assignedBlocks.flatMap((block) => block.poolTraining?.sections.flatMap((section) => section.dives.map((dive) => dive.id)) ?? []));
  const feedbackProvided = payload.sessionFeedback !== undefined;
  const rating = feedbackProvided ? normalizeText(payload.sessionFeedback?.rating ?? null) : null;
  const note = feedbackProvided ? normalizeText(payload.sessionFeedback?.note ?? null) : null;
  const exerciseLogs = payload.exercises.filter((item) => validExerciseIds.has(item.exerciseId));
  const diveLogs = payload.dives.filter((item) => validDiveIds.has(item.poolDiveId)).map((item) => ({
    ...item,
    // Athletes may add extra reps during a session; retain all completed work.
    repetitionsCompleted: Math.max(0, Math.min(item.repetitionsCompleted, 500)),
    goldenRepetitions: Math.max(0, Math.min(item.goldenRepetitions, item.repetitionsCompleted, 500)),
    rating: normalizeText(item.rating) ?? "moyen",
    note: normalizeText(item.note)
  }));

  await withTransaction(async (tx) => {
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
        `INSERT INTO "AthleteDiveLog" (id, "athleteId", "sessionId", "poolDiveId", "repetitionsCompleted", "goldenRepetitions", rating, note, timestamp)
         SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::int[], $6::int[], $7::text[], $8::text[], $9::timestamptz[])
         ON CONFLICT ("athleteId", "sessionId", "poolDiveId") DO UPDATE SET "repetitionsCompleted" = EXCLUDED."repetitionsCompleted", "goldenRepetitions" = EXCLUDED."goldenRepetitions", rating = EXCLUDED.rating, note = EXCLUDED.note, timestamp = EXCLUDED.timestamp`,
        [diveLogs.map(() => randomUUID()), diveLogs.map(() => athleteId), diveLogs.map(() => payload.sessionId), diveLogs.map((item) => item.poolDiveId), diveLogs.map((item) => item.repetitionsCompleted), diveLogs.map((item) => item.goldenRepetitions), diveLogs.map((item) => item.rating), diveLogs.map((item) => normalizeText(item.note)), diveLogs.map(() => now)]
      );
    }
    await tx.query(
      `INSERT INTO "AthleteSessionCompletion" ("athleteId", "sessionId", "startedAt", status, rating, note)
       VALUES ($1, $2, $3, 'IN_PROGRESS', $4, $5)
       ON CONFLICT ("athleteId", "sessionId") DO UPDATE SET "startedAt" = EXCLUDED."startedAt",
         rating = CASE WHEN $6 THEN EXCLUDED.rating ELSE "AthleteSessionCompletion".rating END,
         note = CASE WHEN $6 THEN EXCLUDED.note ELSE "AthleteSessionCompletion".note END`,
      [athleteId, payload.sessionId, new Date(), rating, note, feedbackProvided]
    );
    await afterPersist?.(tx);
  });
}

function normalizeText(value: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
