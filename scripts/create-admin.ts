import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";
import { hashPassword } from "../src/lib/password";

function createAdminPool(connectionString: string) {
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
    ? { ca: readFileSync(join(process.cwd(), "certs", "prod-ca-2021.crt"), "utf8"), rejectUnauthorized: true }
    : ssl;

  // Keep pg-connection-string from replacing the explicit TLS policy.
  for (const key of [...databaseUrl.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("ssl")) databaseUrl.searchParams.delete(key);
  }

  return new Pool({ connectionString: databaseUrl.toString(), ssl: sslConfig });
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required to create the admin account.");
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const firstName = process.env.ADMIN_FIRST_NAME?.trim() || "Admin";
  const lastName = process.env.ADMIN_LAST_NAME?.trim() || "DivePlan";
  if (!email || !password || password.length < 12) {
    throw new Error("Set ADMIN_EMAIL and an ADMIN_PASSWORD with at least 12 characters before running this command.");
  }
  const pool = createAdminPool(databaseUrl);
  try {
    const existing = await pool.query(`SELECT id FROM "User" WHERE lower(email) = $1 OR role = 'ADMIN' LIMIT 1`, [email]);
    if (existing.rowCount) throw new Error("An account already exists for this email, or an admin account is already configured. No changes were made.");
    const passwordHash = await hashPassword(password);
    await pool.query(
      `INSERT INTO "User" (id, "firstName", "lastName", email, role, "passwordHash", "passwordSetAt", "accessEnabled") VALUES ($1, $2, $3, $4, 'ADMIN', $5, NOW(), TRUE)`,
      [randomUUID(), firstName, lastName, email, passwordHash]
    );
    console.log("Admin account created.");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
