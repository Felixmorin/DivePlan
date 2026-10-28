import "server-only";
import { query } from "./db";
import { PAGE_SIZE, likeSearch, pageNumber, textParam } from "./pagination";
import type { SessionListItem } from "@/app/coach/sessions/sessions-list";
export type SessionFilters = { q?: string; group?: string; period?: string; tab?: string; page?: string };
export async function getCoachSessionsPage(clubId: string, input: SessionFilters) {
  const filters = { q: textParam(input.q), group: textParam(input.group,100), period: ["month","30","90"].includes(input.period ?? "") ? input.period! : "", tab: ["completed","drafts"].includes(input.tab ?? "") ? input.tab! : "all" };
  const from = filters.period === "month" ? `date_trunc('month', NOW() AT TIME ZONE 'America/Toronto')` : `NOW() - ($4::int * INTERVAL '1 day')`;
  const base = `FROM "TrainingSession" s JOIN "TrainingWeek" w ON w.id=s."weekId" JOIN "TrainingGroup" g ON g.id=w."groupId" LEFT JOIN "PlanningEvent" pe ON pe.id=s."planningEventId"`;
  const where = `w."clubId"=$1 AND (s.title ILIKE $2 OR g.name ILIKE $2) AND ($3='' OR g.id=$3)
    AND ($4='0' OR s.date>=${from}) ${filters.period === "month" ? `AND s.date < date_trunc('month',NOW() AT TIME ZONE 'America/Toronto') + INTERVAL '1 month'` : ""}`;
  const args = [clubId,likeSearch(filters.q),filters.group, /^\d+$/.test(filters.period) ? filters.period : filters.period === "month" ? "1" : "0"];
  const [stats, groups] = await Promise.all([
    query<{all:number;completed:number;drafts:number}>(`SELECT COUNT(*)::int AS "all",COUNT(*) FILTER (WHERE s.status IN ('COMPLETED','NOT_DONE','CANCELLED'))::int AS completed,COUNT(*) FILTER (WHERE s.status='DRAFT')::int AS drafts ${base} WHERE ${where}`,args),
    query<{id:string;name:string}>(`SELECT id,name FROM "TrainingGroup" WHERE "clubId"=$1 ORDER BY name,id`,[clubId])
  ]);
  const counts = stats.rows[0];
  const total = counts[filters.tab as keyof typeof counts];
  const page = Math.min(pageNumber(input.page),Math.max(1,Math.ceil(total/PAGE_SIZE)));
  const status = filters.tab === "drafts" ? `AND s.status='DRAFT'` : filters.tab === "completed" ? `AND s.status IN ('COMPLETED','NOT_DONE','CANCELLED')` : "";
  const projection = `SELECT s.id,s.title,g.name AS "groupName",s.status,COALESCE(pe.duration,s.duration)::int AS duration,s.date,pe.location,
    COALESCE((SELECT SUM(b."estimatedVolume") FROM "SessionBlock" b WHERE b."sessionId"=s.id),0)::int AS volume,
    (SELECT COUNT(*)::int FROM "SessionBlock" b WHERE b."sessionId"=s.id) AS "blockCount",
    (SELECT COUNT(DISTINCT a."athleteId")::int FROM "SessionBlock" b JOIN "SessionBlockAssignment" a ON a."sessionBlockId"=b.id WHERE b."sessionId"=s.id) AS "athleteCount"
`;
  const [list, upcoming] = await Promise.all([
    query<SessionListItem>(`${projection} ${base} WHERE ${where} ${status} ORDER BY s.date DESC,s.id DESC LIMIT $5 OFFSET $6`,[...args,PAGE_SIZE,(page-1)*PAGE_SIZE]),
    filters.tab === "all" ? query<SessionListItem>(`${projection} ${base} WHERE ${where} AND s.status IN ('READY','IN_PROGRESS') ORDER BY s.date ASC,s.id ASC LIMIT 1`,args) : Promise.resolve({rows: [] as SessionListItem[]})
  ]);
  return { sessions:list.rows, next:upcoming.rows[0] ?? null, counts, groups:groups.rows, filters, page, total };
}
export type CoachSessionsPage = Awaited<ReturnType<typeof getCoachSessionsPage>>;
