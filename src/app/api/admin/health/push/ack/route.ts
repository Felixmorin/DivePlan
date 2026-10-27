import { z } from "zod";
import { requireAdmin } from "@/lib/current-user";
import { completeAdminHealthRun } from "@/lib/admin-health-runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const user = await requireAdmin();
  if (!sameOrigin(request)) return Response.json({ error: "origin_invalid" }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = z.object({ checkId: z.string().uuid() }).strict().safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid_check_id" }, { status: 400 });
  const completed = await completeAdminHealthRun(parsed.data.checkId, user.id, "ok", "Le service worker a reçu le push et a affiché la notification sur cet appareil.");
  return Response.json({ ok: completed }, { status: completed ? 200 : 404, headers: { "cache-control": "no-store" } });
}
function sameOrigin(request: Request) { const origin = request.headers.get("origin"); return !origin || origin === new URL(request.url).origin; }
