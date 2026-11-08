import { NextResponse } from "next/server";
import { requireAthlete } from "@/lib/current-user";
import { query } from "@/lib/db";

export async function POST(request: Request) {
  const { user, clubId } = await requireAthlete();
  const body = await request.json().catch(() => null) as { visitId?: unknown; action?: unknown; path?: unknown; actions?: unknown } | null;
  if (!body || typeof body.visitId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.visitId)) {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  let rawActions: unknown[];
  if (Array.isArray(body.actions)) {
    rawActions = body.actions;
  } else {
    let legacyBatch: unknown = null;
    if (typeof body.action === "string" && body.action.trimStart().startsWith("[")) {
      try { legacyBatch = JSON.parse(body.action); } catch { /* A normal label can start with a bracket. */ }
    }
    rawActions = Array.isArray(legacyBatch) ? legacyBatch : [{ action: body.action, path: body.path }];
  }
  if (!rawActions.length || rawActions.length > 10) return NextResponse.json({ error: "Actions invalides" }, { status: 400 });
  const actions = rawActions.map((item) => {
    if (!item || typeof item !== "object" || !("action" in item) || typeof item.action !== "string" || !("path" in item) || typeof item.path !== "string") return null;
    const action = item.action.trim().slice(0, 120);
    if (!action) return null;
    const path = item.path.startsWith("/athlete") ? item.path.slice(0, 160) : "/athlete";
    return { action, path, at: new Date().toISOString() };
  });
  if (actions.some((item) => item === null)) return NextResponse.json({ error: "Actions invalides" }, { status: 400 });

  await query(
    `INSERT INTO "AppEvent" (id, type, message, "clubId", "userId", metadata)
     VALUES ($1, 'athlete.visit', 'Visite de l’application', $2, $3, jsonb_build_object('actions', $4::jsonb))
     ON CONFLICT (id) DO UPDATE SET metadata = jsonb_set(
       COALESCE("AppEvent".metadata, '{}'::jsonb), '{actions}',
       COALESCE("AppEvent".metadata->'actions', '[]'::jsonb) || $4::jsonb
     ) WHERE "AppEvent"."userId" = $3 AND "AppEvent".type = 'athlete.visit'`,
    [body.visitId, clubId, user.id, JSON.stringify(actions)]
  );
  return NextResponse.json({ ok: true });
}
