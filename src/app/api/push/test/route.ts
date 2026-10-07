import { z } from "zod";
import { getCurrentUser } from "@/lib/current-user";
import { sendDeviceTest } from "@/lib/web-push";
import { validatePushEndpoint } from "@/lib/push-endpoint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "COACH" && !(user.role === "ATHLETE" && user.athlete?.active === true)) return Response.json({ error: "forbidden" }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = z.object({ endpoint: z.string().url().max(2048) }).strict().safeParse(body);
  if (!parsed.success || !validatePushEndpoint(parsed.data.endpoint)) return Response.json({ error: "invalid_endpoint" }, { status: 400 });
  const result = await sendDeviceTest(user.id, parsed.data.endpoint);
  const messages = {
    accepted: { status: 202, message: "Le service push a accepté l’envoi. La réception sur cet appareil n’est pas confirmée." },
    failed: { status: 502, message: "Le service push n’a pas accepté l’envoi." },
    not_found: { status: 404, message: "Cet appareil n’est plus associé à ce compte. Active de nouveau les notifications." },
    expired: { status: 410, message: "Le service push a rejeté cet abonnement expiré. Désactive puis réactive les notifications sur cet appareil." },
    rate_limited: { status: 429, message: "Attends quelques secondes avant un autre test." }
  } as const;
  const providerStatus = result.startsWith("push_provider_") ? Number(result.slice("push_provider_".length)) : null;
  const response = providerStatus === 400 || providerStatus === 401 || providerStatus === 403
    ? { status: 502, message: `Le service push a refusé l’authentification VAPID (HTTP ${providerStatus}). Vérifie que les clés VAPID publique et privée configurées sur l’hébergement proviennent de la même paire, puis redéploie.` }
    : providerStatus === 413
      ? { status: 502, message: "Le service push a refusé le contenu de la notification (HTTP 413)." }
      : providerStatus === 429
        ? { status: 502, message: "Le service push limite temporairement les envois. Réessaie plus tard." }
        : providerStatus !== null && Number.isInteger(providerStatus)
          ? { status: 502, message: `Le fournisseur push a refusé l’envoi (HTTP ${providerStatus}). Réessaie; si le problème continue, vérifie les clés VAPID de l’hébergement.` }
          : messages[result as keyof typeof messages] ?? messages.failed;
  return Response.json({ status: result, message: response.message }, { status: response.status });
}
