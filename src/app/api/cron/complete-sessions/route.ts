import { completeExpiredTrainingSessions, startDueTrainingSessions } from "@/lib/session-status";
import { recordAdminHealthRun } from "@/lib/admin-health-runs";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!secret) {
    return Response.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  }

  if (authorization !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const startedCount = await startDueTrainingSessions();
    const completedCount = await completeExpiredTrainingSessions();
    await recordAdminHealthRun({ checkType: "cron:complete-sessions", status: "ok", detail: `Tâche exécutée · ${startedCount} démarrée(s), ${completedCount} complétée(s).` });
    return Response.json({ startedCount, completedCount });
  } catch (error) {
    await recordAdminHealthRun({ checkType: "cron:complete-sessions", status: "failed", detail: "L’exécution de la tâche de séances a échoué." });
    throw error;
  }
}
