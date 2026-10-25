import "server-only";
import { randomUUID } from "node:crypto";
import { query } from "@/lib/db";

type Finding = { title?: string; priority?: string; impact?: string; effort?: string; location?: string; evidence?: string; limits?: string; recommendation?: string; confidence?: string; kind?: string };
type Source = { runId: string; agentId: string; agentName: string; createdAt: string; finding: Finding };

export async function consolidateAgentFindings() {
  const { rows } = await query<{ id: string; agentId: string; agentName: string; createdAt: Date; result: { findings?: Finding[]; recommendations?: string[] } | null }>(
    `SELECT r.id,r."agentId",a.name AS "agentName",r."createdAt",r.result FROM "AiAgentRun" r JOIN "AiAgent" a ON a.id::text=r."agentId"::text WHERE r.status='completed' AND r.result IS NOT NULL AND r."agentId"::text <> 'pr-consolidation' ORDER BY r."createdAt" DESC LIMIT 500`
  );
  const existing = await query<{ sources: Source[] }>(`SELECT sources FROM "AiPrProposal"`);
  const seen = new Set(existing.rows.flatMap((proposal) => proposal.sources.map((source) => `${source.runId}:${source.finding.title ?? ""}`)));
  const grouped = new Map<string, Source[]>();
  for (const run of rows) {
    const findings: Finding[] = run.result?.findings?.length
      ? run.result.findings
      : (run.result?.recommendations ?? []).map((title): Finding => ({ title, recommendation: title }));
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
    const complete = sources.every((source) => source.finding.evidence && source.finding.recommendation);
    const status = complete ? "En attente d’approbation" : "À clarifier";
    await query(`INSERT INTO "AiPrProposal" (id,title,summary,sources,details,status,history) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [
      randomUUID(), title, first.evidence ?? first.recommendation ?? "Constat rapporté par un agent d’analyse.", JSON.stringify(sources), JSON.stringify(details), status,
      JSON.stringify([{ at: new Date().toISOString(), event: "Proposition créée depuis les recommandations sources", actor: "Agent de consolidation", status }])
    ]);
    added += 1;
  }
  return { added, examined: rows.length };
}
