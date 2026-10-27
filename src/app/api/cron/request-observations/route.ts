import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  // Bounded daily cleanup; preserve hourly aggregates for historical reporting.
  const result = await query<{ deleted: string }>(`WITH removed AS (
    DELETE FROM "RequestObservation" WHERE id IN (
      SELECT id FROM "RequestObservation" WHERE "startedAt" < NOW() - INTERVAL '7 days' ORDER BY "startedAt" LIMIT 50000
    ) RETURNING id
  ) SELECT count(*)::text AS deleted FROM removed`);
  const server = await query<{deleted:string}>(`WITH removed AS (
    DELETE FROM "ServerRequestMetric" WHERE id IN (
      SELECT id FROM "ServerRequestMetric" WHERE "startedAt" < NOW()-INTERVAL '7 days' ORDER BY "startedAt" LIMIT 50000
    ) RETURNING id
  ) SELECT count(*)::text AS deleted FROM removed`);
  return Response.json({ serverDeleted:Number(server.rows[0]?.deleted ?? 0), deleted: Number(result.rows[0]?.deleted ?? 0) }, { headers: { "cache-control": "no-store" } });
}
