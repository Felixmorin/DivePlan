import "server-only";
import { query } from "@/lib/db";
import type { RequestObservation } from "./request-observation";

export type ExplorerFilters = { from: Date; to: Date; route: string | null; type: string | null; trigger: string | null; pageId: string | null; before: Date | null; beforeId: string | null };
export const observationWhere = `"startedAt" >= $1 AND "startedAt" < $2
  AND ($3::text IS NULL OR route = $3) AND ($4::text IS NULL OR "resourceType" = $4)
  AND ($5::text IS NULL OR trigger = $5) AND ($6::uuid IS NULL OR "pageId" = $6)`;
export const observationListSql = `WITH observations AS (SELECT id::text, "clubId", "serverRequestId", "pageId"::text, route, "resourcePath", "resourceType", trigger, "startedAt", "receivedAt", "durationMs", "transferBytes"::text, "cacheHit", status
  FROM "RequestObservation" WHERE ${observationWhere}
  AND ($7::timestamptz IS NULL OR ("startedAt", id) < ($7, $8::uuid))
  ORDER BY "startedAt" DESC, id DESC LIMIT 51 ) SELECT o.*, m.trigger AS "serverTrigger", m."queryCount" AS "sqlQueries", m."resultBytes"::text AS "sqlBytes", m."sqlDurationMs"::text AS "sqlMs"
  FROM observations o LEFT JOIN "ServerRequestMetric" m ON m.id=o."serverRequestId" AND m."clubId" IS NOT DISTINCT FROM o."clubId" AND m.route=o."resourcePath"
  ORDER BY o."startedAt" DESC,o.id DESC`;
export const observationExportSql = `SELECT id::text, "clubId", "serverRequestId", "pageId"::text, route, "resourcePath", "resourceType", trigger, "startedAt", "receivedAt", "durationMs", "transferBytes"::text, "cacheHit", status
  FROM "RequestObservation" WHERE ${observationWhere} ORDER BY "startedAt" DESC, id DESC`;
export const observationSummarySql = `SELECT count(*)::text AS count, count(DISTINCT "pageId")::text AS pages,
  count(*) FILTER (WHERE status >= 400)::text AS errors,
  count(*) FILTER (WHERE status = 200)::text AS successes,
  COALESCE(sum("transferBytes"),0)::text AS bytes, round(avg("durationMs"))::text AS duration,
  max("receivedAt") AS latest FROM "RequestObservation" WHERE ${observationWhere}`;
export const observationBreakdownSql = `SELECT "resourceType", trigger, count(*)::text AS count FROM "RequestObservation"
  WHERE ${observationWhere} GROUP BY "resourceType", trigger ORDER BY count(*) DESC`;
export const observationTargetsSql = `SELECT "resourcePath", count(*)::text AS count, COALESCE(sum("transferBytes"),0)::text AS bytes
  FROM "RequestObservation" WHERE ${observationWhere} GROUP BY "resourcePath" ORDER BY count(*) DESC, "resourcePath" LIMIT 15`;
export const observationMinuteSql = `SELECT date_trunc('minute', "startedAt") AS minute, count(*)::text AS count
  FROM "RequestObservation" WHERE ${observationWhere} GROUP BY 1 ORDER BY 1 LIMIT 60`;
export const observationTotalsSql = `SELECT COALESCE(sum(requests),0)::text AS count, max("updatedAt") AS latest FROM "TransferTelemetryHour"
  WHERE hour >= $1 AND hour < $2 AND ($3::text IS NULL OR route = $3)`;

export async function getRequestExplorer(filters: ExplorerFilters) {
  const args = [filters.from, filters.to, filters.route, filters.type, filters.trigger, filters.pageId];
  const [list, summary, breakdown, targets, totals, minutes] = await Promise.all([
    query<Omit<RequestObservation, "startedAt" | "transferBytes"> & { startedAt: Date; receivedAt: Date; transferBytes: string; serverTrigger: string|null; sqlQueries:number|null; sqlBytes:string|null; sqlMs:string|null }>(observationListSql, [...args, filters.before, filters.beforeId]),
    query<{ count: string; pages: string; errors: string; successes: string; bytes: string; duration: string | null; latest: Date | null }>(observationSummarySql, args),
    query<{ resourceType: string; trigger: RequestObservation["trigger"]; count: string }>(observationBreakdownSql, args),
    query<{ resourcePath: string; count: string; bytes: string }>(observationTargetsSql, args),
    query<{ count: string; latest: Date | null }>(observationTotalsSql, args.slice(0, 3)),
    filters.to.getTime() - filters.from.getTime() === 3_600_000
      ? query<{ minute: Date; count: string }>(observationMinuteSql, args) : Promise.resolve({ rows: [] })
  ]);
  return { list: list.rows.slice(0, 50), hasMore: list.rows.length > 50, summary: summary.rows[0], breakdown: breakdown.rows, targets: targets.rows, total: totals.rows[0], minutes: minutes.rows };
}

export async function getRequestExport(filters: Omit<ExplorerFilters, "before" | "beforeId">) {
  const args = [filters.from, filters.to, filters.route, filters.type, filters.trigger, filters.pageId];
  const result = await query<RequestObservation & { startedAt: Date; receivedAt: Date; transferBytes: string }>(observationExportSql, args);
  return result.rows;
}
