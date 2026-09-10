import NextAuth from "next-auth";
import { AuthError } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { UserRole } from "@prisma/client";
import { trackEvent } from "@/lib/monitoring";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

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
      name: "Code pilote",
      credentials: {
        email: { label: "Courriel ou nom d'utilisateur", type: "text" },
        password: { label: "Mot de passe", type: "password" },
        accessCode: { label: "Code pilote", type: "password" }
      },
      async authorize(credentials) {
        const identifier = String(credentials?.email ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");
        const accessCode = String(credentials?.accessCode ?? "");
        const expectedCode = process.env.PILOT_ACCESS_CODE ?? (process.env.NODE_ENV === "production" ? "" : "diveplan-demo");
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
        let user = await prisma.user.findFirst({
          where: { OR: [{ email: identifier }, { username: identifier }] },
          select: { id: true, email: true, firstName: true, lastName: true, role: true, clubId: true, passwordHash: true, passwordSetAt: true }
        });

        user ??= await prisma.user.findUnique({
          where: { email: lookupEmail },
          select: { id: true, email: true, firstName: true, lastName: true, role: true, clubId: true, passwordHash: true, passwordSetAt: true }
        });

        if (!user) {
          return null;
        }

        const passwordOk = await verifyPassword(password, user.passwordHash);
        const pilotCodeOk = Boolean(expectedCode && (accessCode === expectedCode || password === expectedCode));

        if (!passwordOk && !pilotCodeOk) {
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
