import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { AsyncLocalStorage } from "node:async_hooks";

const globalForPool = globalThis as typeof globalThis & { divePlanPool?: Pool };

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for database access");
  const databaseUrl = new URL(connectionString);
  const sslMode = databaseUrl.searchParams.get("sslmode")?.toLowerCase();
  const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname);
  const isSupabase = databaseUrl.hostname.endsWith(".supabase.co")
    || databaseUrl.hostname.endsWith(".pooler.supabase.com");
  const ssl = sslMode === "require"
    ? { rejectUnauthorized: false }
    : sslMode === "verify-ca" || sslMode === "verify-full"
      ? { rejectUnauthorized: true }
      : isLocalhost
        ? undefined
        : { rejectUnauthorized: true };
  const sslConfig = isSupabase
    ? {
        ca: readFileSync(join(process.cwd(), "certs", "prod-ca-2021.crt"), "utf8"),
        rejectUnauthorized: true
      }
    : ssl;

  // node-postgres parses SSL query parameters from connectionString after reading
  // the pool options, which can replace the explicit `ssl` object above. Strip
  // all SSL parameters so the selected TLS policy below is the one that applies.
  for (const key of [...databaseUrl.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("ssl")) databaseUrl.searchParams.delete(key);
  }

  return new Pool({
    connectionString: databaseUrl.toString(),
    // Keep per-instance connection use small for Vercel serverless functions.
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    // Hosted PostgreSQL providers commonly require TLS even when the URL omits sslmode.
    // Keep local development URLs unencrypted unless sslmode explicitly requests TLS.
    ssl: sslConfig
  });
}

export const pool = globalForPool.divePlanPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForPool.divePlanPool = pool;

type EgressScope = { clubId: string | null; requests: number; resultBytes: number; timer?: ReturnType<typeof setTimeout> };
const egressScope = new AsyncLocalStorage<EgressScope>();

function getEgressScope() {
  let scope = egressScope.getStore();
  if (!scope) {
    scope = { clubId: null, requests: 0, resultBytes: 0 };
    egressScope.enterWith(scope);
  }
  return scope;
}

export function setDatabaseEgressClub(clubId: string | null) {
  if (clubId) getEgressScope().clubId = clubId;
}

function recordDatabaseResult(result: QueryResult<QueryResultRow>) {
  if (["BEGIN", "COMMIT", "ROLLBACK"].includes(result.command)) return;
  const scope = getEgressScope();
  scope.requests += 1;
  scope.resultBytes += Buffer.byteLength(JSON.stringify(result.rows));
  if (scope.timer) clearTimeout(scope.timer);
  scope.timer = setTimeout(() => {
    if (!scope.clubId || scope.requests === 0) return;
    const requests = scope.requests;
    const resultBytes = scope.resultBytes;
    scope.requests = 0;
    scope.resultBytes = 0;
    void pool.query(
      `INSERT INTO "DatabaseEgressTelemetryHour" ("clubId", hour, route, requests, "resultBytes", "updatedAt")
       VALUES ($1, date_trunc('hour', NOW()), 'Application entière', $2, $3, NOW())
       ON CONFLICT ("clubId", hour, route) DO UPDATE SET
         requests = "DatabaseEgressTelemetryHour".requests + EXCLUDED.requests,
         "resultBytes" = "DatabaseEgressTelemetryHour"."resultBytes" + EXCLUDED."resultBytes",
         "updatedAt" = NOW()`,
      [scope.clubId, requests, resultBytes]
    ).catch((error: unknown) => console.error("Database egress telemetry write failed", error));
  }, 500);
}

export async function query<Row extends QueryResultRow = QueryResultRow>(
  text: string,
  values: readonly unknown[] = []
): Promise<QueryResult<Row>> {
  getEgressScope();
  const result = await pool.query<Row>(text, [...values]);
  recordDatabaseResult(result);
  return result;
}

export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  getEgressScope();
  const client = await pool.connect();
  const instrumentedClient = new Proxy(client, {
    get(target, property, receiver) {
      if (property === "query") return async (...args: unknown[]) => {
        const result = await Reflect.apply(target.query, target, args) as unknown as QueryResult<QueryResultRow>;
        recordDatabaseResult(result);
        return result;
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
