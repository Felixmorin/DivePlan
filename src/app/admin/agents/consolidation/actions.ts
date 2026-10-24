"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/current-user";
import { query, withTransaction } from "@/lib/db";
import { consolidateAgentFindings } from "@/lib/pr-agent-consolidation";
import { hashCorrectionProposal, validateApprovedProposal, type ProposalDetails, type ProposalSource } from "@/lib/pr-correction-runner";
import { trackEvent } from "@/lib/monitoring";

const path = "/admin/agents/consolidation";
type Finding = { title?: string; priority?: string; impact?: string; effort?: string; location?: string; evidence?: string; limits?: string; recommendation?: string; confidence?: string; kind?: string };
type Source = { runId: string; agentId: string; agentName: string; createdAt: string; finding: Finding };
export async function prepareProposals() {
  await requireAdmin();
  const result = await consolidateAgentFindings();
  revalidatePath(path);
  return result;
}

export async function startCorrection(input: { id: string }) {
  const admin = await requireAdmin();
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) throw new Error("Identifiant de proposition invalide.");

  if (!process.env.CORRECTION_RUNNER_TOKEN) throw new Error("Définir CORRECTION_RUNNER_TOKEN dans les variables d’environnement serveur de DivePlan.");
  const repository = process.env.GITHUB_REPOSITORY ?? "Felixmorin/DivePlan";
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error("GITHUB_REPOSITORY est invalide.");

  const agent = await query<{ enabled: boolean }>(`SELECT enabled FROM "AiAgent" WHERE id='pr-correction'`);
  if (!agent.rows[0]?.enabled) throw new Error("L’Agent de correction est en pause. Activez-le dans la console avant de lancer une proposition.");

  const executionId = randomUUID();
  const proposal = await withTransaction(async (client) => {
    const { rows } = await client.query<{
      id: string; title: string; summary: string; sources: ProposalSource[]; details: ProposalDetails; status: string;
      correctionStatus: string; correctionExecutionId: string | null; history: Array<Record<string, unknown>>;
    }>(`SELECT id,title,summary,sources,details,status,"correctionStatus",history FROM "AiPrProposal" WHERE id=$1 FOR UPDATE`, [parsed.data.id]);
    const row = rows[0];
    if (!row) throw new Error("Proposition introuvable.");
    validateApprovedProposal(row);
    if ((row.correctionStatus === "En attente d’exécution" && row.correctionExecutionId) || ["En cours", "Modifications effectuées", "PR en brouillon prête à réviser", "Terminé après révision humaine"].includes(row.correctionStatus)) {
      throw new Error(`Une correction ne peut pas être lancée avec le statut « ${row.correctionStatus} ».`);
    }
    const history = [...row.history, { at: new Date().toISOString(), event: "Exécution locale préparée; l’administrateur lancera Codex avec son compte ChatGPT dans le dépôt local.", actor: admin.email, status: "En attente d’exécution" }];
    const proposalHash = hashCorrectionProposal(row);
    await client.query(`UPDATE "AiPrProposal" SET "correctionStatus"='En attente d’exécution',"correctionExecutionId"=$2,"correctionProposalHash"=$3,"correctionRunUrl"=NULL,"correctionPullRequestUrl"=NULL,history=$4,"updatedAt"=NOW() WHERE id=$1`, [row.id, executionId, proposalHash, JSON.stringify(history)]);
    return row;
  });

  await trackEvent({ type: "admin.agent.correction.prepared", message: "Proposition approuvée préparée pour le Codex local", userId: admin.id, metadata: { proposalId: proposal.id, executionId } });
  revalidatePath(path);
  return { executionId, correctionStatus: "En attente d’exécution" as const, repository };
}

export async function decideProposal(input: { id: string; status: string; note?: string }) {
  const admin = await requireAdmin();
  const parsed = z.object({ id: z.string().uuid(), status: z.enum(["En attente d’approbation","À clarifier","À séparer","Approuvée","Refusée","Périmée"]), note: z.string().trim().max(1000).optional() }).safeParse(input);
  if (!parsed.success) throw new Error("Décision invalide.");
  const current = await query<{ title: string; summary: string; sources: unknown; details: unknown; status: string; history: unknown[] }>(`SELECT title,summary,sources,details,status,history FROM "AiPrProposal" WHERE id=$1`, [parsed.data.id]);
  const row = current.rows[0];
  if (!row) throw new Error("Proposition introuvable.");
  const history = [...row.history, { at: new Date().toISOString(), event: parsed.data.note || `Statut modifié : ${parsed.data.status}`, actor: admin.email, status: parsed.data.status, snapshot: { title: row.title, summary: row.summary, sources: row.sources, details: row.details, status: parsed.data.status } }];
  await query(`UPDATE "AiPrProposal" SET status=$2,history=$3, "updatedAt"=NOW() WHERE id=$1`, [parsed.data.id, parsed.data.status, JSON.stringify(history)]);
  revalidatePath(path);
}

export async function splitProposal(id: string) {
  const admin = await requireAdmin();
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) throw new Error("Proposition invalide.");
  await withTransaction(async (client) => {
    const result = await client.query<{ title: string; summary: string; sources: Source[]; details: Record<string, unknown>; history: unknown[] }>(`SELECT title,summary,sources,details,history FROM "AiPrProposal" WHERE id=$1 FOR UPDATE`, [parsed.data]);
    const row = result.rows[0];
    if (!row) throw new Error("Proposition introuvable.");
    if (row.sources.length < 2) throw new Error("Cette proposition ne contient pas plusieurs recommandations à séparer.");
    for (const source of row.sources) {
      const nextId = randomUUID();
      const title = source.finding.title ?? row.title;
      const status = source.finding.evidence && source.finding.recommendation ? "En attente d’approbation" : "À clarifier";
      await client.query(`INSERT INTO "AiPrProposal" (id,title,summary,sources,details,status,history) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [
        nextId, title, source.finding.evidence ?? row.summary, JSON.stringify([source]), JSON.stringify(row.details), status,
        JSON.stringify([{ at: new Date().toISOString(), event: `Proposition séparée depuis ${row.title}`, actor: admin.email, status }])
      ]);
    }
    const history = [...row.history, { at: new Date().toISOString(), event: `Proposition séparée en ${row.sources.length} propositions`, actor: admin.email, status: "À séparer" }];
    await client.query(`UPDATE "AiPrProposal" SET status='À séparer',history=$2,"updatedAt"=NOW() WHERE id=$1`, [parsed.data, JSON.stringify(history)]);
  });
  revalidatePath(path);
}
