import { SessionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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
  const candidates = await prisma.trainingSession.findMany({
    where: { status: SessionStatus.READY, date: { lte: now } },
    select: { id: true, date: true, duration: true }
  });

  const expiredIds = candidates
    .filter((session) => shouldCompleteSession(session.date, session.duration, now))
    .map((session) => session.id);

  if (expiredIds.length === 0) {
    return 0;
  }

  const result = await prisma.trainingSession.updateMany({
    where: { id: { in: expiredIds }, status: SessionStatus.READY },
    data: { status: SessionStatus.COMPLETED }
  });

  return result.count;
}
