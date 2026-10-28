import "server-only";
import { getSqlRequestSpan } from "@/lib/server-request-metrics";

import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const globalForPool = globalThis as typeof globalThis & { divePlanPool?: Pool };

function createPool(connectionString = process.env.DATABASE_URL, max = 3) {
  if (!connectionString) throw new Error("DATABASE_URL is required for database access");
  const databaseUrl = new URL(connectionString);
  const sslMode = databaseUrl.searchParams.get("sslmode")?.toLowerCase();
  const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname);
  const sslConfig = isLocalhost && sslMode !== "require" && sslMode !== "verify-ca" && sslMode !== "verify-full"
    ? undefined
    : {
        // Supabase's database certificate chains to this CA, which is not in
        // every Node.js runtime's system trust store. Keep hostname and chain
        // verification enabled while adding the provider CA to the trust set.
        ca: readFileSync(join(process.cwd(), "certs", "prod-ca-2021.crt"), "utf8"),
        rejectUnauthorized: true
      };

  // node-postgres parses SSL query parameters from connectionString after reading
  // the pool options, which can replace the explicit `ssl` object above. Strip
  // all SSL parameters so the selected TLS policy below is the one that applies.
  for (const key of [...databaseUrl.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("ssl")) databaseUrl.searchParams.delete(key);
  }

  return new Pool({
    connectionString: databaseUrl.toString(),
    // Keep per-instance connection use small for Vercel serverless functions.
    max,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    // Hosted PostgreSQL providers commonly require TLS even when the URL omits sslmode.
    // Keep local development URLs unencrypted unless sslmode explicitly requests TLS.
    ssl: sslConfig
  });
}

export const pool = globalForPool.divePlanPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForPool.divePlanPool = pool;

export type DatabaseEgressComponent = "authentication" | "initial_session_load" | "other";
type EgressBucket = { requests: number; resultBytes: number; durationMs: number; maxDurationMs: number; slowQueries: number };
type EgressScope = { clubId: string | null; route: string | null; buckets: Map<string, { component: DatabaseEgressComponent; route: string; stats: EgressBucket }>; timer?: ReturnType<typeof setTimeout> };
const egressScope = new AsyncLocalStorage<EgressScope>();
const egressComponent = new AsyncLocalStorage<DatabaseEgressComponent>();

function getEgressScope() {
  let scope = egressScope.getStore();
  if (!scope) {
    scope = { clubId: null, route: null, buckets: new Map() };
    egressScope.enterWith(scope);
  }
  return scope;
}

export function setDatabaseEgressClub(clubId: string | null) {
  if (clubId) {
    getEgressScope().clubId = clubId;
    void getSqlRequestSpan((sql,args)=>pool.query(sql,args)).then(span=>{if(span)span.clubId=clubId;});
  }
}

export function setDatabaseEgressRoute(route: string | null) {
  const scope = getEgressScope();
  scope.route = route && route.startsWith("/") && route.length <= 200 ? route : null;
}

export function withDatabaseEgressComponent<T>(component: DatabaseEgressComponent, work: () => Promise<T>, route?: string): Promise<T> {
  if (route) setDatabaseEgressRoute(route);
  return egressComponent.run(component, work);
}

