"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { signOut } from "@/auth";
import { getCurrentAthlete } from "@/lib/athlete-session";
import { query } from "@/lib/db";

const athleteProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(50),
  lastName: z.string().trim().min(1).max(50)
});

export async function updateAthleteProfile(formData: FormData) {
  const athlete = await getCurrentAthlete();
  if (!athlete) {
    return;
  }

  const parsed = athleteProfileSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName")
  });

  if (!parsed.success) {
    throw new Error("Les informations du profil sont invalides.");
  }

  await query(`UPDATE "User" SET "firstName" = $1, "lastName" = $2 WHERE id = $3`, [
    parsed.data.firstName, parsed.data.lastName, athlete.userId
  ]);

  revalidatePath("/athlete/profile");
}

export async function signOutAthlete() {
  await signOut({ redirectTo: "/login" });
}
