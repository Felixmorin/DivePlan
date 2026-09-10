import type { UserRole } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role?: UserRole;
      clubId?: string | null;
      mustChangePassword?: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    role?: UserRole;
    clubId?: string | null;
    mustChangePassword?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: UserRole;
    clubId?: string | null;
    mustChangePassword?: boolean;
  }
}
