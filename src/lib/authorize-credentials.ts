import { trackEvent } from "@/lib/monitoring";
import { verifyPassword } from "@/lib/password";
import { query, setDatabaseEgressClub } from "@/lib/db";

type UserRole = "ADMIN" | "COACH" | "ATHLETE";
type CredentialsUser = { id: string; email: string; name: string; role: UserRole; clubId: string | null; mustChangePassword: boolean };
type UserRow = { id: string; email: string; firstName: string; lastName: string; role: UserRole; clubId: string | null; passwordHash: string | null; passwordSetAt: Date | null; accessEnabled: boolean };

export async function authorizeDivePlanCredentials(credentials: { email?: unknown; password?: unknown } | undefined, options: { recordEvents?: boolean } = {}): Promise<CredentialsUser | null> {
  const identifier = String(credentials?.email ?? "").trim().toLowerCase();
  const password = String(credentials?.password ?? "");
  const devDemoLogin = process.env.NODE_ENV !== "production" && identifier === "coach@diveplan.local" && password === "diveplan-demo";
  if (devDemoLogin) return { id: "dev-coach", email: "coach@diveplan.local", name: "Felix Lavoie", role: "COACH", clubId: "dev-club", mustChangePassword: false };

  const lookupEmail = identifier === "coach@diveplan.local" ? "felix@diveplan.local" : identifier;
  const fields = `id, email, "firstName", "lastName", role, "clubId", "passwordHash", "passwordSetAt", "accessEnabled"`;
  const primary = await query<UserRow>(`SELECT ${fields} FROM "User" WHERE email = $1 OR username = $1 LIMIT 1`, [identifier]);
  let user = primary.rows[0] ?? null;
  if (!user) {
    const fallback = await query<UserRow>(`SELECT ${fields} FROM "User" WHERE email = $1 LIMIT 1`, [lookupEmail]);
    user = fallback.rows[0] ?? null;
  }
  if (!user) return null;
  setDatabaseEgressClub(user.clubId);
  if (!user.accessEnabled) return null;
  const passwordOk = await verifyPassword(password, user.passwordHash);
  if (!passwordOk) {
    if (options.recordEvents !== false) await trackEvent({ type: "auth.failed", message: `Connexion refusee pour ${identifier}`, clubId: user.clubId, userId: user.id });
    return null;
  }
  if (options.recordEvents !== false) await trackEvent({ type: "auth.login", message: `${user.email} connecte`, clubId: user.clubId, userId: user.id });
  return { id: user.id, email: user.email, name: `${user.firstName} ${user.lastName}`, role: user.role, clubId: user.clubId, mustChangePassword: user.passwordSetAt === null };
}
