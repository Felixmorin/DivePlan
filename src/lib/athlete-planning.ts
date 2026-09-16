import type { PlanningEventType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addMontrealDays, startOfMontrealDay, startOfMontrealWeek } from "@/lib/timezone";

export type AthletePlanningEvent = {
  id: string;
  title: string;
  type: PlanningEventType;
  startsAt: Date;
  duration: number | null;
  location: string | null;
  audience: "athlete" | "group" | "club";
  groupName: string | null;
};

export async function getAthletePlanningEvents({
  athleteId,
  clubId,
  groupId
}: {
  athleteId: string;
  clubId: string;
  groupId: string | null;
}): Promise<AthletePlanningEvent[]> {
  return findAthletePlanningEvents({ athleteId, clubId, groupId, rangeStart: startOfMontrealDay(), rangeEnd: addMontrealDays(startOfMontrealDay(), 183) });
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
  rangeEnd
}: {
  athleteId: string;
  clubId: string;
  groupId: string | null;
  rangeStart: Date;
  rangeEnd: Date;
}): Promise<AthletePlanningEvent[]> {
  const audienceFilters = [
    { athleteId },
    ...(groupId ? [{ groupId }] : []),
    { athleteId: null, groupId: null }
  ];

  const events = await prisma.planningEvent.findMany({
    where: {
      clubId,
      startsAt: { gte: rangeStart, lt: rangeEnd },
      OR: audienceFilters
    },
    orderBy: { startsAt: "asc" },
    include: { group: { select: { name: true } } }
  });

  return events.map((event) => ({
    id: event.id,
    title: event.title,
    type: event.type,
    startsAt: event.startsAt,
    duration: event.duration,
    location: event.location,
    audience: event.athleteId === athleteId ? "athlete" : event.groupId ? "group" : "club",
    groupName: event.group?.name ?? null
  }));
}