function recordDatabaseResult(result: QueryResult<QueryResultRow>, durationMs: number) {
  if (["BEGIN", "COMMIT", "ROLLBACK"].includes(result.command)) return;
  const scope = getEgressScope();
  const component = egressComponent.getStore() ?? "other";
  const route = scope.route ?? "Application entière";
  const key = `${route}\n${component}`;
  const bucket = scope.buckets.get(key) ?? { component, route, stats: { requests: 0, resultBytes: 0, durationMs: 0, maxDurationMs: 0, slowQueries: 0 } };
  bucket.stats.requests += 1;
  bucket.stats.resultBytes += Buffer.byteLength(JSON.stringify(result.rows));
  bucket.stats.durationMs += durationMs;
  bucket.stats.maxDurationMs = Math.max(bucket.stats.maxDurationMs, durationMs);
  if (durationMs >= 200) bucket.stats.slowQueries += 1;
  scope.buckets.set(key, bucket);
  if (scope.timer) clearTimeout(scope.timer);
  scope.timer = setTimeout(() => {
    if (!scope.clubId || scope.buckets.size === 0) return;
    const buckets = [...scope.buckets.values()];
    scope.buckets.clear();
    for (const { component, route, stats } of buckets) void pool.query(
      `INSERT INTO "DatabaseEgressTelemetryHour" ("clubId", hour, route, component, requests, "resultBytes", "durationMs", "maxDurationMs", "slowQueries", "updatedAt")
       VALUES ($1, date_trunc('hour', NOW()), $7, $8, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT ("clubId", hour, route, component) DO UPDATE SET
         requests = "DatabaseEgressTelemetryHour".requests + EXCLUDED.requests,
         "resultBytes" = "DatabaseEgressTelemetryHour"."resultBytes" + EXCLUDED."resultBytes",
         "durationMs" = "DatabaseEgressTelemetryHour"."durationMs" + EXCLUDED."durationMs",
         "maxDurationMs" = GREATEST("DatabaseEgressTelemetryHour"."maxDurationMs", EXCLUDED."maxDurationMs"),
         "slowQueries" = "DatabaseEgressTelemetryHour"."slowQueries" + EXCLUDED."slowQueries",
         "updatedAt" = NOW()`,
      [scope.clubId, stats.requests, stats.resultBytes, stats.durationMs, stats.maxDurationMs, stats.slowQueries, route, component]
    ).catch((error: unknown) => console.error("Database egress telemetry write failed", error));
  }, 500);
}

export async function query<Row extends QueryResultRow = QueryResultRow>(
  text: string,
  values: readonly unknown[] = []
): Promise<QueryResult<Row>> {
  getEgressScope();
  const span = await getSqlRequestSpan((sql,args)=>pool.query(sql,args));
  const startedAt = performance.now();
  try {
    const result = await pool.query<Row>(text, [...values]);
    const duration = performance.now()-startedAt;
    recordDatabaseResult(result,duration);
    if (span && !["BEGIN","COMMIT","ROLLBACK"].includes(result.command)) {span.queries++;span.bytes+=Buffer.byteLength(JSON.stringify(result.rows));span.durationMs+=duration;}
    return result;
  } catch(error) {
    if(span){span.queries++;span.errors++;span.durationMs+=performance.now()-startedAt;}
    throw error;
  }
}

export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  getEgressScope();
  const span = await getSqlRequestSpan((sql,args)=>pool.query(sql,args));
  const client = await pool.connect();
  const instrumentedClient = new Proxy(client, {
    get(target, property) {
      if (property === "query") return async (...args: unknown[]) => {
        const startedAt = performance.now();
        try {
          const result = await Reflect.apply(target.query, target, args) as unknown as QueryResult<QueryResultRow>;
          const duration = performance.now()-startedAt;
          recordDatabaseResult(result,duration);
          if(span && !["BEGIN","COMMIT","ROLLBACK"].includes(result.command)){span.queries++;span.bytes+=Buffer.byteLength(JSON.stringify(result.rows));span.durationMs+=duration;}
          return result;
        } catch(error) {if(span){span.queries++;span.errors++;span.durationMs+=performance.now()-startedAt;}throw error;}
      };
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
  try {
    await instrumentedClient.query("BEGIN");
    const result = await work(instrumentedClient);
    await instrumentedClient.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function withReadOnlyTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    await client.query("SET LOCAL statement_timeout = '8000ms'");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function withReadOnlyDatabaseUrl<T>(connectionString: string, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const readonlyPool = createPool(connectionString, 1);
  try {
    const client = await readonlyPool.connect();
    try {
      await client.query("BEGIN TRANSACTION READ ONLY");
      await client.query("SET LOCAL statement_timeout = '8000ms'");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await readonlyPool.end();
  }
}
