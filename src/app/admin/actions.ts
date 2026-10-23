"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/current-user";
import { query, withTransaction } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { trackEvent } from "@/lib/monitoring";

const coachSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(254),
  clubId: z.string().min(1),
  temporaryPassword: z.string().min(10).max(128)
});

export async function saveCoachFeatureAudience(featureId: string, coachIds: string[]) {
  await requireAdmin();
  const validFeatures = ["dashboard", "calendar", "planning", "sessions", "athletes", "simulations", "groups", "library", "templates", "observability", "monitoring", "settings"];
  if (!validFeatures.includes(featureId) || coachIds.length > 500 || coachIds.some((id) => typeof id !== "string" || id.length > 100)) {
    throw new Error("Audience de fonctionnalité invalide.");
  }
  await withTransaction(async (client) => {
    const selected = coachIds.length
      ? await client.query(`SELECT id FROM "User" WHERE role = 'COACH' AND id = ANY($1::text[])`, [coachIds])
      : { rows: [], rowCount: 0 };
    if (selected.rows.length !== coachIds.length) throw new Error("Un coach sélectionné est introuvable.");
    await client.query(`DELETE FROM "CoachFeatureAccess" WHERE "featureId" = $1`, [featureId]);
    if (coachIds.length) {
      await client.query(
        `INSERT INTO "CoachFeatureAccess" ("userId", "featureId", "enabled") SELECT id, $1, FALSE FROM "User" WHERE id = ANY($2::text[])`,
        [featureId, coachIds]
      );
    }
  });
  revalidatePath("/admin/coaches");
  revalidatePath("/coach", "layout");
}

export async function createCoachAccount(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = formData.get("returnTo") === "users" ? "users" : "coaches";
  const parsed = coachSchema.extend({ returnTo: z.enum(["coaches", "users"]).optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(adminFormErrorPath(returnTo, "invalid"));
  const { firstName, lastName, email, clubId, temporaryPassword } = parsed.data;
  const club = await query<{ id: string }>(`SELECT id FROM "Club" WHERE id = $1`, [clubId]);
  if (!club.rows[0]) redirect(adminFormErrorPath(returnTo, "club"));
  const existing = await query<{ id: string }>(`SELECT id FROM "User" WHERE lower(email) = $1`, [email]);
  if (existing.rows[0]) redirect(adminFormErrorPath(returnTo, "exists"));
  const passwordHash = await hashPassword(temporaryPassword);
  const userId = randomUUID();
  const coachId = randomUUID();
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO "User" (id, "firstName", "lastName", email, role, "clubId", "passwordHash", "passwordSetAt", "accessEnabled")
       VALUES ($1, $2, $3, $4, 'COACH', $5, $6, NULL, TRUE)`,
      [userId, firstName, lastName, email, clubId, passwordHash]
    );
    await client.query(`INSERT INTO "Coach" (id, "userId", "clubId") VALUES ($1, $2, $3)`, [coachId, userId, clubId]);
  });
  await trackEvent({ type: "admin.coach.created", message: "Accès coach créé", userId: admin.id, clubId, metadata: { coachUserId: userId } });
  revalidatePath("/admin/coaches");
  revalidatePath("/admin/users");
  redirect(adminReturnPath(returnTo, userId, "created=1"));
}

export async function setCoachAccess(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = z.object({ userId: z.string().min(1), enabled: z.enum(["true", "false"]), returnTo: z.enum(["coaches", "users"]).optional(), returnUser: z.string().optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/coaches?error=invalid");
  const { userId, enabled, returnTo, returnUser } = parsed.data;
  const result = await query<{ clubId: string | null }>(
    `UPDATE "User" SET "accessEnabled" = $2 WHERE id = $1 AND role = 'COACH' RETURNING "clubId"`,
    [userId, enabled === "true"]
  );
  if (!result.rows[0]) redirect(adminReturnPath(returnTo, returnUser ?? userId, "error=not-found"));
  await trackEvent({
    type: enabled === "true" ? "admin.coach.enabled" : "admin.coach.disabled",
    message: `Accès coach ${enabled === "true" ? "activé" : "désactivé"}`,
    userId: admin.id,
    clubId: result.rows[0].clubId,
    metadata: { coachUserId: userId }
  });
  revalidatePath("/admin/coaches");
  revalidatePath("/admin/users");
  redirect(adminReturnPath(returnTo, returnUser ?? userId, "updated=1"));
}

export async function reassignCoachClub(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = z.object({ userId: z.string().min(1), clubId: z.string().min(1), returnTo: z.enum(["coaches", "users"]).optional(), returnUser: z.string().optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/coaches?error=invalid");
  const { userId, clubId, returnTo, returnUser } = parsed.data;
  const result = await withTransaction(async (client) => {
    const club = await client.query(`SELECT id FROM "Club" WHERE id = $1`, [clubId]);
    if (!club.rowCount) return false;
    const coach = await client.query(
      `UPDATE "User" u SET "clubId" = $2 FROM "Coach" c WHERE u.id = $1 AND u.id = c."userId" AND u.role = 'COACH' RETURNING u.id`,
      [userId, clubId]
    );
    if (!coach.rowCount) return false;
    await client.query(`UPDATE "Coach" SET "clubId" = $2 WHERE "userId" = $1`, [userId, clubId]);
    return true;
  });
  if (!result) redirect(adminReturnPath(returnTo, returnUser ?? userId, "error=not-found"));
  await trackEvent({ type: "admin.coach.club_changed", message: "Club du coach modifié", userId: admin.id, clubId, metadata: { coachUserId: userId } });
  revalidatePath("/admin/coaches");
  revalidatePath("/admin/users");
  redirect(adminReturnPath(returnTo, returnUser ?? userId, "updated=1"));
}

function adminReturnPath(returnTo: "coaches" | "users" | undefined, userId: string, result: string) {
  return returnTo === "users" ? `/admin/users?user=${encodeURIComponent(userId)}&${result}` : `/admin/coaches?${result}`;
}

function adminFormErrorPath(returnTo: "coaches" | "users", error: string) {
  return `/admin/${returnTo === "users" ? "users" : "coaches"}?error=${encodeURIComponent(error)}`;
}
