"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/current-user";
import { query, withTransaction } from "@/lib/db";
import { trackEvent } from "@/lib/monitoring";
import { runNextAgentJobs } from "@/lib/agent-worker";
import type { RunRow } from "./agents-console";

const triggerSchema = z.object({
  onDemand: z.object({ enabled: z.boolean() }),
  schedule: z.object({ enabled: z.boolean(), cron: z.string().max(80) }),
  afterDeploy: z.object({ enabled: z.boolean() }),
  incident: z.object({ enabled: z.boolean() })
});

export async function enqueueAgentRun(agentId: string, analysisPeriod: "24h" | "7d" = "7d") {
  const admin = await requireAdmin();
  const parsedId = z.string().min(1).max(100).safeParse(agentId);
  if (!parsedId.success) throw new Error("Agent invalide.");
  if (!["diveplan-observability", "sql-supabase-analyst", "architecture-cartographer"].includes(parsedId.data)) throw new Error("Aucun traitement d’exécution n’est configuré pour cet agent.");
  const period = z.enum(["24h", "7d"]).safeParse(analysisPeriod);
  if (!period.success) throw new Error("Période d’analyse invalide.");
  const agent = await query<{ id: string; name: string; triggers: unknown; enabled: boolean }>(
    `SELECT id, name, triggers, enabled FROM "AiAgent" WHERE id = $1`, [parsedId.data]
  );
  const row = agent.rows[0];
  if (!row || !row.enabled) throw new Error("Cet agent est indisponible.");
  const triggers = triggerSchema.safeParse(row.triggers);
  if (!triggers.success || !triggers.data.onDemand.enabled) throw new Error("Le déclenchement à la demande est désactivé.");
  const active = await query<{ id: string; status: string }>(`SELECT id, status FROM "AiAgentRun" WHERE "agentId" = $1 AND status IN ('pending','running') LIMIT 1`, [row.id]);
  let id = active.rows[0]?.id;
  if (active.rows[0]?.status === "running") throw new Error("Une exécution est déjà en cours.");
  if (id) {
    await query(`UPDATE "AiAgentRun" SET "analysisPeriod"=$2, "createdById"=$3 WHERE id=$1 AND status='pending'`, [id, period.data, admin.id]);
  } else {
    id = randomUUID();
    try {
      await query(`INSERT INTO "AiAgentRun" (id, "agentId", "trigger", status, "createdById", "analysisPeriod") VALUES ($1,$2,'on_demand','pending',$3,$4)`, [id, row.id, admin.id, period.data]);
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") throw new Error("Une exécution est déjà en cours.");
      throw error;
    }
    await trackEvent({ type: "admin.agent.run.queued", message: `Exécution demandée : ${row.name}`, userId: admin.id, metadata: { agentId: row.id, runId: id } });
  }
  await runNextAgentJobs(id);
  const finished = await query<{ id: string; agentId: string; trigger: string; status: string; analysisPeriod: "24h" | "7d"; startedAt: Date | null; finishedAt: Date | null; result: unknown; error: string | null; createdAt: Date }>(
    `SELECT id,"agentId",trigger,status,"analysisPeriod","startedAt","finishedAt",result,error,"createdAt" FROM "AiAgentRun" WHERE id=$1`, [id]
  );
  revalidatePath("/admin/agents");
  return finished.rows[0] ?? { id, status: "pending" };
}

export async function startAgentWorkflow(analysisPeriod: "24h" | "7d" = "7d") {
  const admin = await requireAdmin();
  const period = z.enum(["24h", "7d"]).safeParse(analysisPeriod);
  if (!period.success) throw new Error("Période d’analyse invalide.");
  const workflowId = randomUUID();
  const queued = await withTransaction(async (client) => {
    const { rows: agents } = await client.query<{ id: string; name: string; enabled: boolean; triggers: unknown }>(
      `SELECT id,name,enabled,triggers FROM "AiAgent" ORDER BY "sortOrder","createdAt" FOR UPDATE`
    );
    const runnable = agents.filter((agent) => {
      const triggers = triggerSchema.safeParse(agent.triggers);
      return agent.enabled && triggers.success && triggers.data.onDemand.enabled;
    });
    if (!runnable.length) throw new Error("Aucun agent actif avec le déclenchement à la demande n’est disponible.");

    const { rows: activeRuns } = await client.query<{ agentId: string }>(
      `SELECT DISTINCT "agentId" FROM "AiAgentRun" WHERE status IN ('pending','running') AND "agentId"=ANY($1::text[])`,
      [runnable.map((agent) => agent.id)]
    );
    const busyIds = new Set(activeRuns.map((run) => run.agentId));
    const available = runnable.filter((agent) => !busyIds.has(agent.id));
    if (!available.length) throw new Error("Tous les agents disponibles ont déjà une exécution en attente ou en cours.");

    for (const [sequence, agent] of available.entries()) {
      await client.query(
        `INSERT INTO "AiAgentRun" (id,"agentId","trigger",status,"createdById","analysisPeriod","workflowId",sequence)
         VALUES ($1,$2,'on_demand','pending',$3,$4,$5,$6)`,
        [randomUUID(), agent.id, admin.id, period.data, workflowId, sequence]
      );
    }
    return { agents: available, skipped: runnable.filter((agent) => busyIds.has(agent.id)).map((agent) => agent.name) };
  });

  await trackEvent({
    type: "admin.agent.workflow.started",
    message: `Workflow lancé : ${queued.agents.length} agent(s)`,
    userId: admin.id,
    metadata: { workflowId, agentCount: queued.agents.length, analysisPeriod: period.data }
  });
  const runs = await query<RunRow>(
    `SELECT id,"agentId","trigger",status,"startedAt","finishedAt",result,error,"createdAt","analysisPeriod","workflowId",sequence,
       count(*) OVER (PARTITION BY "workflowId")::int AS "workflowCount"
     FROM "AiAgentRun" WHERE "workflowId"=$1 ORDER BY sequence`, [workflowId]
  );
  revalidatePath("/admin/agents");
  return { workflowId, runs: runs.rows, skipped: queued.skipped };
}

