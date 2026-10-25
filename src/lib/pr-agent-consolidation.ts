import "server-only";
import { randomUUID } from "node:crypto";
import { query, withTransaction } from "@/lib/db";

type Finding = { title?: string; priority?: string; impact?: string; effort?: string; location?: string; evidence?: string; limits?: string; recommendation?: string; confidence?: string; kind?: string };
type Source = { runId: string; agentId: string; agentName: string; createdAt: string; finding: Finding };
type Proposal = { id: string; title: string; summary: string; sources: Source[]; details: Record<string, unknown>; status: string; history: Array<Record<string, unknown>>; createdAt: Date };

function findingKey(finding: Finding) {
  const title = finding.title?.trim();
  if (!title) return null;
  return `${title.toLocaleLowerCase("fr").replace(/[^\p{L}\p{N}]+/gu, " ").trim()}|${(finding.location ?? "").toLocaleLowerCase("fr").trim()}`;
}

function proposalKey(proposal: Proposal) {
  const keys = new Set(proposal.sources.map((source) => findingKey(source.finding)));
  return keys.size === 1 ? [...keys][0] ?? null : null;
}

function uniqueSources(sources: Source[]) {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = `${source.runId}:${source.finding.title ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function consolidateAgentFindings() {
  const { rows } = await query<{ id: string; agentId: string; agentName: string; createdAt: Date; result: { findings?: Finding[]; recommendations?: string[] } | null }>(
    `SELECT r.id,r."agentId",a.name AS "agentName",r."createdAt",r.result FROM "AiAgentRun" r JOIN "AiAgent" a ON a.id=r."agentId" WHERE r.status='completed' AND r.result IS NOT NULL AND r."agentId" <> 'pr-consolidation' ORDER BY r."createdAt" DESC LIMIT 500`
  );
  const grouped = new Map<string, Source[]>();
  for (const run of rows) {
    const findings: Finding[] = run.result?.findings?.length
      ? run.result.findings
      : (run.result?.recommendations ?? []).map((title): Finding => ({ title, recommendation: title }));
    for (const finding of findings) {
      const title = finding.title?.trim();
      if (!title) continue;
      const key = findingKey(finding)!;
      const source = { runId: run.id, agentId: run.agentId, agentName: run.agentName, createdAt: run.createdAt.toISOString(), finding };
      grouped.set(key, [...(grouped.get(key) ?? []), source]);
    }
  }
  let added = 0;
  let merged = 0;
  await withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(74201931)");
    const { rows: allRows } = await client.query<{ sources: Source[] }>(`SELECT sources FROM "AiPrProposal"`);
    const seen = new Set(allRows.flatMap((proposal) => proposal.sources.map((source) => `${source.runId}:${source.finding.title ?? ""}`)));
    const { rows: proposals } = await client.query<Proposal>(
      `SELECT id,title,summary,sources,details,status,history,"createdAt" FROM "AiPrProposal"
       WHERE status IN ('En attente d’approbation','À clarifier') ORDER BY "createdAt",id FOR UPDATE`
    );
    const candidates = new Map<string, Proposal[]>();
    for (const proposal of proposals) {
      const key = proposalKey(proposal);
      if (key) candidates.set(key, [...(candidates.get(key) ?? []), proposal]);
    }

    // First merge duplicate unapproved proposals already in the queue.
    for (const [key, duplicates] of candidates) {
      if (duplicates.length < 2) continue;
      const canonical = duplicates[0];
      const sources = uniqueSources(duplicates.flatMap((proposal) => proposal.sources));
      const status = sources.every((source) => source.finding.evidence && source.finding.recommendation)
        ? "En attente d’approbation" : "À clarifier";
      const now = new Date().toISOString();
      const canonicalHistory = [...canonical.history, {
        at: now, event: `Fusion de ${duplicates.length - 1} propositions non approuvées identiques`, actor: "Agent de consolidation", status
      }];
      await client.query(
        `UPDATE "AiPrProposal" SET sources=$2,status=$3,history=$4,"updatedAt"=NOW() WHERE id=$1`,
        [canonical.id, JSON.stringify(sources), status, JSON.stringify(canonicalHistory)]
      );
      for (const duplicate of duplicates.slice(1)) {
        const history = [...duplicate.history, {
          at: now, event: `Fusionnée dans la proposition ${canonical.id}`, actor: "Agent de consolidation", status: "Périmée"
        }];
        await client.query(`UPDATE "AiPrProposal" SET status='Périmée',history=$2,"updatedAt"=NOW() WHERE id=$1`, [duplicate.id, JSON.stringify(history)]);
      }
      candidates.set(key, [{ ...canonical, sources, status, history: canonicalHistory }]);
      merged += duplicates.length - 1;
    }

    for (const [key, incomingSources] of grouped) {
      const freshSources = incomingSources.filter((source) => !seen.has(`${source.runId}:${source.finding.title ?? ""}`));
      if (!freshSources.length) continue;
      const existingProposal = candidates.get(key)?.[0];
      if (existingProposal) {
        const sources = uniqueSources([...existingProposal.sources, ...freshSources]);
        const status = sources.every((source) => source.finding.evidence && source.finding.recommendation)
          ? "En attente d’approbation" : "À clarifier";
        const history = [...existingProposal.history, {
          at: new Date().toISOString(), event: `${freshSources.length} source(s) ajoutée(s) à une proposition non approuvée`, actor: "Agent de consolidation", status
        }];
        await client.query(
          `UPDATE "AiPrProposal" SET sources=$2,status=$3,history=$4,"updatedAt"=NOW() WHERE id=$1`,
          [existingProposal.id, JSON.stringify(sources), status, JSON.stringify(history)]
        );
        freshSources.forEach((source) => seen.add(`${source.runId}:${source.finding.title ?? ""}`));
        merged += 1;
        continue;
      }

      const sources = uniqueSources(freshSources);
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
      const status = sources.every((source) => source.finding.evidence && source.finding.recommendation)
        ? "En attente d’approbation" : "À clarifier";
      const id = randomUUID();
      await client.query(`INSERT INTO "AiPrProposal" (id,title,summary,sources,details,status,history) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [
        id, title, first.evidence ?? first.recommendation ?? "Constat rapporté par un agent d’analyse.", JSON.stringify(sources), JSON.stringify(details), status,
        JSON.stringify([{ at: new Date().toISOString(), event: "Proposition créée depuis les recommandations sources", actor: "Agent de consolidation", status }])
      ]);
      candidates.set(key, [{ id, title, summary: first.evidence ?? first.recommendation ?? "", sources, details, status, history: [], createdAt: new Date() }]);
      freshSources.forEach((source) => seen.add(`${source.runId}:${source.finding.title ?? ""}`));
      added += 1;
    }
  });
  return { added, merged, examined: rows.length };
}
