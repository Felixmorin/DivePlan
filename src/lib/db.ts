import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

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

export async function query<Row extends QueryResultRow = QueryResultRow>(
  text: string,
  values: readonly unknown[] = []
): Promise<QueryResult<Row>> {
  return pool.query<Row>(text, [...values]);
}

export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
