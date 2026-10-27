import { z } from "zod";
import { revalidatePath } from "next/cache";
import { isCorrectionRunnerAuthorized } from "@/lib/pr-correction-runner";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

const statusSchema = z.union([
  z.object({
    status: z.literal("completed"), agentId: z.literal("diveplan-observability"),
    reportPath: z.string().regex(/^logs\/observability\/analysis-[\w-]+\.json$/),
    report: z.object({ title: z.string().max(200), period: z.object({ label: z.string().max(100), from: z.string(), to: z.string() }),
      sources: z.array(z.object({ name: z.string().max(160), period: z.string().max(100), samples: z.number().int().nonnegative() })).max(10),
      facts: z.array(z.object({ category: z.string().max(100), fact: z.string().max(1000), evidence: z.string().max(500) })).max(100),
      assumptions: z.array(z.string().max(1000)).max(30), recommendations: z.array(z.string().max(1000)).max(30), missing: z.array(z.string().max(1000)).max(30)
    })
  }),
  z.object({
    status: z.literal("completed"),
    agentId: z.enum(["nextjs-code-analyst", "sql-supabase-analyst"]),
    reportPath: z.string().regex(/^logs\/(?:nextjs-code-analysis|sql-supabase-analysis)\/analysis-[\w-]+\.md$/)
  }).refine((data) => data.agentId === "nextjs-code-analyst"
    ? data.reportPath.startsWith("logs/nextjs-code-analysis/")
    : data.reportPath.startsWith("logs/sql-supabase-analysis/")),
  z.object({ status: z.literal("failed"), agentId: z.enum(["nextjs-code-analyst", "sql-supabase-analyst", "diveplan-observability"]), error: z.string().trim().min(1).max(1000) })
]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isCorrectionRunnerAuthorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const { id } = await context.params;
  const parsedId = z.string().uuid().safeParse(id);
  if (!parsedId.success) return Response.json({ error: "Invalid run identifier." }, { status: 400 });

  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }
  const parsed = statusSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid code analysis status update." }, { status: 400 });

  const update = parsed.data.status === "completed" && parsed.data.agentId === "diveplan-observability"
    ? await query(
      `UPDATE "AiAgentRun" SET status='completed',result=$3,"finishedAt"=NOW(),error=NULL
       WHERE id=$1 AND "agentId"=$2 AND status='running'`,
      [parsedId.data, parsed.data.agentId, JSON.stringify({ ...parsed.data.report, reportPath: parsed.data.reportPath })]
    )
    : parsed.data.status === "completed"
    ? await query(
      `UPDATE "AiAgentRun" SET status='completed',result=$3,"finishedAt"=NOW(),error=NULL
       WHERE id=$1 AND "agentId"=$2 AND status='running'`,
      [parsedId.data, parsed.data.agentId, JSON.stringify({
        title: parsed.data.agentId === "sql-supabase-analyst" ? "Analyse SQL & Supabase par Codex" : "Analyse du code Next.js",
        period: { label: "État du dépôt au lancement", from: new Date().toISOString(), to: new Date().toISOString() },
        sources: [{ name: parsed.data.reportPath, period: "Rapport local Codex", samples: 1 }],
        facts: [{ category: "Rapport", fact: "L’analyse Codex est terminée.", evidence: parsed.data.reportPath }],
        assumptions: [], recommendations: [], missing: ["Le rapport complet reste enregistré localement sur la machine du runner."],
        reportPath: parsed.data.reportPath
      })]
    )
    : await query(
      `UPDATE "AiAgentRun" SET status='failed',error=$3,"finishedAt"=NOW()
       WHERE id=$1 AND "agentId"=$2 AND status='running'`,
      [parsedId.data, parsed.data.agentId, parsed.data.error]
    );

  if (!update.rowCount) return Response.json({ error: "Run not found or no longer active." }, { status: 409, headers: { "Cache-Control": "no-store" } });
  revalidatePath("/admin/agents");
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
