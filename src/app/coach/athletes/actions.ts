"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { requireCoach } from "@/lib/current-user";
import { trackEvent } from "@/lib/monitoring";
import { prisma } from "@/lib/prisma";
import { parseMontrealSessionDate } from "@/lib/timezone";

export type ImportAthletesState = {
  error?: string;
  imported?: number;
  updated?: number;
};

const manualAthleteSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  level: z.string().trim().min(1),
  groupId: z.string().optional(),
  birthDate: z.string().optional()
});

type CsvAthlete = {
  firstName: string;
  lastName: string;
  email: string;
  level: string;
  group: string;
};

export async function importAthletesCsv(_: ImportAthletesState, formData: FormData): Promise<ImportAthletesState> {
  const { user, coach, clubId } = await requireCoach();
  const csv = String(formData.get("csv") ?? "").trim();

  if (!csv) {
    return { error: "Colle un CSV avec les colonnes firstName,lastName,email,level,group." };
  }

  const rows = parseCsv(csv);
  if (rows.length === 0) {
    return { error: "Aucune ligne valide trouvee." };
  }

  const header = rows[0].map((cell) => cell.trim());
  const required = ["firstName", "lastName", "email", "level"];
  const missing = required.filter((name) => !header.includes(name));

  if (missing.length > 0) {
    return { error: `Colonnes manquantes: ${missing.join(", ")}.` };
  }

  const records: CsvAthlete[] = rows.slice(1).map((row) => ({
    firstName: value(row, header, "firstName"),
    lastName: value(row, header, "lastName"),
    email: value(row, header, "email").toLowerCase(),
    level: value(row, header, "level") || "A definir",
    group: value(row, header, "group")
  })).filter((row) => row.firstName && row.lastName && row.email);

  let imported = 0;
  let updated = 0;

  await prisma.$transaction(async (tx) => {
    for (const record of records) {
      let groupId: string | null = null;

      if (record.group) {
        const existingGroup = await tx.trainingGroup.findFirst({ where: { clubId, name: record.group } });
        const group = existingGroup ?? await tx.trainingGroup.create({ data: { name: record.group, clubId, coachId: coach.id } });
        groupId = group.id;
      }

      const existing = await tx.user.findUnique({ where: { email: record.email }, include: { athlete: true } });
      const account = await tx.user.upsert({
        where: { email: record.email },
        create: {
          firstName: record.firstName,
          lastName: record.lastName,
          email: record.email,
          role: UserRole.ATHLETE,
          clubId
        },
        update: {
          firstName: record.firstName,
          lastName: record.lastName,
          role: UserRole.ATHLETE,
          clubId
        }
      });

      await tx.athlete.upsert({
        where: { userId: account.id },
        create: {
          userId: account.id,
          clubId,
          groupId,
          birthDate: new Date("2010-01-01"),
          level: record.level,
          active: true
        },
        update: {
          clubId,
          groupId,
          level: record.level,
          active: true
        }
      });

      if (existing?.athlete) {
        updated += 1;
      } else {
        imported += 1;
      }
    }
  });

  await trackEvent({
    type: "athletes.imported",
    message: `${imported} athletes importes, ${updated} mis a jour`,
    clubId,
    userId: user.id,
    metadata: { imported, updated }
  });

  revalidatePath("/coach/athletes");
  revalidatePath("/coach/groups");
  return { imported, updated };
}

export async function createCoachOnlyAthlete(formData: FormData) {
  const { user, clubId } = await requireCoach();
  const parsed = manualAthleteSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    level: formData.get("level"),
    groupId: String(formData.get("groupId") ?? ""),
    birthDate: String(formData.get("birthDate") ?? "")
  });

  if (!parsed.success) {
    throw new Error("Informations athlete invalides.");
  }

  const data = parsed.data;
  const groupId = data.groupId || null;

  if (groupId) {
    const group = await prisma.trainingGroup.findFirst({ where: { id: groupId, clubId }, select: { id: true } });
    if (!group) {
      throw new Error("Groupe invalide pour ce club.");
    }
  }

  const syntheticEmail = `coach-only-${randomUUID()}@diveplan.local`;
  const account = await prisma.user.create({
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      email: syntheticEmail,
      role: UserRole.ATHLETE,
      clubId,
      passwordHash: null,
      passwordSetAt: null
    }
  });

  const athlete = await prisma.athlete.create({
    data: {
      userId: account.id,
      clubId,
      groupId,
      birthDate: data.birthDate ? parseMontrealSessionDate(data.birthDate, "12:00") : parseMontrealSessionDate("2015-01-01", "12:00"),
      level: data.level,
      active: true
    }
  });

  await trackEvent({
    type: "athlete.created_coach_only",
    message: `Athlete coach seulement cree: ${data.firstName} ${data.lastName}`,
    clubId,
    userId: user.id,
    metadata: { athleteId: athlete.id }
  });

  revalidatePath("/coach");
  revalidatePath("/coach/athletes");
  revalidatePath("/coach/groups");
  revalidatePath("/coach/sessions/new");
}

export async function deleteAthlete(formData: FormData) {
  const { user, clubId } = await requireCoach();
  const athleteId = String(formData.get("athleteId") ?? "");
  const athlete = await prisma.athlete.findFirst({
    where: { id: athleteId, clubId },
    include: { user: true }
  });

  if (!athlete) {
    throw new Error("Athlete introuvable.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.planningEvent.updateMany({ where: { athleteId: athlete.id }, data: { athleteId: null } });
    await tx.sessionBlockAssignment.deleteMany({ where: { athleteId: athlete.id } });
    await tx.athleteSessionCompletion.deleteMany({ where: { athleteId: athlete.id } });
    await tx.athleteDiveLog.deleteMany({ where: { athleteId: athlete.id } });
    await tx.athleteExerciseLog.deleteMany({ where: { athleteId: athlete.id } });
    await tx.athleteSkill.deleteMany({ where: { athleteId: athlete.id } });
    await tx.athlete.delete({ where: { id: athlete.id } });
    await tx.userInvitation.updateMany({ where: { acceptedById: athlete.userId }, data: { acceptedById: null } });
    await tx.user.delete({ where: { id: athlete.userId } });
  });

  await trackEvent({
    type: "athlete.deleted",
    message: `Athlete supprime: ${athlete.user.firstName} ${athlete.user.lastName}`,
    clubId,
    userId: user.id,
    metadata: { athleteId: athlete.id }
  });

  revalidatePath("/coach");
  revalidatePath("/coach/athletes");
  revalidatePath("/coach/groups");
  revalidatePath("/coach/planning");
  revalidatePath("/coach/sessions");
  redirect("/coach/athletes");
}

function parseCsv(input: string) {
  return input.split(/\r?\n/).map((line) => line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""))).filter((row) => row.some(Boolean));
}

function value(row: string[], header: string[], name: string) {
  const index = header.indexOf(name);
  return index >= 0 ? row[index]?.trim() ?? "" : "";
}
