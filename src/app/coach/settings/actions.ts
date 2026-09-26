"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
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

const coachAccountSchema = z.object({
  email: z.string().trim().toLowerCase().email("Entre une adresse courriel valide.").max(254),
  username: z.string().trim().toLowerCase().min(3).max(30).regex(/^[a-z0-9._-]+$/).nullable()
});

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

export async function updateCoachAccount(formData: FormData) {
  const { user } = await requireCoach();
  const rawUsername = cleanText(formData.get("username"));
  const parsed = coachAccountSchema.safeParse({
    email: formData.get("email"),
    username: rawUsername || null
  });

  if (!parsed.success) {
    throw new Error("Le courriel ou le nom d’utilisateur est invalide.");
  }

  const conflict = await prisma.user.findFirst({
    where: {
      id: { not: user.id },
      OR: [
        { email: parsed.data.email },
        ...(parsed.data.username ? [{ username: parsed.data.username }] : [])
      ]
    },
    select: { email: true, username: true }
  });

  if (conflict?.email === parsed.data.email) {
    throw new Error("Ce courriel est déjà utilisé par un autre compte.");
  }

  if (conflict?.username === parsed.data.username) {
    throw new Error("Ce nom d’utilisateur est déjà utilisé par un autre compte.");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      email: parsed.data.email,
      username: parsed.data.username
    }
  });

  await trackEvent({
    type: "coach.account_updated",
    message: `Compte coach mis à jour: ${parsed.data.email}`,
    clubId: user.clubId,
    userId: user.id
  });

  revalidatePath("/coach/settings");
}

export async function updateCoachPreferences(formData: FormData) {
  const { user, coach } = await requireCoach();
  const planningDefaultView = formData.get("planningDefaultView");
  const weekStartsOn = formData.get("weekStartsOn");

  if (planningDefaultView !== "week" && planningDefaultView !== "month") {
    throw new Error("Choisis une vue de planning valide.");
  }

  if (weekStartsOn !== "1" && weekStartsOn !== "0") {
    throw new Error("Choisis le lundi ou le dimanche comme début de semaine.");
  }

  const preferences = {
    planningDefaultView,
    weekStartsOn: Number(weekStartsOn),
    printShowCoachNotes: formData.get("printShowCoachNotes") === "on",
    printShowAthleteNames: formData.get("printShowAthleteNames") === "on",
    printRepetitionChecks: formData.get("printRepetitionChecks") === "on"
  };

  await prisma.coach.update({ where: { id: coach.id }, data: preferences });

  await trackEvent({
    type: "coach.preferences_updated",
    message: "Préférences du coach mises à jour",
    clubId: user.clubId,
    userId: user.id
  });

  revalidatePath("/coach/settings");
  revalidatePath("/coach/planning");
}

export async function signOutCoach() {
  await signOut({ redirectTo: "/login" });
}
