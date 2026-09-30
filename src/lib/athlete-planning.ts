import { query } from "@/lib/db";
import { addMontrealDays, startOfMontrealDay, startOfMontrealWeek } from "@/lib/timezone";

export type AthletePlanningEvent = {
  id: string;
  title: string;
  type: "COMPETITION" | "CAMP" | "TRAINING_SCHEDULE";
  startsAt: Date;
  endsAt: Date | null;
  duration: number | null;
  location: string | null;
  audience: "athlete" | "group" | "club";
  groupName: string | null;
};

export async function getAthletePlanningEvents({
  athleteId,
  clubId,
  groupId,
  rangeStart = startOfMontrealDay(),
  rangeEnd = addMontrealDays(startOfMontrealDay(), 183),
  includeOverlapping = false
}: {
  athleteId: string;
  clubId: string;
  groupId: string | null;
  rangeStart?: Date;
  rangeEnd?: Date;
  includeOverlapping?: boolean;
}): Promise<AthletePlanningEvent[]> {
  return findAthletePlanningEvents({ athleteId, clubId, groupId, rangeStart, rangeEnd, includeOverlapping });
}

export async function getAthleteWeekPlanningEvents({
  athleteId,
  clubId,
  groupId
}: {
  athleteId: string;
  clubId: string;
  groupId: string | null;
}): Promise<AthletePlanningEvent[]> {
  const rangeStart = startOfMontrealWeek();
  return findAthletePlanningEvents({ athleteId, clubId, groupId, rangeStart, rangeEnd: addMontrealDays(rangeStart, 7) });
}

async function findAthletePlanningEvents({
  athleteId,
  clubId,
  groupId,
  rangeStart,
  rangeEnd,
  includeOverlapping = false
}: {
  athleteId: string;
  clubId: string;
  groupId: string | null;
  rangeStart: Date;
  rangeEnd: Date;
  includeOverlapping?: boolean;
}): Promise<AthletePlanningEvent[]> {
  const result = await query<{
    id: string; title: string; type: AthletePlanningEvent["type"]; startsAt: Date; endsAt: Date | null;
    duration: number | null; location: string | null; athleteId: string | null; groupId: string | null; groupName: string | null;
  }>(
    `SELECT e.id, e.title, e.type, e."startsAt", e."endsAt", e.duration, e.location, e."athleteId", e."groupId", g.name AS "groupName"
     FROM "PlanningEvent" e LEFT JOIN "TrainingGroup" g ON g.id = e."groupId"
     WHERE e."clubId" = $1
       AND (e."athleteId" = $2 OR ($3::text IS NOT NULL AND e."groupId" = $3) OR (e."athleteId" IS NULL AND e."groupId" IS NULL))
       AND ${includeOverlapping ? 'e."startsAt" < $5 AND (e."endsAt" IS NULL OR e."endsAt" >= $4)' : 'e."startsAt" >= $4 AND e."startsAt" < $5'}
     ORDER BY e."startsAt" ASC`,
    [clubId, athleteId, groupId, rangeStart, rangeEnd]
  );

  return result.rows.map((event) => ({
    id: event.id, title: event.title, type: event.type, startsAt: event.startsAt, endsAt: event.endsAt,
    duration: event.duration, location: event.location,
    audience: event.athleteId === athleteId ? "athlete" : event.groupId ? "group" : "club",
    groupName: event.groupName
  }));
}
