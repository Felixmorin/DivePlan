import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdmin } from "@/lib/current-user";
import { query } from "@/lib/db";
import { AgentsConsole, type AgentRow, type RunRow } from "./agents-console";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export default async function AgentsPage() {
  await requireAdmin();
  const [agents, runs] = await Promise.all([
    query<AgentRow>(`SELECT id,name,mission,enabled,triggers,"createdAt","updatedAt" FROM "AiAgent" ORDER BY "createdAt"`),
    query<RunRow>(`SELECT id,"agentId","trigger",status,"startedAt","finishedAt",result,error,"createdAt","analysisPeriod" FROM "AiAgentRun" ORDER BY "createdAt" DESC LIMIT 100`)
  ]);
  return <AdminShell active="Agents"><AgentsConsole agents={agents.rows} runs={runs.rows} supabaseStatsConfigured={Boolean(process.env.SUPABASE_READONLY_DATABASE_URL)} /></AdminShell>;
}
