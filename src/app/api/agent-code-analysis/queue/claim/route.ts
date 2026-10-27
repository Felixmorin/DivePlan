import { isCorrectionRunnerAuthorized } from "@/lib/pr-correction-runner";
import { query, withTransaction } from "@/lib/db";
import { runArchitectureCartography, summarizePreviousCartography } from "@/lib/architecture-agent";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isCorrectionRunnerAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const task = await withTransaction(async (client) => {
      const { rows } = await client.query<{ id: string; agentId: string; analysisPeriod: "24h" | "7d" }>(
        `SELECT id,"agentId","analysisPeriod" FROM "AiAgentRun"
         WHERE "agentId"=ANY(ARRAY['nextjs-code-analyst','sql-supabase-analyst','diveplan-observability','architecture-cartographer']) AND status='pending'
         ORDER BY "createdAt" ASC LIMIT 1 FOR UPDATE SKIP LOCKED`
      );
      const run = rows[0];
      if (!run) return null;
      await client.query(
        `UPDATE "AiAgentRun" SET status='running',"startedAt"=NOW() WHERE id=$1 AND status='pending'`,
        [run.id]
      );
      if (run.agentId !== "diveplan-observability") return run;
      const hours = run.analysisPeriod === "24h" ? 24 : 168;
      const vitals = await client.query(`SELECT route,metric,(SUM("ratedTotalValue") / NULLIF(SUM("ratedSamples"),0))::float8 AS average,SUM("ratedSamples")::int AS samples FROM "PerformanceTelemetryHour" WHERE hour >= NOW()-($1::int*INTERVAL '1 hour') GROUP BY route,metric ORDER BY SUM("ratedSamples") DESC LIMIT 100`, [hours]);
      const routes = await client.query(`SELECT route,SUM(requests)::int AS requests,SUM("transferBytes")::bigint AS bytes FROM "TransferTelemetryHour" WHERE hour >= NOW()-($1::int*INTERVAL '1 hour') GROUP BY route ORDER BY SUM("transferBytes") DESC LIMIT 20`, [hours]);
      const errors = await client.query(`SELECT type,count(*)::int AS count FROM "AppEvent" WHERE "createdAt">=NOW()-($1::int*INTERVAL '1 hour') AND type~*'(error|exception|failed)' GROUP BY type ORDER BY count(*) DESC LIMIT 50`, [hours]);
      return { ...run, observability: { period: run.analysisPeriod, from: new Date(Date.now() - hours * 3600000).toISOString(), to: new Date().toISOString(), vitals: vitals.rows, routes: routes.rows, errors: errors.rows } };
    });
    if (task?.agentId === "architecture-cartographer") {
      try {
        const previous = await query<{ result: unknown }>(
          `SELECT result FROM "AiAgentRun" WHERE "agentId"=$1 AND status='completed' AND id<>$2 ORDER BY "createdAt" DESC LIMIT 1`,
          [task.agentId, task.id]
        );
        const architecture = await runArchitectureCartography(summarizePreviousCartography(previous.rows[0]?.result));
        return Response.json({ task: { ...task, architecture } }, { headers: { "Cache-Control": "no-store" } });
      } catch {
        await query(`UPDATE "AiAgentRun" SET status='failed',error=$2,"finishedAt"=NOW() WHERE id=$1 AND status='running'`, [task.id, "La cartographie déterministe n’a pas pu être produite."]);
        return Response.json({ error: "Unable to prepare an architecture cartography." }, { status: 500, headers: { "Cache-Control": "no-store" } });
      }
    }
    return Response.json({ task }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Unable to claim a code analysis." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
