import { requireAdmin } from "@/lib/current-user";
import { completeAdminHealthRun, recordAdminHealthRun } from "@/lib/admin-health-runs";
import { query } from "@/lib/db";
import { sendHealthDeviceTest } from "@/lib/web-push";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const user = await requireAdmin();
  if (!sameOrigin(request)) return Response.json({ error: "origin_invalid" }, { status: 403 });
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    const detail = "Configurez les clés VAPID pour envoyer un test Web Push.";
    await recordAdminHealthRun({ checkType: "push", status: "warning", detail, userId: user.id });
    return Response.json({ status: "warning", detail }, { status: 503 });
  }
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = z.object({ endpoint: z.string().url().max(2048), keys: z.object({ p256dh: z.string().min(40).max(200).regex(/^[A-Za-z0-9_-]+$/), auth: z.string().min(20).max(100).regex(/^[A-Za-z0-9_-]+$/) }).strict() }).strict().safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid_subscription" }, { status: 400 });
  try {
    const checkId = await recordAdminHealthRun({ checkType: "push", status: "pending", detail: "Envoi demandé; attente de l’accusé du service worker.", userId: user.id });
    if (!checkId) return Response.json({ status: "failed", detail: "La migration AdminHealthCheckRun n’est pas appliquée." }, { status: 503 });
    const sent = await sendHealthDeviceTest(parsed.data, { title: "Test de santé DivePlan", body: "Le service worker a reçu le test. L’accusé est en cours.", url: "/admin/sante-generale", healthCheckId: checkId });
    if (sent !== "accepted") {
      const detail = `Le fournisseur Push n’a pas accepté le test (${sent}).`;
      await completeAdminHealthRun(checkId, user.id, "failed", detail);
      return Response.json({ status: "failed", detail }, { status: 502 });
    }
    return Response.json({ status: "pending", checkId, detail: "Le fournisseur a accepté l’envoi; attente de la réception par ce navigateur." }, { headers: { "cache-control": "no-store" } });
  } catch {
    const detail = "Impossible de lire l’abonnement de test ou d’envoyer la notification.";
    await recordAdminHealthRun({ checkType: "push", status: "failed", detail, userId: user.id });
    return Response.json({ status: "failed", detail }, { status: 503 });
  }
}

export async function GET(request: Request) {
  const user = await requireAdmin();
  const checkId = new URL(request.url).searchParams.get("id");
  if (!checkId || !/^[0-9a-f-]{36}$/i.test(checkId)) return Response.json({ error: "invalid_id" }, { status: 400 });
  const result = await query<{ status: string; detail: string; checkedAt: Date }>(`SELECT status,detail,"checkedAt" FROM "AdminHealthCheckRun" WHERE id=$1 AND "userId"=$2 AND "checkType"='push' LIMIT 1`, [checkId, user.id]);
  const row = result.rows[0];
  if (!row) return Response.json({ error: "not_found" }, { status: 404 });
  if (row.status === "pending" && Date.now() - new Date(row.checkedAt).getTime() > 90_000) {
    await completeAdminHealthRun(checkId, user.id, "failed", "Aucun accusé du service worker dans les 90 secondes. Vérifiez la permission du navigateur et que l’application est ouverte sur cet appareil.");
    return Response.json({ status: "failed", detail: "Aucun accusé du service worker dans les 90 secondes." }, { headers: { "cache-control": "no-store" } });
  }
  return Response.json({ status: row.status, detail: row.detail }, { headers: { "cache-control": "no-store" } });
}

function sameOrigin(request: Request) { const origin = request.headers.get("origin"); return !origin || origin === new URL(request.url).origin; }
