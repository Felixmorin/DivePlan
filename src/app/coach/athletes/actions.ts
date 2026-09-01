"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import { requireCoach } from "@/lib/current-user";
import { trackEvent } from "@/lib/monitoring";
import { prisma } from "@/lib/prisma";

export type ImportAthletesState = {
  error?: string;
  imported?: number;
  updated?: number;
};

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

function parseCsv(input: string) {
  return input.split(/\r?\n/).map((line) => line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""))).filter((row) => row.some(Boolean));
}

function value(row: string[], header: string[], name: string) {
  const index = header.indexOf(name);
  return index >= 0 ? row[index]?.trim() ?? "" : "";
}
