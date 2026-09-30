
export const SESSION_COMPLETION_GRACE_MINUTES = 30;

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
  const { query } = await import("@/lib/db");
  const result = await query(
    `UPDATE "TrainingSession"
     SET status = 'COMPLETED'
     WHERE status = 'READY' AND date <= $1
       AND date + (duration + $2) * INTERVAL '1 minute' <= $1`,
    [now, SESSION_COMPLETION_GRACE_MINUTES]
  );
  return result.rowCount ?? 0;
}
