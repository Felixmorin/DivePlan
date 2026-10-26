import { isCorrectionRunnerAuthorized } from "@/lib/pr-correction-runner";
import { withTransaction } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isCorrectionRunnerAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const task = await withTransaction(async (client) => {
      const { rows } = await client.query<{ id: string; agentId: string; analysisPeriod: "24h" | "7d" }>(
        `SELECT id,"agentId","analysisPeriod" FROM "AiAgentRun"
         WHERE "agentId"=ANY(ARRAY['nextjs-code-analyst','sql-supabase-analyst']) AND status='pending'
         ORDER BY "createdAt" ASC LIMIT 1 FOR UPDATE SKIP LOCKED`
      );
      const run = rows[0];
      if (!run) return null;
      await client.query(
        `UPDATE "AiAgentRun" SET status='running',"startedAt"=NOW() WHERE id=$1 AND status='pending'`,
        [run.id]
      );
      return run;
    });
    return Response.json({ task }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Unable to claim a code analysis." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
