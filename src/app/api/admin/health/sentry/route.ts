import * as Sentry from "@sentry/nextjs";
import { requireAdmin } from "@/lib/current-user";
import { recordAdminHealthRun } from "@/lib/admin-health-runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const user = await requireAdmin();
  if (!sameOrigin(request)) return Response.json({ error: "origin_invalid" }, { status: 403 });
  const token = process.env.SENTRY_AUTH_TOKEN;
  const organization = process.env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT;
  const dsn = process.env.SENTRY_DSN;
  if (!token || !organization || !project || !dsn) {
    const detail = "Configurez SENTRY_DSN, SENTRY_AUTH_TOKEN (scope project:read), SENTRY_ORG et SENTRY_PROJECT pour envoyer puis confirmer un événement de test.";
    await recordAdminHealthRun({ checkType: "sentry", status: "warning", detail, userId: user.id });
    return Response.json({ status: "warning", detail }, { status: 503, headers: { "cache-control": "no-store" } });
  }

  const id = crypto.randomUUID();
  const message = `DivePlan health check ${id}`;
  let eventId: string | undefined;
  try {
    Sentry.withScope(scope => {
      scope.setLevel("info");
      scope.setTag("diveplan.health_check", "true");
      scope.setTag("diveplan.health_check_id", id);
      eventId = Sentry.captureMessage(message);
    });
    const flushed = await Sentry.flush(3_000);
    if (!eventId || !flushed) throw new Error("sentry_flush_failed");
    const apiBase = process.env.SENTRY_API_URL || "https://sentry.io";
    const apiUrl = new URL(`/api/0/projects/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/events/${encodeURIComponent(eventId)}/`, apiBase);
    if (apiUrl.protocol !== "https:") throw new Error("sentry_api_url_must_use_https");
    let confirmed = false;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(apiUrl, { headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(2500) });
      if (response.ok) {
        const event = await response.json().catch(() => null) as { eventID?: string; id?: string } | null;
        if (event?.eventID === eventId || event?.id === eventId) { confirmed = true; break; }
        throw new Error("sentry_event_id_mismatch");
      }
      if (response.status !== 404) throw new Error(`sentry_api_${response.status}`);
      await new Promise(resolve => setTimeout(resolve, 600));
    }
    const status = confirmed ? "ok" : "failed";
    const detail = confirmed ? `Événement de test envoyé puis retrouvé dans Sentry (${eventId}).` : `Sentry a accepté l’envoi (${eventId}), mais l’événement n’a pas été retrouvé via son API.`;
    await recordAdminHealthRun({ checkType: "sentry", status, detail, userId: user.id, metadata: { eventId, checkId: id } });
    return Response.json({ status, detail }, { status: confirmed ? 200 : 502, headers: { "cache-control": "no-store" } });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "sentry_check_failed";
    const detail = reason.startsWith("sentry_api_") ? `La vérification Sentry a échoué (${reason.replace("sentry_api_", "HTTP ")}); vérifiez le jeton et les identifiants du projet.` : "Impossible d’envoyer et de confirmer l’événement Sentry. Vérifiez la configuration et les journaux serveur.";
    await recordAdminHealthRun({ checkType: "sentry", status: "failed", detail, userId: user.id, metadata: { eventId: eventId ?? null, checkId: id } });
    return Response.json({ status: "failed", detail }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
function sameOrigin(request: Request) { const origin = request.headers.get("origin"); return !origin || origin === new URL(request.url).origin; }
