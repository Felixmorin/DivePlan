import "server-only";
import { headers } from "next/headers";
import { after } from "next/server";

export type SqlRequestSpan = { id:string; route:string; trigger:string; startedAt:Date; clubId:string|null; queries:number; bytes:number; durationMs:number; errors:number };
type Writer = (sql:string, args: unknown[]) => Promise<unknown>;
// Entries contain counters only, are keyed by a proxy-generated random request UUID,
// and are removed after the response. The bound also protects long-running requests.
const pending = new Map<string,SqlRequestSpan>();
export const requestTraceInsert = `INSERT INTO "ServerRequestMetric" (id,"clubId",route,trigger,"startedAt","queryCount","resultBytes","sqlDurationMs","errorCount")
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`;
export async function getSqlRequestSpan(write: Writer): Promise<SqlRequestSpan|null> {
  try {
    const h = await headers();
    const id = h.get("x-diveplan-request-id");
    const route = h.get("x-diveplan-route");
    if (!id || !/^[0-9a-f-]{36}$/.test(id) || !route || !/^\/(coach|athlete|admin|api)(\/|$)/.test(route) || route.startsWith("/api/monitoring/transfer") || route.startsWith("/api/cron/")) return null;
    const existing = pending.get(id);
    if (existing) return existing;
    if (pending.size >= 1024) return null;
    const span: SqlRequestSpan = {id,route,trigger:h.get("x-diveplan-trigger") ?? "unknown",startedAt:new Date(),clubId:null,queries:0,bytes:0,durationMs:0,errors:0};
    pending.set(id,span);
    try {
      after(async()=>{
        try {
          if (span.queries) await write(requestTraceInsert,[span.id,span.clubId,span.route,span.trigger,span.startedAt,span.queries,span.bytes,Math.round(span.durationMs),span.errors]);
        } catch { console.error("Server request metrics write failed"); }
        finally { pending.delete(id); }
      });
    } catch { pending.delete(id); return null; }
    return span;
  } catch { return null; } // CLI scripts/builds have no request context.
}
