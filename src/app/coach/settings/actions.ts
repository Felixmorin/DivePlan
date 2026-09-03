"use server";

import { revalidatePath } from "next/cache";
import { signOut } from "@/auth";
import { requireCoach } from "@/lib/current-user";
import { trackEvent } from "@/lib/monitoring";
import { prisma } from "@/lib/prisma";

function cleanText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function cleanLogo(value: FormDataEntryValue | null) {
  const logo = cleanText(value);
  if (!logo) {
    return null;
  }

  if (logo.startsWith("/")) {
    return logo;
  }

  const parsed = URL.canParse(logo) ? new URL(logo) : null;
  const isLocalHttp = parsed?.protocol === "http:" && parsed.hostname === "localhost";
  if (!parsed || (parsed.protocol !== "https:" && !isLocalHttp)) {
    throw new Error("Utilise une URL d'image valide pour le logo.");
  }

  return parsed.toString();
}

export async function updateClubSettings(formData: FormData) {
  const { user, clubId } = await requireCoach();
  const name = cleanText(formData.get("name"));
  const logo = cleanLogo(formData.get("logo"));

  if (name.length < 2 || name.length > 80) {
    throw new Error("Le nom doit contenir entre 2 et 80 caracteres.");
  }

  await prisma.club.update({
    where: { id: clubId },
    data: { name, logo }
  });

  await trackEvent({
    type: "club.settings_updated",
    message: `Reglages du club mis a jour: ${name}`,
    clubId,
    userId: user.id
  });

  revalidatePath("/coach");
  revalidatePath("/coach/settings");
  revalidatePath("/coach/planning");
  revalidatePath("/coach/sessions");
  revalidatePath("/coach/athletes");
  revalidatePath("/coach/groups");
}

export async function signOutCoach() {
  await signOut({ redirectTo: "/login" });
}
