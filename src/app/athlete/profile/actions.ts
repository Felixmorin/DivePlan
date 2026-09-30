"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { signOut } from "@/auth";
import { getCurrentAthlete } from "@/lib/athlete-session";
import { query } from "@/lib/db";

const athleteProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(50),
  lastName: z.string().trim().min(1).max(50),
  avatar: z.union([z.literal(""), z.string().regex(/^data:image\/(jpeg|jpg|png|webp);base64,/).max(1_000_000), z.string().url().max(500)]),
  avatarUrl: z.union([z.literal(""), z.string().url().max(500)])
});

export async function updateAthleteProfile(formData: FormData) {
  const athlete = await getCurrentAthlete();
  if (!athlete) {
    return;
  }

  const parsed = athleteProfileSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    avatar: String(formData.get("avatar") || formData.get("avatarUrl") || ""),
    avatarUrl: String(formData.get("avatarUrl") ?? "")
  });

  if (!parsed.success) {
    throw new Error("Les informations du profil sont invalides.");
  }

  await query(`UPDATE "User" SET "firstName" = $1, "lastName" = $2, avatar = $3 WHERE id = $4`, [
    parsed.data.firstName, parsed.data.lastName, parsed.data.avatar || null, athlete.userId
  ]);

  revalidatePath("/athlete/profile");
}

export async function signOutAthlete() {
  await signOut({ redirectTo: "/login" });
}
