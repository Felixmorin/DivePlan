import { isCorrectionRunnerAuthorized, hashCorrectionProposal, validateApprovedProposal, type ProposalDetails, type ProposalSource } from "@/lib/pr-correction-runner";
import { withTransaction } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isCorrectionRunnerAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const task = await withTransaction(async (client) => {
      const { rows } = await client.query<{
        id: string; title: string; summary: string; sources: ProposalSource[]; details: ProposalDetails;
        status: string; correctionExecutionId: string | null; correctionProposalHash: string | null;
        correctionStatus: string; history: Array<Record<string, unknown>>;
      }>(`SELECT id,title,summary,sources,details,status,"correctionExecutionId","correctionProposalHash","correctionStatus",history
          FROM "AiPrProposal"
          WHERE status='Approuvée' AND "correctionStatus"='En attente d’exécution' AND "correctionExecutionId" IS NOT NULL
          ORDER BY "updatedAt" ASC
          LIMIT 1 FOR UPDATE SKIP LOCKED`);
      const proposal = rows[0];
      if (!proposal) return null;

      let validationError: string | null = null;
      try { validateApprovedProposal(proposal); } catch (error) { validationError = error instanceof Error ? error.message : "Proposition invalide."; }
      if (validationError || !proposal.correctionProposalHash || hashCorrectionProposal(proposal) !== proposal.correctionProposalHash) {
        const history = [...(proposal.history ?? []), {
          at: new Date().toISOString(), event: validationError ?? "Proposition modifiée après préparation; runner local a refusé la tâche.",
          actor: "Agent de correction · runner local", status: "Bloqué"
        }];
        await client.query(`UPDATE "AiPrProposal" SET "correctionStatus"='Bloqué',history=$2,"updatedAt"=NOW() WHERE id=$1`, [proposal.id, JSON.stringify(history)]);
        return null;
      }

      const history = [...(proposal.history ?? []), {
        at: new Date().toISOString(), event: "Runner local a pris en charge la correction.",
        actor: "Agent de correction · runner local", status: "En cours"
      }];
      await client.query(`UPDATE "AiPrProposal" SET "correctionStatus"='En cours',history=$2,"updatedAt"=NOW() WHERE id=$1 AND "correctionExecutionId"=$3`, [proposal.id, JSON.stringify(history), proposal.correctionExecutionId]);
      return { proposalId: proposal.id, executionId: proposal.correctionExecutionId };
    });

    return Response.json({ task }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to claim a correction." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
