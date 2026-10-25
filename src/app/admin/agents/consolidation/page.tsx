import Link from "next/link";
import { ArrowLeft, GitPullRequestArrow } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdmin } from "@/lib/current-user";
import { query } from "@/lib/db";
import { ConsolidationWorkspace, type Proposal } from "./workspace";

export const dynamic = "force-dynamic";

export default async function ConsolidationPage() {
  await requireAdmin();
  const [proposalRows, runs] = await Promise.all([
    query<Proposal>(`SELECT id,title,summary,sources,details,status,history,"correctionStatus","correctionExecutionId","correctionRunUrl","correctionPullRequestUrl","createdAt","updatedAt" FROM "AiPrProposal" ORDER BY CASE lower(COALESCE(details->>'priority','')) WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END,CASE status WHEN 'À clarifier' THEN 0 WHEN 'En attente d’approbation' THEN 1 WHEN 'À séparer' THEN 2 ELSE 3 END,"updatedAt" DESC`),
    query<{ id: string; agentId: string; agentName: string; createdAt: Date; result: { findings?: Array<{ title?: string; evidence?: string; location?: string; recommendation?: string; priority?: string; effort?: string; limits?: string }>; recommendations?: string[] } | null }>(`SELECT r.id,r."agentId",a.name AS "agentName",r."createdAt",r.result FROM "AiAgentRun" r JOIN "AiAgent" a ON a.id::text=r."agentId"::text WHERE r.status='completed' AND r.result IS NOT NULL AND r."agentId"::text<>'pr-consolidation' ORDER BY r."createdAt" DESC LIMIT 500`)
  ]);
  const seen = new Set(proposalRows.rows.flatMap((proposal) => proposal.sources.map((source) => `${source.runId}:${source.finding.title ?? ""}`)));
  const candidates = runs.rows.flatMap((run) => (run.result?.findings?.length ? run.result.findings : (run.result?.recommendations ?? []).map((title) => ({ title, recommendation: title }))).filter((finding) => finding.title && !seen.has(`${run.id}:${finding.title}`)).map((finding) => ({ runId: run.id, agentId: run.agentId, agentName: run.agentName, createdAt: run.createdAt.toISOString(), finding })));
  return <AdminShell active="Agents"><div className="mx-auto max-w-[1480px]">
    <Link href="/admin/agents" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-700"><ArrowLeft className="h-4 w-4"/>Retour aux agents</Link>
    <header className="mt-5 flex flex-wrap items-end justify-between gap-4"><div><p className="mb-1 text-xs font-bold uppercase tracking-[.16em] text-blue-700">Administration · Revue humaine</p><h1 className="flex items-center gap-3 text-3xl font-black tracking-tight text-slate-950"><GitPullRequestArrow className="h-8 w-8 text-blue-600"/>Consolidation et préparation des PR</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Rassemblez les constats des agents et approuvez les périmètres. Le runner local prépare les corrections approuvées en branches et PR brouillon, qui restent soumises à revue humaine.</p></div></header>
    <ConsolidationWorkspace proposals={proposalRows.rows} candidates={candidates} sourceRuns={runs.rows.length}/>
  </div></AdminShell>;
}
