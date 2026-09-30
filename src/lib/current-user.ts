import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db";
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
      coach: {
        id: "dev-coach-profile",
        userId: "dev-coach",
        clubId: "dev-club",
        planningDefaultView: "week",
        weekStartsOn: 1,
        printShowCoachNotes: true,
        printShowAthleteNames: true,
        printRepetitionChecks: false
      },
      athlete: null
    };
  }

  type UserRow = {
    id: string; firstName: string; lastName: string; email: string; username: string | null; role: "ADMIN" | "COACH" | "ATHLETE";
    passwordHash: string | null; passwordSetAt: Date | null; avatar: string | null; clubId: string | null; createdAt: Date;
    clubName: string | null; clubLogo: string | null; clubCreatedAt: Date | null;
    coachId: string | null; planningDefaultView: string | null; weekStartsOn: number | null; printShowCoachNotes: boolean | null;
    printShowAthleteNames: boolean | null; printRepetitionChecks: boolean | null;
    athleteId: string | null; athleteGroupId: string | null; birthDate: Date | null; level: string | null; active: boolean | null;
  };
  const result = await query<UserRow>(
    `SELECT u.id, u."firstName", u."lastName", u.email, u.username, u.role, u."passwordHash", u."passwordSetAt", u.avatar, u."clubId", u."createdAt",
       cl.name AS "clubName", cl.logo AS "clubLogo", cl."createdAt" AS "clubCreatedAt",
       co.id AS "coachId", co."planningDefaultView", co."weekStartsOn", co."printShowCoachNotes", co."printShowAthleteNames", co."printRepetitionChecks",
       a.id AS "athleteId", a."groupId" AS "athleteGroupId", a."birthDate", a.level, a.active
     FROM "User" u
     LEFT JOIN "Club" cl ON cl.id = u."clubId"
     LEFT JOIN "Coach" co ON co."userId" = u.id
     LEFT JOIN "Athlete" a ON a."userId" = u.id
     WHERE ${sessionUserId ? "u.id = $1" : "u.email = $1"}
     LIMIT 1`,
    [sessionUserId ?? email]
  );
  const row = result.rows[0];
  const user = row ? {
    id: row.id, firstName: row.firstName, lastName: row.lastName, email: row.email, username: row.username, role: row.role,
    passwordHash: row.passwordHash, passwordSetAt: row.passwordSetAt, avatar: row.avatar, clubId: row.clubId, createdAt: row.createdAt,
    club: row.clubName === null || row.clubCreatedAt === null ? null : { id: row.clubId!, name: row.clubName, logo: row.clubLogo, createdAt: row.clubCreatedAt },
    coach: row.coachId === null ? null : {
      id: row.coachId, userId: row.id, clubId: row.clubId!, planningDefaultView: row.planningDefaultView!, weekStartsOn: row.weekStartsOn!,
      printShowCoachNotes: row.printShowCoachNotes!, printShowAthleteNames: row.printShowAthleteNames!, printRepetitionChecks: row.printRepetitionChecks!
    },
    athlete: row.athleteId === null ? null : { id: row.athleteId, userId: row.id, clubId: row.clubId!, groupId: row.athleteGroupId, birthDate: row.birthDate!, level: row.level!, active: row.active! }
  } : null;

  if (user) {
    await completeExpiredTrainingSessions();
  }

  return user;
});

export async function requireCurrentUser(role?: "ADMIN" | "COACH" | "ATHLETE") {
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
