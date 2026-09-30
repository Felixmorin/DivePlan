import "server-only";

import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

const globalForPool = globalThis as typeof globalThis & { divePlanPool?: Pool };

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for database access");
  const sslMode = new URL(connectionString).searchParams.get("sslmode")?.toLowerCase();

  return new Pool({
    connectionString,
    // Keep per-instance connection use small for Vercel serverless functions.
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    // Supabase pooler URLs generally provide sslmode=require in the URL.
    ssl: sslMode === "require"
      ? { rejectUnauthorized: false }
      : sslMode === "verify-ca" || sslMode === "verify-full"
        ? { rejectUnauthorized: true }
        : undefined
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
