import { requireAdmin } from "@/lib/current-user";
import { recordAdminHealthRun } from "@/lib/admin-health-runs";
import { runDivePlanAuthProbe } from "@/lib/admin-auth-probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const user = await requireAdmin();
  if (!sameOrigin(request)) return Response.json({ error: "origin_invalid" }, { status: 403 });
  const result = await runDivePlanAuthProbe(false);
  const status = result.ok ? "ok" : result.detail.includes("Configurez") ? "warning" : "failed";
  await recordAdminHealthRun({ checkType: "auth", status, detail: result.detail, userId: user.id, metadata: { role: result.role ?? null } });
  return Response.json({ status, detail: result.detail }, { status: result.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
function sameOrigin(request: Request) { const origin = request.headers.get("origin"); return !origin || origin === new URL(request.url).origin; }
