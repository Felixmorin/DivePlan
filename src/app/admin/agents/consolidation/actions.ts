"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/current-user";
import { query, withTransaction } from "@/lib/db";

const path = "/admin/agents/consolidation";
type Finding = { title?: string; priority?: string; impact?: string; effort?: string; location?: string; evidence?: string; limits?: string; recommendation?: string; confidence?: string; kind?: string };
type Source = { runId: string; agentId: string; agentName: string; createdAt: string; finding: Finding };

export async function prepareProposals() {
  await requireAdmin();
  const { rows } = await query<{ id: string; agentId: string; agentName: string; createdAt: Date; result: { findings?: Finding[]; recommendations?: string[] } | null }>(
    `SELECT r.id,r."agentId",a.name AS "agentName",r."createdAt",r.result FROM "AiAgentRun" r JOIN "AiAgent" a ON a.id=r."agentId" WHERE r.status='completed' AND r.result IS NOT NULL AND r."agentId" <> 'pr-consolidation' ORDER BY r."createdAt" DESC LIMIT 500`
  );
  const existing = await query<{ sources: Source[] }>(`SELECT sources FROM "AiPrProposal"`);
  const seen = new Set(existing.rows.flatMap((p) => p.sources.map((s) => `${s.runId}:${s.finding.title ?? ""}`)));
  const grouped = new Map<string, Source[]>();
  for (const run of rows) {
    const findings = run.result?.findings?.length ? run.result.findings : (run.result?.recommendations ?? []).map((title) => ({ title, recommendation: title }));
    for (const finding of findings) {
      const title = finding.title?.trim();
      if (!title || seen.has(`${run.id}:${title}`)) continue;
      const key = `${title.toLocaleLowerCase("fr").replace(/[^\p{L}\p{N}]+/gu, " ").trim()}|${(finding.location ?? "").toLocaleLowerCase("fr").trim()}`;
      const source = { runId: run.id, agentId: run.agentId, agentName: run.agentName, createdAt: run.createdAt.toISOString(), finding };
      grouped.set(key, [...(grouped.get(key) ?? []), source]);
    }
  }
  let added = 0;
  for (const sources of grouped.values()) {
    const first = sources[0].finding;
    const title = first.title ?? "Recommandation sans titre";
    const details = {
      change: first.recommendation ?? "Préciser le changement proposé à partir des preuves disponibles.",
      expected: "Résultat à confirmer lors de la préparation du correctif.",
      acceptance: ["Le problème et sa preuve sont vérifiables.", "Le changement proposé répond au constat.", "Les validations suggérées passent."],
      validation: "À exécuter après approbation; aucune validation n’a été effectuée par cette analyse.",
      risks: first.limits ?? "Risques et impacts à préciser avant correction.",
      dependencies: [], priority: first.priority ?? "À évaluer", effort: first.effort ?? "inconnu",
      confidence: first.confidence ?? "À évaluer selon la preuve du rapport source.",
      grouping: sources.length > 1 ? "Même intitulé et même composant observés par plusieurs exécutions." : "Recommandation issue d’une seule source; aucun regroupement automatique n’a été établi."
    };
    const id = randomUUID();
    await query(`INSERT INTO "AiPrProposal" (id,title,summary,sources,details,status,history) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [
      id, title, first.evidence ?? first.recommendation ?? "Constat rapporté par un agent d’analyse.", sources, details,
      sources.some((s) => !s.finding.evidence || !s.finding.recommendation) ? "À clarifier" : "En attente d’approbation",
      [{ at: new Date().toISOString(), event: "Proposition créée depuis les recommandations sources", actor: "Agent de consolidation", status: sources.some((s) => !s.finding.evidence || !s.finding.recommendation) ? "À clarifier" : "En attente d’approbation" }]
    ]);
    added++;
  }
  revalidatePath(path);
  return { added, examined: rows.length };
}

export async function decideProposal(input: { id: string; status: string; note?: string }) {
  const admin = await requireAdmin();
  const parsed = z.object({ id: z.string().uuid(), status: z.enum(["En attente d’approbation","À clarifier","À séparer","Approuvée","Refusée","Périmée"]), note: z.string().trim().max(1000).optional() }).safeParse(input);
  if (!parsed.success) throw new Error("Décision invalide.");
  const current = await query<{ title: string; summary: string; sources: unknown; details: unknown; status: string; history: unknown[] }>(`SELECT title,summary,sources,details,status,history FROM "AiPrProposal" WHERE id=$1`, [parsed.data.id]);
  const row = current.rows[0];
  if (!row) throw new Error("Proposition introuvable.");
  const history = [...row.history, { at: new Date().toISOString(), event: parsed.data.note || `Statut modifié : ${parsed.data.status}`, actor: admin.email, status: parsed.data.status, snapshot: { title: row.title, summary: row.summary, sources: row.sources, details: row.details, status: parsed.data.status } }];
  await query(`UPDATE "AiPrProposal" SET status=$2,history=$3, "updatedAt"=NOW() WHERE id=$1`, [parsed.data.id, parsed.data.status, history]);
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
        nextId, title, source.finding.evidence ?? row.summary, [source], row.details, status,
        [{ at: new Date().toISOString(), event: `Proposition séparée depuis ${row.title}`, actor: admin.email, status }]
      ]);
    }
    const history = [...row.history, { at: new Date().toISOString(), event: `Proposition séparée en ${row.sources.length} propositions`, actor: admin.email, status: "À séparer" }];
    await client.query(`UPDATE "AiPrProposal" SET status='À séparer',history=$2,"updatedAt"=NOW() WHERE id=$1`, [parsed.data, history]);
  });
  revalidatePath(path);
}
