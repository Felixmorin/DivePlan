import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { query, withTransaction } from "@/lib/db";

export type CorrectionStatus = "En attente d’exécution" | "En cours" | "Bloqué" | "Modifications effectuées" | "Vérifications échouées" | "PR en brouillon prête à réviser" | "Terminé après révision humaine" | "Abandonné";

export type ProposalDetails = {
  change?: string;
  expected?: string;
  acceptance?: string[];
  validation?: string;
  risks?: string;
  dependencies?: string[];
};
export type ProposalSource = {
  runId?: string;
  agentName?: string;
  createdAt?: string;
  finding?: { title?: string; location?: string; evidence?: string; recommendation?: string; limits?: string };
};

export function isCorrectionRunnerAuthorized(request: Request) {
  const expected = process.env.CORRECTION_RUNNER_TOKEN;
  const actual = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || !actual) return false;
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

export function validateApprovedProposal(row: { title: string; summary: string; sources: ProposalSource[]; details: ProposalDetails; status: string }) {
  if (row.status !== "Approuvée") throw new Error("La proposition n’est plus approuvée.");
  if (!row.title?.trim() || !row.summary?.trim() || !row.details?.change?.trim() || !row.details?.expected?.trim()) {
    throw new Error("Proposition incomplète : titre, constat, changement proposé et résultat attendu requis.");
  }
  if (!Array.isArray(row.sources) || row.sources.length === 0 || row.sources.some((source) => !source.finding?.title?.trim() || !source.finding?.evidence?.trim() || !source.finding?.recommendation?.trim())) {
    throw new Error("Proposition incomplète : chaque recommandation source doit contenir un titre, une preuve et une recommandation.");
  }
  if (!Array.isArray(row.details.acceptance) || !row.details.acceptance.some((criterion) => criterion.trim()) || !row.details.validation?.trim()) {
    throw new Error("Proposition incomplète : critères d’acceptation et validations requis.");
  }
}

export function hashCorrectionProposal(row: { title: string; summary: string; sources: ProposalSource[]; details: ProposalDetails }) {
  return createHash("sha256").update(JSON.stringify({ title: row.title, summary: row.summary, sources: row.sources, details: row.details })).digest("hex");
}

export async function getApprovedCorrectionProposal(id: string, executionId: string) {
  const result = await query<{
    id: string; title: string; summary: string; sources: ProposalSource[]; details: ProposalDetails; status: string;
    correctionExecutionId: string | null; correctionProposalHash: string | null;
  }>(`SELECT id,title,summary,sources,details,status,"correctionExecutionId","correctionProposalHash" FROM "AiPrProposal" WHERE id=$1`, [id]);
  const proposal = result.rows[0];
  if (!proposal) throw new Error("Proposition introuvable.");
  if (proposal.correctionExecutionId !== executionId) throw new Error("Cette exécution ne correspond plus à la demande active.");
  validateApprovedProposal(proposal);
  if (!proposal.correctionProposalHash || hashCorrectionProposal(proposal) !== proposal.correctionProposalHash) throw new Error("Le contenu de la proposition a changé depuis le lancement; une nouvelle exécution est requise.");
  return proposal;
}

export async function updateCorrectionExecution(input: {
  proposalId: string;
  executionId: string;
  status: CorrectionStatus;
  note: string;
  runUrl?: string;
  pullRequestUrl?: string;
}) {
  await withTransaction(async (client) => {
    const { rows } = await client.query<{
      status: string; correctionExecutionId: string | null; correctionProposalHash: string | null;
      title: string; summary: string; sources: ProposalSource[]; details: ProposalDetails; history: Array<Record<string, unknown>>;
    }>(
      `SELECT status,"correctionExecutionId","correctionProposalHash",title,summary,sources,details,history FROM "AiPrProposal" WHERE id=$1 FOR UPDATE`, [input.proposalId]
    );
    const proposal = rows[0];
    if (!proposal) throw new Error("Proposition introuvable.");
    if (proposal.correctionExecutionId !== input.executionId) throw new Error("Cette exécution ne correspond plus à la demande active.");
    if (["En cours", "Modifications effectuées", "PR en brouillon prête à réviser", "Terminé après révision humaine"].includes(input.status)) {
      validateApprovedProposal(proposal);
      if (!proposal.correctionProposalHash || hashCorrectionProposal(proposal) !== proposal.correctionProposalHash) {
        throw new Error("Le contenu de la proposition a changé; cette exécution ne peut pas publier son résultat.");
      }
    }
    const history = [...(proposal.history ?? []), {
      at: new Date().toISOString(), event: input.note, actor: "Agent de correction · Codex local", status: input.status
    }];
    await client.query(
      `UPDATE "AiPrProposal" SET "correctionStatus"=$3,"correctionRunUrl"=COALESCE($4,"correctionRunUrl"),"correctionPullRequestUrl"=COALESCE($5,"correctionPullRequestUrl"),history=$6,"updatedAt"=NOW() WHERE id=$1 AND "correctionExecutionId"=$2`,
      [input.proposalId, input.executionId, input.status, input.runUrl ?? null, input.pullRequestUrl ?? null, JSON.stringify(history)]
    );
  });
}
