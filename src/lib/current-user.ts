import { cache } from "react";
import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { completeExpiredTrainingSessions } from "@/lib/session-status";

export const getCurrentUser = cache(async () => {
  const session = await auth();
  const sessionUserId = session?.user?.id;
  const email = session?.user?.email?.toLowerCase();

  if (!sessionUserId && !email) {
    return null;
  }

  if (process.env.NODE_ENV !== "production" && sessionUserId === "dev-coach") {
    return {
      id: "dev-coach",
      firstName: "Felix",
      lastName: "Lavoie",
      email: "coach@diveplan.local",
      username: "felix.lavoie",
      role: "COACH" as const,
      passwordHash: null,
      passwordSetAt: null,
      avatar: null,
      clubId: "dev-club",
      createdAt: new Date(),
      club: { id: "dev-club", name: "Club Mustang", logo: null, createdAt: new Date() },
      coach: { id: "dev-coach-profile", userId: "dev-coach", clubId: "dev-club" },
      athlete: null
    };
  }

  const user = await prisma.user.findFirst({
    where: sessionUserId ? { id: sessionUserId } : { email: email! },
    include: {
      club: true,
      coach: true,
      athlete: true
    }
  });

  if (user) {
    await completeExpiredTrainingSessions();
  }

  return user;
});

export async function requireCurrentUser(role?: UserRole) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (role && user.role !== role) {
    redirect(user.role === "ATHLETE" ? "/athlete" : "/coach");
  }

  return user;
}

export async function requireCoach() {
  const user = await requireCurrentUser("COACH");

  if (!user.coach || !user.clubId) {
    redirect("/login");
  }

  return { user, coach: user.coach, clubId: user.clubId };
}

export async function requireAthlete() {
  const user = await requireCurrentUser("ATHLETE");

  if (!user.passwordSetAt) {
    redirect("/change-password");
  }

  if (!user.athlete || !user.clubId) {
    redirect("/login");
  }

  return { user, athlete: user.athlete, clubId: user.clubId };
}
