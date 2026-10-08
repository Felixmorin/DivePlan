import { query } from "@/lib/db";
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
    await query(
      `INSERT INTO "AppEvent" (id, type, message, "clubId", "userId", metadata) VALUES ($1, $2, $3, $4, $5, $6)`,
      [crypto.randomUUID(), input.type, input.message, input.clubId ?? null, input.userId ?? null, input.metadata ?? null]
    );
  } catch (error) {
    console.error("Failed to track app event", error);
  }
}

export const ATHLETE_SESSION_PREVIEW_EVENT = "session.previewed";

export type AthleteSessionPreviewStats = {
  total: number;
  today: number;
  days: Array<{ date: Date; count: number }>;
};

export async function getAthleteSessionPreviewStats(userId: string): Promise<AthleteSessionPreviewStats> {
  const weekStart = startOfMontrealWeek();
  const result = await query<{ createdAt: Date }>(
    `SELECT e."createdAt" FROM "AppEvent" e
     WHERE e."userId" = $1 AND e.type = $2 AND e."createdAt" >= $3
       AND NOT EXISTS (
         SELECT 1 FROM "AthleteSessionCompletion" c
         JOIN "Athlete" a ON a.id = c."athleteId"
         WHERE a."userId" = e."userId"
           AND c."sessionId" = e.metadata ->> 'sessionId'
           AND c."startedAt" IS NOT NULL
       )
     ORDER BY e."createdAt" ASC`,
    [userId, ATHLETE_SESSION_PREVIEW_EVENT, weekStart]
  );

  const countsByDay = new Map<string, number>();
  for (const event of result.rows) {
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
    total: result.rowCount ?? result.rows.length,
    today: countsByDay.get(toMontrealDateInputValue()) ?? 0,
    days
  };
}
