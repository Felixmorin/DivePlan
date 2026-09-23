import { prisma } from "@/lib/prisma";
import { addMontrealDays, startOfMontrealWeek, toMontrealDateInputValue } from "@/lib/timezone";

type TrackEventInput = {
  type: string;
  message: string;
  clubId?: string | null;
  userId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
};

export async function trackEvent(input: TrackEventInput) {
  try {
    await prisma.appEvent.create({
      data: {
        type: input.type,
        message: input.message,
        clubId: input.clubId ?? null,
        userId: input.userId ?? null,
        metadata: input.metadata
      }
    });
  } catch (error) {
    console.error("Failed to track app event", error);
  }
}

export const ATHLETE_SESSION_PREVIEW_EVENT = "session.previewed";

export async function getAthleteSessionPreviewStats(userId: string) {
  const weekStart = startOfMontrealWeek();
  const events = await prisma.appEvent.findMany({
    where: {
      userId,
      type: ATHLETE_SESSION_PREVIEW_EVENT,
      createdAt: { gte: weekStart }
    },
    select: { createdAt: true },
    orderBy: { createdAt: "asc" }
  });

  const countsByDay = new Map<string, number>();
  for (const event of events) {
    const key = toMontrealDateInputValue(event.createdAt);
    countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1);
  }

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = addMontrealDays(weekStart, index);
    return {
      date,
      count: countsByDay.get(toMontrealDateInputValue(date)) ?? 0
    };
  });

  return {
    total: events.length,
    today: countsByDay.get(toMontrealDateInputValue()) ?? 0,
    days
  };
}
