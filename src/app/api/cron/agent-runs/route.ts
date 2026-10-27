import { runNextAgentJobs } from "@/lib/agent-worker";
import { recordAdminHealthRun } from "@/lib/admin-health-runs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const processed = await runNextAgentJobs();
    await recordAdminHealthRun({ checkType: "cron:agent-runs", status: "ok", detail: `Tâche exécutée · ${processed} exécution(s) traitée(s).` });
    return Response.json({ processed });
  } catch (error) {
    console.error("Agent run worker failed", error);
    await recordAdminHealthRun({ checkType: "cron:agent-runs", status: "failed", detail: "L’exécution de la tâche des agents a échoué." });
    return Response.json({ error: "Agent run worker failed." }, { status: 500 });
  }
}
