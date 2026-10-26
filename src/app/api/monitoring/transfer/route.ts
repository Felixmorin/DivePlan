import { getCurrentUser } from "@/lib/current-user";
import { query } from "@/lib/db";
import { normalizeTelemetryRoute } from "@/lib/telemetry-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const resourceTypes = new Set(["document", "script", "style", "image", "font", "fetch", "other"]);
const vitalNames = new Set(["LCP", "INP", "CLS", "FCP", "TTFB"]);
const maxRequestBytes = 20_000;
const maxEntries = 40;

type Entry = { route: string; resourceType: string; requests: number; transferBytes: number; cacheHits: number };
type Vital = { route: string; metric: string; value: number; goodSamples: number; needsImprovementSamples: number };

function ratingThresholds(name: string, value: number) {
  const limits: Record<string, [number, number]> = {
    LCP: [2500, 4000], INP: [200, 500], CLS: [0.1, 0.25], FCP: [1800, 3000], TTFB: [800, 1800]
  };
  const [good, needsImprovement] = limits[name];
  return { goodSamples: Number(value <= good), needsImprovementSamples: Number(value > good && value <= needsImprovement) };
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "invalid_origin" }, { status: 403 });

  const user = await getCurrentUser();
  if (!user?.clubId || !["COACH", "ATHLETE"].includes(user.role)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > maxRequestBytes) return Response.json({ error: "payload_too_large" }, { status: 413 });

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > maxRequestBytes) return Response.json({ error: "payload_too_large" }, { status: 413 });
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const rawEntries = (body as { entries?: unknown } | null)?.entries;
  const rawVitals = (body as { vitals?: unknown } | null)?.vitals;
  if ((!Array.isArray(rawEntries) && !Array.isArray(rawVitals))
    || (Array.isArray(rawEntries) && rawEntries.length > maxEntries)
    || (Array.isArray(rawVitals) && rawVitals.length > 10)) {
    return Response.json({ error: "invalid_entries" }, { status: 400 });
  }

  const entries: Entry[] = [];
  for (const value of Array.isArray(rawEntries) ? rawEntries : []) {
    if (!value || typeof value !== "object") continue;
    const item = value as Record<string, unknown>;
    const route = typeof item.route === "string" ? normalizeTelemetryRoute(item.route) : null;
    if (!route || typeof item.resourceType !== "string" || !resourceTypes.has(item.resourceType)) continue;
    const requests = Number(item.requests);
    const transferBytes = Number(item.transferBytes);
    const cacheHits = Number(item.cacheHits);
    if (!Number.isInteger(requests) || requests < 1 || requests > 100_000
      || !Number.isSafeInteger(transferBytes) || transferBytes < 0 || transferBytes > 100_000_000
      || !Number.isInteger(cacheHits) || cacheHits < 0 || cacheHits > requests) continue;
    entries.push({ route, resourceType: item.resourceType, requests, transferBytes, cacheHits });
  }
  const vitals: Vital[] = [];
  for (const value of Array.isArray(rawVitals) ? rawVitals : []) {
    if (!value || typeof value !== "object") continue;
    const item = value as Record<string, unknown>;
    const route = typeof item.route === "string" ? normalizeTelemetryRoute(item.route) : null;
    const name = item.name;
    const numericValue = Number(item.value);
    if (!route || !/^\/(coach|athlete)(\/|$)/.test(route)
      || typeof name !== "string" || !vitalNames.has(name)
      || !Number.isFinite(numericValue) || numericValue < 0 || numericValue > 60_000
      || (name === "CLS" && numericValue > 10)) continue;
    vitals.push({ route, metric: name, value: numericValue, ...ratingThresholds(name, numericValue) });
  }
  if (entries.length === 0 && vitals.length === 0) return Response.json({ error: "invalid_entries" }, { status: 400 });

  const writes: Promise<unknown>[] = [];
  if (entries.length > 0) writes.push(query(
      `INSERT INTO "TransferTelemetryHour" ("clubId", hour, route, "resourceType", requests, "transferBytes", "cacheHits", "updatedAt")
       SELECT $1, date_trunc('hour', NOW()), item.route, item."resourceType", item.requests, item."transferBytes", item."cacheHits", NOW()
       FROM jsonb_to_recordset($2::jsonb) AS item(route text, "resourceType" text, requests integer, "transferBytes" bigint, "cacheHits" integer)
       ON CONFLICT ("clubId", hour, route, "resourceType") DO UPDATE SET
         requests = "TransferTelemetryHour".requests + EXCLUDED.requests,
         "transferBytes" = "TransferTelemetryHour"."transferBytes" + EXCLUDED."transferBytes",
         "cacheHits" = "TransferTelemetryHour"."cacheHits" + EXCLUDED."cacheHits",
         "updatedAt" = NOW()`,
      [user.clubId, JSON.stringify(entries)]
    ));
  if (vitals.length > 0) writes.push(query(
      `INSERT INTO "PerformanceTelemetryHour" ("clubId", hour, route, metric, samples, "totalValue", "maxValue", "ratedSamples", "ratedTotalValue", "ratedMaxValue", "goodSamples", "needsImprovementSamples", "updatedAt")
       SELECT $1, date_trunc('hour', NOW()), item.route, item.metric, 1, item.value, item.value, 1, item.value, item.value, item."goodSamples", item."needsImprovementSamples", NOW()
       FROM jsonb_to_recordset($2::jsonb) AS item(route text, metric text, value double precision, "goodSamples" integer, "needsImprovementSamples" integer)
       ON CONFLICT ("clubId", hour, route, metric) DO UPDATE SET
         samples = "PerformanceTelemetryHour".samples + 1,
         "totalValue" = "PerformanceTelemetryHour"."totalValue" + EXCLUDED."totalValue",
         "maxValue" = GREATEST("PerformanceTelemetryHour"."maxValue", EXCLUDED."maxValue"),
         "ratedSamples" = "PerformanceTelemetryHour"."ratedSamples" + 1,
         "ratedTotalValue" = "PerformanceTelemetryHour"."ratedTotalValue" + EXCLUDED."ratedTotalValue",
         "ratedMaxValue" = GREATEST("PerformanceTelemetryHour"."ratedMaxValue", EXCLUDED."ratedMaxValue"),
         "goodSamples" = "PerformanceTelemetryHour"."goodSamples" + EXCLUDED."goodSamples",
         "needsImprovementSamples" = "PerformanceTelemetryHour"."needsImprovementSamples" + EXCLUDED."needsImprovementSamples",
         "updatedAt" = NOW()`,
      [user.clubId, JSON.stringify(vitals)]
    ));
  await Promise.all(writes);

  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
