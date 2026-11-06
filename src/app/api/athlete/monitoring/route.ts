import { NextResponse } from "next/server";
import { requireAthlete } from "@/lib/current-user";
import { query } from "@/lib/db";

export async function POST(request: Request) {
  const { user, clubId } = await requireAthlete();
  const body = await request.json().catch(() => null) as { visitId?: unknown; action?: unknown; path?: unknown } | null;
  if (!body || typeof body.visitId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.visitId) || typeof body.action !== "string" || typeof body.path !== "string") {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  const action = body.action.trim().slice(0, 120);
  const path = body.path.startsWith("/athlete") ? body.path.slice(0, 160) : "/athlete";
  if (!action) return NextResponse.json({ error: "Action manquante" }, { status: 400 });

  await query(
    `INSERT INTO "AppEvent" (id, type, message, "clubId", "userId", metadata)
     VALUES ($1, 'athlete.visit', 'Visite de l’application', $2, $3, jsonb_build_object('actions', jsonb_build_array(jsonb_build_object('action', $4::text, 'path', $5::text, 'at', NOW()))))
     ON CONFLICT (id) DO UPDATE SET metadata = jsonb_set(
       COALESCE("AppEvent".metadata, '{}'::jsonb), '{actions}',
       COALESCE("AppEvent".metadata->'actions', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('action', $4::text, 'path', $5::text, 'at', NOW()))
     ) WHERE "AppEvent"."userId" = $3 AND "AppEvent".type = 'athlete.visit'`,
    [body.visitId, clubId, user.id, action, path]
  );
  return NextResponse.json({ ok: true });
}
