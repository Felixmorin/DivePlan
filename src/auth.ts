import NextAuth from "next-auth";
import { AuthError } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authorizeDivePlanCredentials } from "@/lib/authorize-credentials";

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
      async authorize(credentials) { return authorizeDivePlanCredentials(credentials); }
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