export async function cancelQueuedAgentRun(runId: string) {
  const admin = await requireAdmin();
  const id = z.string().uuid().safeParse(runId);
  if (!id.success) throw new Error("Exécution invalide.");
  const cancelled = await query<{ agentId: string }>(
    `UPDATE "AiAgentRun" SET status='cancelled', error='Annulée par un administrateur avant le démarrage.', "finishedAt"=NOW() WHERE id=$1 AND status='pending' RETURNING "agentId"`,
    [id.data]
  );
  if (!cancelled.rows[0]) throw new Error("Cette exécution a déjà démarré ou a été traitée.");
  await trackEvent({ type: "admin.agent.run.cancelled", message: "Exécution en attente retirée de la file", userId: admin.id, metadata: { agentId: cancelled.rows[0].agentId, runId: id.data } });
  revalidatePath("/admin/agents");
}

export async function updateAgentTriggers(agentId: string, input: unknown) {
  const admin = await requireAdmin();
  const id = z.string().min(1).max(100).safeParse(agentId);
  const parsed = triggerSchema.safeParse(input);
  if (!id.success || !parsed.success) throw new Error("Configuration de déclencheurs invalide.");
  const result = await query<{ name: string }>(`UPDATE "AiAgent" SET triggers = $2, "updatedAt" = NOW() WHERE id = $1 RETURNING name`, [id.data, parsed.data]);
  if (!result.rows[0]) throw new Error("Agent introuvable.");
  await trackEvent({ type: "admin.agent.triggers.updated", message: `Déclencheurs modifiés : ${result.rows[0].name}`, userId: admin.id, metadata: { agentId: id.data } });
  revalidatePath("/admin/agents");
}

export async function updateAgentEnabled(agentId: string, enabled: boolean) {
  const admin = await requireAdmin();
  const id = z.string().min(1).max(100).safeParse(agentId);
  if (!id.success || typeof enabled !== "boolean") throw new Error("État d’agent invalide.");
  const result = await query<{ name: string }>(`UPDATE "AiAgent" SET enabled=$2, "updatedAt"=NOW() WHERE id=$1 RETURNING name`, [id.data, enabled]);
  if (!result.rows[0]) throw new Error("Agent introuvable.");
  await trackEvent({ type: "admin.agent.enabled.updated", message: `Agent ${enabled ? "activé" : "mis en pause"} : ${result.rows[0].name}`, userId: admin.id, metadata: { agentId: id.data, enabled } });
  revalidatePath("/admin/agents");
}

export async function updateAgentName(agentId: string, name: string) {
  const admin = await requireAdmin();
  const parsed = z.object({ id: z.string().min(1).max(100), name: z.string().trim().min(2).max(100) }).safeParse({ id: agentId, name });
  if (!parsed.success) throw new Error("Le nom doit contenir entre 2 et 100 caractères.");
  const result = await query<{ id: string; name: string }>(
    `UPDATE "AiAgent" SET name=$2,"updatedAt"=NOW() WHERE id=$1 RETURNING id,name`, [parsed.data.id, parsed.data.name]
  );
  if (!result.rows[0]) throw new Error("Agent introuvable.");
  await trackEvent({ type: "admin.agent.renamed", message: `Nom d’agent modifié : ${result.rows[0].name}`, userId: admin.id, metadata: { agentId: result.rows[0].id, name: result.rows[0].name } });
  revalidatePath("/admin/agents");
  return result.rows[0].name;
}

export async function moveAgent(agentId: string, direction: "up" | "down") {
  const admin = await requireAdmin();
  const parsed = z.object({ id: z.string().min(1).max(100), direction: z.enum(["up", "down"]) }).safeParse({ id: agentId, direction });
  if (!parsed.success) throw new Error("Déplacement d’agent invalide.");

  const moved = await withTransaction(async (client) => {
    const agents = await client.query<{ id: string; name: string }>(`SELECT id,name FROM "AiAgent" ORDER BY "sortOrder","createdAt" FOR UPDATE`);
    const from = agents.rows.findIndex((agent) => agent.id === parsed.data.id);
    if (from < 0) throw new Error("Agent introuvable.");
    const to = from + (parsed.data.direction === "up" ? -1 : 1);
    if (to < 0 || to >= agents.rows.length) return null;
    [agents.rows[from], agents.rows[to]] = [agents.rows[to], agents.rows[from]];
    for (const [index, agent] of agents.rows.entries()) {
      await client.query(`UPDATE "AiAgent" SET "sortOrder"=$2,"updatedAt"=NOW() WHERE id=$1`, [agent.id, index]);
    }
    return agents.rows[from];
  });

  if (moved) await trackEvent({ type: "admin.agent.order.updated", message: `Ordre modifié : ${moved.name}`, userId: admin.id, metadata: { agentId: moved.id, direction: parsed.data.direction } });
  revalidatePath("/admin/agents");
  return moved;
}
