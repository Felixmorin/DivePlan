"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { signOut } from "@/auth";
import { getCurrentAthlete } from "@/lib/athlete-session";
import { prisma } from "@/lib/prisma";

const athleteProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(50),
  lastName: z.string().trim().min(1).max(50),
  avatar: z.union([z.literal(""), z.string().url().max(500)])
});

export async function updateAthleteProfile(formData: FormData) {
  const athlete = await getCurrentAthlete();
  if (!athlete) {
    return;
  }

  const parsed = athleteProfileSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    avatar: String(formData.get("avatar") ?? "")
  });

  if (!parsed.success) {
    throw new Error("Les informations du profil sont invalides.");
  }

  await prisma.user.update({
    where: { id: athlete.userId },
    data: {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      avatar: parsed.data.avatar || null
    }
  });

  revalidatePath("/athlete/profile");
}

export async function signOutAthlete() {
  await signOut({ redirectTo: "/login" });
}
