
export const SESSION_COMPLETION_GRACE_MINUTES = 30;

export async function completeSessionIfAllAthletesAreDone(
  executor: import("pg").PoolClient,
  sessionId: string
) {
  await executor.query(
    `UPDATE "TrainingSession" s SET status='COMPLETED'
     WHERE s.id=$1 AND s.status IN ('READY','IN_PROGRESS')
       AND EXISTS (
         SELECT 1 FROM "SessionBlock" b JOIN "SessionBlockAssignment" a ON a."sessionBlockId"=b.id
         WHERE b."sessionId"=s.id
       )
       AND NOT EXISTS (
         SELECT 1 FROM "SessionBlock" b JOIN "SessionBlockAssignment" a ON a."sessionBlockId"=b.id
         LEFT JOIN "AthleteSessionCompletion" c ON c."athleteId"=a."athleteId" AND c."sessionId"=s.id
         LEFT JOIN "AthleteSessionAbsence" absence ON absence."athleteId"=a."athleteId" AND absence."sessionId"=s.id
         WHERE b."sessionId"=s.id AND c.status IS DISTINCT FROM 'COMPLETED'
           AND c.status IS DISTINCT FROM 'SKIPPED' AND absence."athleteId" IS NULL
       )`,
    [sessionId]
  );
}

/** Starts published sessions when their scheduled start time arrives. */
export async function startDueTrainingSessions(now = new Date()) {
  const { query } = await import("@/lib/db");
  const result = await query(
    `UPDATE "TrainingSession" SET status='IN_PROGRESS' WHERE status='READY' AND date <= $1`, [now]
  );
  return result.rowCount ?? 0;
}

export function getSessionCompletionDeadline(startsAt: Date | string, durationMinutes: number) {
  const startTime = typeof startsAt === "string" ? new Date(startsAt).getTime() : startsAt.getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(durationMinutes) || durationMinutes < 0) {
    return null;
  }

  return new Date(startTime + (durationMinutes + SESSION_COMPLETION_GRACE_MINUTES) * 60_000);
}

export function shouldCompleteSession(
  startsAt: Date | string,
  durationMinutes: number,
  now = new Date()
) {
  const deadline = getSessionCompletionDeadline(startsAt, durationMinutes);
  return deadline !== null && now.getTime() >= deadline.getTime();
}

/** Marks ready sessions as completed once their scheduled end plus grace period has passed. */
export async function completeExpiredTrainingSessions(now = new Date()) {
  const { withTransaction } = await import("@/lib/db");
  return withTransaction(async (tx) => {
    const result = await tx.query<{ id: string; date: Date }>(
      `UPDATE "TrainingSession"
       SET status = 'COMPLETED'
       WHERE status IN ('READY','IN_PROGRESS') AND date <= $1
         AND date + (duration + $2) * INTERVAL '1 minute' <= $1
       RETURNING id, date`,
      [now, SESSION_COMPLETION_GRACE_MINUTES]
    );
    const closedCount = result.rowCount ?? 0;
    const sessions = (await tx.query<{ id: string; date: Date }>(
      `SELECT id, date FROM "TrainingSession"
       WHERE status = 'COMPLETED' AND date <= $1
         AND date + (duration + $2) * INTERVAL '1 minute' <= $1`,
      [now, SESSION_COMPLETION_GRACE_MINUTES]
    )).rows;
    if (sessions.length === 0) return 0;

    await tx.query(
      `INSERT INTO "AthleteSessionCompletion" ("athleteId", "sessionId", "startedAt", "completedAt", status)
       SELECT DISTINCT a."athleteId", s.id, s.date,
         CASE WHEN absence."athleteId" IS NULL THEN $2::timestamp ELSE NULL::timestamp END,
         CASE WHEN absence."athleteId" IS NULL THEN 'COMPLETED'::"CompletionStatus" ELSE 'SKIPPED'::"CompletionStatus" END
       FROM "SessionBlockAssignment" a
       JOIN "SessionBlock" b ON b.id=a."sessionBlockId"
       JOIN "TrainingSession" s ON s.id=b."sessionId"
       LEFT JOIN "AthleteSessionAbsence" absence ON absence."sessionId"=s.id AND absence."athleteId"=a."athleteId"
       WHERE s.id=ANY($1::text[])
       ON CONFLICT ("athleteId", "sessionId") DO UPDATE SET
         "startedAt"=COALESCE("AthleteSessionCompletion"."startedAt", EXCLUDED."startedAt"),
         "completedAt"=EXCLUDED."completedAt",
         status=EXCLUDED.status`,
      [sessions.map((session) => session.id), now]
    );

    return closedCount;
  });
}
