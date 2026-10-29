"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/current-user";
import { withTransaction } from "@/lib/db";

const profileSchema = z.object({ firstName: z.string().trim().min(1).max(80).optional(), lastName: z.string().trim().min(1).max(80).optional(), email: z.string().trim().toLowerCase().email().max(254).optional(), clubId: z.string().max(100).optional(), accessEnabled: z.enum(["true", "false"]).optional() }).strict();

export async function updateAdminUser(userId: string, input: Record<string, string>) {
  const admin = await requireAdmin();
  if (typeof userId !== "string" || !userId || userId.length > 100) return { ok: false as const, error: "Compte invalide." };
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success || !Object.keys(parsed.data).length) return { ok: false as const, error: "Vérifiez les champs saisis." };
  const changes = parsed.data;
  try {
    const changed = await withTransaction(async client => {
      const current = await client.query<{ id:string; firstName:string; lastName:string; email:string; role:string; clubId:string|null; accessEnabled:boolean }>(`SELECT id,"firstName","lastName",email,role,"clubId","accessEnabled" FROM "User" WHERE id=$1 FOR UPDATE`, [userId]);
      const user = current.rows[0];
      if (!user) throw new Error("NOT_FOUND");
      if (changes.accessEnabled === "false" && user.role === "ADMIN") {
        const admins = await client.query<{ count:string }>(`SELECT count(*)::text AS count FROM "User" WHERE role='ADMIN' AND "accessEnabled"`);
        if (Number(admins.rows[0]?.count) <= 1) throw new Error("LAST_ADMIN");
      }
      const nextClubId = changes.clubId !== undefined ? (changes.clubId || null) : user.clubId;
      if (nextClubId) { const club = await client.query(`SELECT id FROM "Club" WHERE id=$1`, [nextClubId]); if (!club.rowCount) throw new Error("BAD_CLUB"); }
      const fields: string[] = [];
      for (const key of ["firstName", "lastName", "email"] as const) if (changes[key] !== undefined && changes[key] !== user[key]) fields.push(key);
      if (nextClubId !== user.clubId) fields.push("clubId");
      if (changes.accessEnabled !== undefined && (changes.accessEnabled === "true") !== user.accessEnabled) fields.push("accessEnabled");
      if (!fields.length) return { fields, user };
      const next = { firstName: changes.firstName ?? user.firstName, lastName: changes.lastName ?? user.lastName, email: changes.email ?? user.email, access: changes.accessEnabled === undefined ? user.accessEnabled : changes.accessEnabled === "true" };
      await client.query(`UPDATE "User" SET "firstName"=$2,"lastName"=$3,email=$4,"clubId"=$5,"accessEnabled"=$6 WHERE id=$1`, [userId,next.firstName,next.lastName,next.email,nextClubId,next.access]);
      if (fields.includes("clubId")) {
        if (user.role === "COACH") await client.query(`UPDATE "Coach" SET "clubId"=$2 WHERE "userId"=$1`,[userId,nextClubId]);
        if (user.role === "ATHLETE" && nextClubId) await client.query(`UPDATE "Athlete" SET "clubId"=$2 WHERE "userId"=$1`,[userId,nextClubId]);
      }
      await client.query(`INSERT INTO "AppEvent" (id,type,message,"userId","clubId",metadata) VALUES (gen_random_uuid()::text,'admin.user.updated','Profil utilisateur modifié',$1,$2,$3::jsonb)`, [userId,nextClubId,JSON.stringify({ actorId:admin.id, fields })]);
      return { fields, user };
    });
    if (changed.fields.length) revalidatePath("/admin/users");
    return { ok: true as const, changed: changed.fields };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_FOUND") return { ok:false as const, error:"Ce compte n’existe plus." };
    if (message === "LAST_ADMIN") return { ok:false as const, error:"Le dernier administrateur actif ne peut pas être désactivé." };
    if (message === "BAD_CLUB") return { ok:false as const, error:"Le club sélectionné n’existe plus." };
    if ((error as { code?: string })?.code === "23505") return { ok:false as const, error:"Un compte utilise déjà ce courriel." };
    return { ok:false as const, error:"La mise à jour a échoué. Réessayez." };
  }
}
