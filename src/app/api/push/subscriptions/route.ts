import { z } from "zod";
import { getCurrentUser } from "@/lib/current-user";
import { validatePushEndpoint } from "@/lib/push-endpoint";
import { query } from "@/lib/db";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({ p256dh: z.string().min(40).max(200).regex(/^[A-Za-z0-9_-]+$/), auth: z.string().min(20).max(100).regex(/^[A-Za-z0-9_-]+$/) }).strict()
}).strict();
const endpointSchema = z.object({ endpoint: z.string().url().max(2048) }).strict();

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!canUsePush(user)) return Response.json({ error: "forbidden" }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = subscriptionSchema.safeParse(body);
  if (!parsed.success || !validatePushEndpoint(parsed.data.endpoint)) return Response.json({ error: "invalid_subscription" }, { status: 400 });
  const { endpoint, keys } = parsed.data;
  try {
    await query(
      `INSERT INTO "PushSubscription" (id,"userId",endpoint,p256dh,auth) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (endpoint) DO UPDATE SET "userId"=EXCLUDED."userId",p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth,"updatedAt"=NOW(),"lastTestAt"=NULL`,
      [randomUUID(), user.id, endpoint, keys.p256dh, keys.auth]
    );
  } catch {
    return Response.json({ error: "storage_unavailable" }, { status: 503 });
  }
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!canUsePush(user)) return Response.json({ error: "forbidden" }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = endpointSchema.safeParse(body);
  if (!parsed.success || !validatePushEndpoint(parsed.data.endpoint)) return Response.json({ error: "invalid_endpoint" }, { status: 400 });
  await query(`DELETE FROM "PushSubscription" WHERE endpoint=$1 AND "userId"=$2`, [parsed.data.endpoint, user.id]);
  return Response.json({ ok: true });
}

function canUsePush(user: { role: string; athlete?: { active: boolean } | null }) {
  return user.role === "COACH" || (user.role === "ATHLETE" && user.athlete?.active === true);
}
