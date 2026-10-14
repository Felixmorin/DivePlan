"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { signOut } from "@/auth";
import { getCurrentAthlete } from "@/lib/athlete-session";
import { query } from "@/lib/db";
import { uploadAvatarDataUrl } from "@/lib/avatar-storage";

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
  revalidatePath("/athlete/profile/edit");
  return { ok: true };
}

export async function updateAthleteAvatar(dataUrl: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const athlete = await getCurrentAthlete();
  if (!athlete) return { ok: false, error: "Session invalide. Reconnecte-toi puis réessaie." };
  if (dataUrl.length > 7_000_000 || !/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(dataUrl)) {
    return { ok: false, error: "Choisis une image JPG, PNG ou WebP de moins de 5 Mo." };
  }
  try {
    const avatar = await uploadAvatarDataUrl(athlete.userId, dataUrl);
    await query(`UPDATE "User" SET avatar=$1 WHERE id=$2`, [avatar, athlete.userId]);
    revalidatePath("/athlete/profile");
    revalidatePath("/athlete/profile/edit");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "La photo n’a pas pu être enregistrée." };
  }
}

export async function signOutAthlete() {
  await signOut({ redirectTo: "/login" });
}
