import "server-only";
import { randomUUID } from "node:crypto";
import { query } from "@/lib/db";

export type HealthRunState = "pending" | "ok" | "warning" | "failed";
export type HealthRunInput = { checkType: string; status: HealthRunState; detail: string; userId?: string | null; metadata?: Record<string, string | number | boolean | null> };
export type HealthRun = { id: string; checkType: string; status: HealthRunState; detail: string; userId: string | null; checkedAt: Date; completedAt: Date | null };

export async function recordAdminHealthRun(input: HealthRunInput) {
  try {
    const id = randomUUID();
    await query(`INSERT INTO "AdminHealthCheckRun" (id, "checkType", status, detail, "userId", metadata, "completedAt") VALUES ($1,$2,$3,$4,$5,$6,CASE WHEN $3='pending' THEN NULL ELSE NOW() END)`, [id, input.checkType, input.status, input.detail.slice(0, 1000), input.userId ?? null, input.metadata ?? null]);
    await query(`DELETE FROM "AdminHealthCheckRun" WHERE "checkedAt" < NOW() - INTERVAL '90 days'`).catch(() => undefined);
    invalidateAdminHealthCache();
    return id;
  } catch (error) {
    console.error("Admin health check history unavailable", error);
    return null;
  }
}

export async function completeAdminHealthRun(id: string, userId: string, status: Exclude<HealthRunState, "pending">, detail: string) {
  const result = await query(`UPDATE "AdminHealthCheckRun" SET status=$3, detail=$4, "completedAt"=NOW() WHERE id=$1 AND "userId"=$2 AND "checkType"='push' AND status='pending' AND "checkedAt">NOW()-INTERVAL '2 minutes' RETURNING id`, [id, userId, status, detail.slice(0, 1000)]);
  if (result.rowCount) invalidateAdminHealthCache();
  return Boolean(result.rowCount);
}

export async function getLatestAdminHealthRuns(checkTypes: string[]) {
  const result = await query<HealthRun>(`SELECT DISTINCT ON ("checkType") id,"checkType",status,detail,"userId","checkedAt","completedAt" FROM "AdminHealthCheckRun" WHERE "checkType"=ANY($1::text[]) ORDER BY "checkType","checkedAt" DESC`, [checkTypes]);
  return result.rows;
}

export function invalidateAdminHealthCache() {
  const cache = globalThis as typeof globalThis & { divePlanAdminHealth?: { expiresAt: number; value: Promise<unknown> } };
  delete cache.divePlanAdminHealth;
}
