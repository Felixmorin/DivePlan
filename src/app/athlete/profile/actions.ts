"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { signOut } from "@/auth";
import { getCurrentAthlete } from "@/lib/athlete-session";
import { query } from "@/lib/db";

const athleteProfileFieldSchema = z.discriminatedUnion("field", [
  z.object({ field: z.literal("firstName"), value: z.string().trim().min(1).max(50) }),
  z.object({ field: z.literal("lastName"), value: z.string().trim().min(1).max(50) }),
  z.object({ field: z.literal("username"), value: z.string().trim().toLowerCase().min(3).max(30).regex(/^[a-z0-9._-]+$/) })
]);

export async function updateAthleteProfileField(field: "firstName" | "lastName" | "username", value: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const athlete = await getCurrentAthlete();
  if (!athlete) {
    return { ok: false, error: "Session invalide. Reconnecte-toi puis réessaie." };
  }

  const parsed = athleteProfileFieldSchema.safeParse({ field, value });

  if (!parsed.success) {
    return { ok: false, error: field === "username" ? "Utilise 3 à 30 lettres minuscules, chiffres, points, tirets ou tirets bas." : "Entre un nom valide de 1 à 50 caractères." };
  }

  if (parsed.data.field === "username") {
    const existing = await query<{ id: string }>(`SELECT id FROM "User" WHERE username = $1 AND id <> $2 LIMIT 1`, [parsed.data.value, athlete.userId]);
    if (existing.rows.length) return { ok: false, error: "Ce nom d’utilisateur est déjà utilisé." };
    await query(`UPDATE "User" SET username = $1 WHERE id = $2`, [parsed.data.value, athlete.userId]);
  } else {
    const column = parsed.data.field === "firstName" ? '"firstName"' : '"lastName"';
    await query(`UPDATE "User" SET ${column} = $1 WHERE id = $2`, [parsed.data.value, athlete.userId]);
  }

  revalidatePath("/athlete/profile");
  return { ok: true };
}

export async function signOutAthlete() {
  await signOut({ redirectTo: "/login" });
}
