import "server-only";
import { query } from "@/lib/db";
import { PAGE_SIZE, likeSearch, pageNumber, textParam } from "./pagination";
import type { AthleteHistorySession } from "@/components/coach/coach-athlete-session-history";
import { parseMontrealSessionDate } from "./timezone";

export type HistoryParams = { q?: string; status?: string; month?: string; page?: string };
export type AthleteHistoryPage = { sessions: AthleteHistorySession[]; total: number; page: number; minutes: number; filters: HistoryParams };
export async function getAthleteHistory(athleteId: string, clubId: string, params: HistoryParams, seasonStart: Date) : Promise<AthleteHistoryPage> {
  const q = textParam(params.q);
  const status = ["COMPLETED", "IN_PROGRESS", "NOT_STARTED", "SKIPPED"].includes(params.status ?? "") ? params.status! : "";
  const requestedMonth = textParam(params.month,7);
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth) && Number(requestedMonth.slice(0,4)) >= 1900 && Number(requestedMonth.slice(0,4)) <= 2200 ? requestedMonth : "";
  const from = month ? parseMontrealSessionDate(`${month}-01`, "00:00") : null;
  const [year, m] = month ? month.split("-").map(Number) : [2000, 1];
  const to = month ? parseMontrealSessionDate(`${m === 12 ? year + 1 : year}-${String(m === 12 ? 1 : m + 1).padStart(2,"0")}-01`, "00:00") : null;
  const args = [athleteId, clubId, likeSearch(q), status, from, to];
  const base = `FROM "AthleteSessionCompletion" c JOIN "TrainingSession" s ON s.id=c."sessionId"
    JOIN "TrainingWeek" w ON w.id=s."weekId"
    LEFT JOIN "PlanningEvent" pe ON pe.id=s."planningEventId"
    LEFT JOIN "CoachAthleteSessionNote" can ON can."sessionId"=s.id AND can."athleteId"=c."athleteId"`;
  const where = `c."athleteId"=$1 AND w."clubId"=$2 AND (s.title ILIKE $3 OR COALESCE(can.note,'') ILIKE $3)
    AND ($4='' OR c.status::text=$4) AND ($5::timestamp IS NULL OR s.date >= $5) AND ($6::timestamp IS NULL OR s.date < $6)`;
  const [count, duration] = await Promise.all([
    query<{ total: number }>(`SELECT COUNT(*)::int AS total ${base} WHERE ${where}`, args),
    query<{ minutes: number }>(`SELECT COALESCE(SUM(COALESCE(pe.duration,s.duration)),0)::int AS minutes ${base}
      WHERE c."athleteId"=$1 AND w."clubId"=$2 AND c.status='COMPLETED' AND s.date >= $3 AND s.date<=NOW()`, [athleteId, clubId, seasonStart])
  ]);
  const total = count.rows[0]?.total ?? 0;
  const page = Math.min(pageNumber(params.page), Math.max(1, Math.ceil(total / PAGE_SIZE)));
  const { rows } = await query<AthleteHistorySession>(`SELECT s.id,s.title,s.date,'Séance' AS type,COALESCE(pe.duration,s.duration)::int AS duration,
    c.status,c.rating,can.note AS "coachNote",COALESCE((SELECT SUM(l."repetitionsCompleted") FROM "AthleteDiveLog" l WHERE l."sessionId"=s.id AND l."athleteId"=c."athleteId"),0)::int AS volume
    ${base} WHERE ${where} ORDER BY s.date DESC,s.id DESC LIMIT $7 OFFSET $8`, [...args, PAGE_SIZE, (page-1)*PAGE_SIZE]);
  return { sessions: rows, total, page, minutes: duration.rows[0]?.minutes ?? 0, filters: { q, status, month } };
}
