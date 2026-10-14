import { getCurrentUser } from "@/lib/current-user";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const resourceTypes = new Set(["document", "script", "style", "image", "font", "fetch", "other"]);
const maxRequestBytes = 20_000;
const maxEntries = 40;

type Entry = { route: string; resourceType: string; requests: number; transferBytes: number; cacheHits: number };

function normalizeRoute(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 200 || !input.startsWith("/") || input.startsWith("//")) return null;
  const segments = input.split("/").filter(Boolean).map((segment) => {
    if (/^[0-9]+$/.test(segment) || /^[a-z0-9_-]{20,}$/i.test(segment) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)) return ":id";
    return segment.replace(/[^a-zA-Z0-9._~-]/g, "");
  });
  return `/${segments.join("/")}`.slice(0, 200);
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
  if (!Array.isArray(rawEntries) || rawEntries.length === 0 || rawEntries.length > maxEntries) {
    return Response.json({ error: "invalid_entries" }, { status: 400 });
  }

  const entries: Entry[] = [];
  for (const value of rawEntries) {
    if (!value || typeof value !== "object") continue;
    const item = value as Record<string, unknown>;
    const route = normalizeRoute(item.route);
    if (!route || typeof item.resourceType !== "string" || !resourceTypes.has(item.resourceType)) continue;
    const requests = Number(item.requests);
    const transferBytes = Number(item.transferBytes);
    const cacheHits = Number(item.cacheHits);
    if (!Number.isInteger(requests) || requests < 1 || requests > 100_000
      || !Number.isSafeInteger(transferBytes) || transferBytes < 0 || transferBytes > 100_000_000
      || !Number.isInteger(cacheHits) || cacheHits < 0 || cacheHits > requests) continue;
    entries.push({ route, resourceType: item.resourceType, requests, transferBytes, cacheHits });
  }
  if (entries.length === 0) return Response.json({ error: "invalid_entries" }, { status: 400 });

  await query(
    `INSERT INTO "TransferTelemetryHour" ("clubId", hour, route, "resourceType", requests, "transferBytes", "cacheHits", "updatedAt")
     SELECT $1, date_trunc('hour', NOW()), item.route, item."resourceType", item.requests, item."transferBytes", item."cacheHits", NOW()
     FROM jsonb_to_recordset($2::jsonb) AS item(route text, "resourceType" text, requests integer, "transferBytes" bigint, "cacheHits" integer)
     ON CONFLICT ("clubId", hour, route, "resourceType") DO UPDATE SET
       requests = "TransferTelemetryHour".requests + EXCLUDED.requests,
       "transferBytes" = "TransferTelemetryHour"."transferBytes" + EXCLUDED."transferBytes",
       "cacheHits" = "TransferTelemetryHour"."cacheHits" + EXCLUDED."cacheHits",
       "updatedAt" = NOW()`,
    [user.clubId, JSON.stringify(entries)]
  );

  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
