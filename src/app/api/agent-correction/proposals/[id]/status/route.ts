import { z } from "zod";
import { isCorrectionRunnerAuthorized, updateCorrectionExecution } from "@/lib/pr-correction-runner";

export const dynamic = "force-dynamic";

const statusSchema = z.object({
  executionId: z.string().uuid(),
  status: z.enum(["En cours", "Bloqué", "Modifications effectuées", "Vérifications échouées", "PR en brouillon prête à réviser", "Terminé sans modification", "Abandonné"]),
  note: z.string().trim().min(1).max(1500),
  runNumber: z.number().int().positive().optional(),
  pullRequestUrl: z.string().url().optional()
});

export async function POST(request: Request, context: RouteContext<"/api/agent-correction/proposals/[id]/status">) {
  if (!isCorrectionRunnerAuthorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const parsedId = z.string().uuid().safeParse(id);
  if (!parsedId.success) return Response.json({ error: "Invalid proposal identifier." }, { status: 400 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }
  const parsed = statusSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid correction status update." }, { status: 400 });
  let pullRequestUrl: string | undefined;
  if (parsed.data.pullRequestUrl) {
    try {
      const url = new URL(parsed.data.pullRequestUrl);
      const repository = process.env.GITHUB_REPOSITORY;
      if (url.protocol !== "https:" || url.hostname !== "github.com" || !repository || !url.pathname.startsWith(`/${repository}/pull/`) || !/\/pull\/\d+$/.test(url.pathname)) {
        return Response.json({ error: "Pull request URL does not match the configured repository." }, { status: 400 });
      }
      pullRequestUrl = url.toString();
    } catch { return Response.json({ error: "Invalid pull request URL." }, { status: 400 }); }
  }
  const repository = process.env.GITHUB_REPOSITORY;
  const runUrl = parsed.data.runNumber && repository ? `https://github.com/${repository}/actions/runs/${parsed.data.runNumber}` : undefined;
  try {
    await updateCorrectionExecution({ proposalId: parsedId.data, executionId: parsed.data.executionId, status: parsed.data.status, note: parsed.data.note, runUrl, pullRequestUrl });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to update correction status." }, { status: 409 });
  }
}
