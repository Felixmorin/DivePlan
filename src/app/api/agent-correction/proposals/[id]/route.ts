import { z } from "zod";
import { getApprovedCorrectionProposal, isCorrectionRunnerAuthorized } from "@/lib/pr-correction-runner";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RouteContext<"/api/agent-correction/proposals/[id]">) {
  if (!isCorrectionRunnerAuthorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const { id } = await context.params;
  const parsedId = z.string().uuid().safeParse(id);
  const executionId = z.string().uuid().safeParse(new URL(request.url).searchParams.get("execution_id"));
  if (!parsedId.success || !executionId.success) return Response.json({ error: "Invalid proposal or execution identifier." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  try {
    const proposal = await getApprovedCorrectionProposal(parsedId.data, executionId.data);
    return Response.json({
      id: proposal.id,
      title: proposal.title,
      summary: proposal.summary,
      sources: proposal.sources.map((source) => ({
        agentName: source.agentName ?? "Agent source", runId: source.runId ?? null,
        location: source.finding?.location ?? null, title: source.finding?.title ?? "",
        evidence: source.finding?.evidence ?? "", recommendation: source.finding?.recommendation ?? "",
        limits: source.finding?.limits ?? null
      })),
      changes: proposal.details.change,
      expectedResult: proposal.details.expected,
      acceptanceCriteria: proposal.details.acceptance,
      validations: proposal.details.validation,
      risks: proposal.details.risks ?? null,
      dependencies: proposal.details.dependencies ?? []
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Proposal unavailable.";
    return Response.json({ error: message }, { status: message === "Proposition introuvable." ? 404 : 409, headers: { "Cache-Control": "no-store" } });
  }
}
