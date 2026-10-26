import { z } from "zod";
import { revalidatePath } from "next/cache";
import { isCorrectionRunnerAuthorized } from "@/lib/pr-correction-runner";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

const statusSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("completed"), reportPath: z.string().regex(/^logs\/nextjs-code-analysis\/analysis-[\w-]+\.md$/) }),
  z.object({ status: z.literal("failed"), error: z.string().trim().min(1).max(1000) })
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

  const update = parsed.data.status === "completed"
    ? await query(
      `UPDATE "AiAgentRun" SET status='completed',result=$2,"finishedAt"=NOW(),error=NULL
       WHERE id=$1 AND "agentId"='nextjs-code-analyst' AND status='running'`,
      [parsedId.data, JSON.stringify({
        title: "Analyse du code Next.js",
        period: { label: "État du dépôt au lancement", from: new Date().toISOString(), to: new Date().toISOString() },
        sources: [{ name: parsed.data.reportPath, period: "Rapport local Codex", samples: 1 }],
        facts: [{ category: "Rapport", fact: "L’analyse Codex est terminée.", evidence: parsed.data.reportPath }],
        assumptions: [], recommendations: [], missing: ["Le rapport complet reste enregistré localement sur la machine du runner."],
        reportPath: parsed.data.reportPath
      })]
    )
    : await query(
      `UPDATE "AiAgentRun" SET status='failed',error=$2,"finishedAt"=NOW()
       WHERE id=$1 AND "agentId"='nextjs-code-analyst' AND status='running'`,
      [parsedId.data, parsed.data.error]
    );

  if (!update.rowCount) return Response.json({ error: "Run not found or no longer active." }, { status: 409, headers: { "Cache-Control": "no-store" } });
  revalidatePath("/admin/agents");
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
