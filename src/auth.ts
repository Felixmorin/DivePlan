import NextAuth from "next-auth";
import { AuthError } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { trackEvent } from "@/lib/monitoring";
import { verifyPassword } from "@/lib/password";
import { query } from "@/lib/db";

type UserRole = "ADMIN" | "COACH" | "ATHLETE";

export const { handlers, signIn, signOut, auth } = NextAuth({
  basePath: "/api/auth",
  secret: process.env.AUTH_SECRET ?? (process.env.NODE_ENV === "production" ? undefined : "diveplan-local-development-secret-change-me"),
  logger: {
    error(error) {
      if (error instanceof AuthError && error.type === "JWTSessionError") {
        return;
      }

      console.error(error);
    }
  },
  providers: [
    Credentials({
      name: "Identifiants DivePlan",
      credentials: {
        email: { label: "Courriel ou nom d'utilisateur", type: "text" },
        password: { label: "Mot de passe", type: "password" }
      },
      async authorize(credentials) {
        const identifier = String(credentials?.email ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");
        const devDemoLogin = process.env.NODE_ENV !== "production" && identifier === "coach@diveplan.local" && password === "diveplan-demo";

        if (devDemoLogin) {
          return {
            id: "dev-coach",
            email: "coach@diveplan.local",
            name: "Felix Lavoie",
            role: "COACH",
            clubId: "dev-club"
          };
        }

        const lookupEmail = identifier === "coach@diveplan.local" ? "felix@diveplan.local" : identifier;
        const fields = `id, email, "firstName", "lastName", role, "clubId", "passwordHash", "passwordSetAt"`;
        const primary = await query<{
          id: string; email: string; firstName: string; lastName: string; role: UserRole;
          clubId: string | null; passwordHash: string | null; passwordSetAt: Date | null;
        }>(`SELECT ${fields} FROM "User" WHERE email = $1 OR username = $1 LIMIT 1`, [identifier]);
        let user = primary.rows[0] ?? null;

        if (!user) {
          const fallback = await query<typeof primary.rows[number]>(
            `SELECT ${fields} FROM "User" WHERE email = $1 LIMIT 1`, [lookupEmail]
          );
          user = fallback.rows[0] ?? null;
        }

        if (!user) {
          return null;
        }

        const passwordOk = await verifyPassword(password, user.passwordHash);

        if (!passwordOk) {
          await trackEvent({
            type: "auth.failed",
            message: `Connexion refusee pour ${identifier}`,
            clubId: user.clubId,
            userId: user.id
          });
          return null;
        }

        await trackEvent({
          type: "auth.login",
          message: `${user.email} connecte`,
          clubId: user.clubId,
          userId: user.id
        });

        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          role: user.role,
          clubId: user.clubId,
          mustChangePassword: user.passwordSetAt === null
        };
      }
    })
  ],
  session: { strategy: "jwt" },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.clubId = user.clubId;
        token.mustChangePassword = user.mustChangePassword;
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = token.role as UserRole | undefined;
        session.user.clubId = typeof token.clubId === "string" ? token.clubId : null;
        session.user.mustChangePassword = token.mustChangePassword === true;
      }

      return session;
    }
  }
});
