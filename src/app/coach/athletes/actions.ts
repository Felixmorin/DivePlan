"use server";

import { randomInt, randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireCoach } from "@/lib/current-user";
import { trackEvent } from "@/lib/monitoring";
import { hashPassword } from "@/lib/password";
import { query, withTransaction } from "@/lib/db";
import { parseMontrealSessionDate } from "@/lib/timezone";

const PoolHeight = { ONE_METER: "ONE_METER", THREE_METER: "THREE_METER", PLATFORM: "PLATFORM", CUSTOM: "CUSTOM" } as const;
const USER_ROLE_ATHLETE = "ATHLETE";

export type ImportAthletesState = {
  error?: string;
  imported?: number;
  updated?: number;
};

export type CreateAthleteAccountState = {
  error?: string;
  credentials?: {
    athleteName: string;
    username: string;
    temporaryPassword: string;
  };
};

const manualAthleteSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  level: z.string().trim().min(1),
  groupId: z.string().optional(),
  birthDate: z.string().optional()
});

const athleteAccountSchema = manualAthleteSchema.extend({
  username: z.string().trim().toLowerCase().min(3).max(30).regex(/^[a-z0-9._-]+$/),
  temporaryPassword: z.string().min(10).max(128).regex(/[A-Za-z]/).regex(/[0-9]/).optional()
});

const competitionDiveSchema = z.object({
  athleteId: z.string().min(1),
  listId: z.string().min(1),
  height: z.enum([PoolHeight.ONE_METER, PoolHeight.THREE_METER, PoolHeight.PLATFORM]),
  diveCode: z.string().trim().min(1).max(12),
  difficulty: z.string().trim().optional(),
  platformHeight: z.enum(["5", "7.5", "10"]).optional()
});

const competitionDiveOrderSchema = z.object({
  athleteId: z.string().min(1),
  listId: z.string().min(1),
  height: z.enum([PoolHeight.ONE_METER, PoolHeight.THREE_METER, PoolHeight.PLATFORM]),
  diveIds: z.array(z.string().min(1)).max(50)
});

const coachCompetitionEvaluationSchema = z.object({
  athleteId: z.string().min(1),
  ratings: z.array(z.object({ competitionDiveId: z.string().min(1), rating: z.number().int().min(0).max(5) })).min(1)
});

const athleteDiveFamilySchema = z.object({
  athleteId: z.string().min(1),
  diveCode: z.string().trim().min(1).max(12),
  height: z.enum([PoolHeight.ONE_METER, PoolHeight.THREE_METER, PoolHeight.PLATFORM, PoolHeight.CUSTOM]),
  family: z.enum(["Avant", "Arriere", "Renverse", "Retourne", "Vrille", "Equilibre"]),
  diveName: z.string().trim().min(1).max(80).nullish()
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

  await withTransaction(async (tx) => {
    for (const record of records) {
      let groupId: string | null = null;

      if (record.group) {
        const existingGroup = await tx.query<{ id: string }>(`SELECT id FROM "TrainingGroup" WHERE "clubId" = $1 AND name = $2 LIMIT 1`, [clubId, record.group]);
        const group = existingGroup.rows[0] ?? (await tx.query<{ id: string }>(
          `INSERT INTO "TrainingGroup" (id, name, "clubId", "coachId") VALUES ($1, $2, $3, $4) RETURNING id`,
          [randomUUID(), record.group, clubId, coach.id]
        )).rows[0];
        groupId = group.id;
      }

      const existing = await tx.query<{ id: string }>(
        `SELECT a.id FROM "User" u LEFT JOIN "Athlete" a ON a."userId" = u.id WHERE u.email = $1 LIMIT 1`, [record.email]
      );
      const account = await tx.query<{ id: string }>(
        `INSERT INTO "User" (id, "firstName", "lastName", email, role, "clubId") VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (email) DO UPDATE SET "firstName" = EXCLUDED."firstName", "lastName" = EXCLUDED."lastName", role = EXCLUDED.role, "clubId" = EXCLUDED."clubId"
         RETURNING id`, [randomUUID(), record.firstName, record.lastName, record.email, USER_ROLE_ATHLETE, clubId]
      );
      const userId = account.rows[0].id;
      await tx.query(
        `INSERT INTO "Athlete" (id, "userId", "clubId", "groupId", "birthDate", level, active)
         VALUES ($1, $2, $3, $4, $5, $6, true)
         ON CONFLICT ("userId") DO UPDATE SET "clubId" = EXCLUDED."clubId", "groupId" = EXCLUDED."groupId", level = EXCLUDED.level, active = true`,
        [randomUUID(), userId, clubId, groupId, new Date("2010-01-01"), record.level]
      );

      if (existing.rows[0]?.id) {
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
    const group = await query(`SELECT id FROM "TrainingGroup" WHERE id = $1 AND "clubId" = $2 LIMIT 1`, [groupId, clubId]);
    if (!group) {
      throw new Error("Groupe invalide pour ce club.");
    }
  }

  const syntheticEmail = `coach-only-${randomUUID()}@diveplan.local`;
  const athlete = await withTransaction(async (tx) => {
    const userId = randomUUID();
    await tx.query(
      `INSERT INTO "User" (id, "firstName", "lastName", email, role, "clubId", "passwordHash", "passwordSetAt") VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL)`,
      [userId, data.firstName, data.lastName, syntheticEmail, USER_ROLE_ATHLETE, clubId]
    );
    const result = await tx.query<{ id: string }>(
      `INSERT INTO "Athlete" (id, "userId", "clubId", "groupId", "birthDate", level, active) VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING id`,
      [randomUUID(), userId, clubId, groupId, data.birthDate ? parseMontrealSessionDate(data.birthDate, "12:00") : parseMontrealSessionDate("2015-01-01", "12:00"), data.level]
    );
    return { id: result.rows[0].id };
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

export async function createAthleteAccount(_: CreateAthleteAccountState, formData: FormData): Promise<CreateAthleteAccountState> {
  const { user, clubId } = await requireCoach();
  const parsed = athleteAccountSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    level: formData.get("level"),
    groupId: String(formData.get("groupId") ?? ""),
    birthDate: String(formData.get("birthDate") ?? ""),
    username: formData.get("username"),
    temporaryPassword: String(formData.get("temporaryPassword") ?? "") || undefined
  });

  if (!parsed.success) {
    return { error: "Vérifie les informations. Le nom d'utilisateur doit contenir 3 à 30 caractères autorisés et le mot de passe temporaire, si fourni, au moins 10 caractères avec une lettre et un chiffre." };
  }

  const data = parsed.data;
  const groupId = data.groupId || null;
  const existingAccount = await query<{ id: string }>(`SELECT id FROM "User" WHERE username = $1 LIMIT 1`, [data.username]);

  if (existingAccount.rows.length > 0) {
    return { error: "Ce nom d'utilisateur est déjà utilisé." };
  }

  if (groupId) {
    const group = await query(`SELECT id FROM "TrainingGroup" WHERE id = $1 AND "clubId" = $2 LIMIT 1`, [groupId, clubId]);
    if (!group) {
      return { error: "Ce groupe n'appartient pas à ton club." };
    }
  }

  const temporaryPassword = data.temporaryPassword || generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const internalEmail = `${data.username}-${randomUUID()}@accounts.diveplan.local`;
  const athlete = await withTransaction(async (tx) => {
    const userId = randomUUID();
    await tx.query(
      `INSERT INTO "User" (id, "firstName", "lastName", email, username, role, "clubId", "passwordHash", "passwordSetAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL)`,
      [userId, data.firstName, data.lastName, internalEmail, data.username, USER_ROLE_ATHLETE, clubId, passwordHash]
    );
    const result = await tx.query<{ id: string }>(
      `INSERT INTO "Athlete" (id, "userId", "clubId", "groupId", "birthDate", level, active) VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING id`,
      [randomUUID(), userId, clubId, groupId, data.birthDate ? parseMontrealSessionDate(data.birthDate, "12:00") : parseMontrealSessionDate("2015-01-01", "12:00"), data.level]
    );
    return { id: result.rows[0].id };
  });

  await trackEvent({
    type: "athlete.account_created",
    message: `Compte athlète créé: ${data.firstName} ${data.lastName}`,
    clubId,
    userId: user.id,
    metadata: { athleteId: athlete.id, username: data.username }
  });

  revalidatePath("/coach");
  revalidatePath("/coach/athletes");
  revalidatePath("/coach/groups");
  revalidatePath("/coach/sessions/new");

  return {
    credentials: {
      athleteName: `${data.firstName} ${data.lastName}`,
      username: data.username,
      temporaryPassword
    }
  };
}

export async function updateAthleteProfile(formData: FormData) {
  const { clubId } = await requireCoach();
  const parsed = manualAthleteSchema.extend({
    athleteId: z.string().min(1),
    active: z.enum(["true", "false"])
  }).safeParse({
    athleteId: formData.get("athleteId"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    level: formData.get("level"),
    groupId: String(formData.get("groupId") ?? ""),
    birthDate: String(formData.get("birthDate") ?? ""),
    active: formData.get("active")
  });
  if (!parsed.success) throw new Error("Vérifie les informations du profil.");

  const { athleteId, firstName, lastName, level, groupId: rawGroupId, birthDate, active } = parsed.data;
  const athlete = await query<{ userId: string }>(`SELECT "userId" FROM "Athlete" WHERE id=$1 AND "clubId"=$2 LIMIT 1`, [athleteId, clubId]);
  if (!athlete.rows[0]) throw new Error("Athlète introuvable.");
  const groupId = rawGroupId || null;
  if (groupId) {
    const group = await query(`SELECT id FROM "TrainingGroup" WHERE id=$1 AND "clubId"=$2 LIMIT 1`, [groupId, clubId]);
    if (!group.rows[0]) throw new Error("Ce groupe n’appartient pas à ton club.");
  }
  const parsedBirthDate = birthDate ? parseMontrealSessionDate(birthDate, "12:00") : parseMontrealSessionDate("2015-01-01", "12:00");
  await withTransaction(async (tx) => {
    await tx.query(`UPDATE "User" SET "firstName"=$1,"lastName"=$2 WHERE id=$3`, [firstName, lastName, athlete.rows[0].userId]);
    await tx.query(`UPDATE "Athlete" SET level=$1,"groupId"=$2,"birthDate"=$3,active=$4 WHERE id=$5 AND "clubId"=$6`, [level, groupId, parsedBirthDate, active === "true", athleteId, clubId]);
  });
  revalidatePath("/coach/athletes");
  revalidatePath(`/coach/athletes/${athleteId}`);
}

export async function addCompetitionDive(formData: FormData) {
  const { clubId } = await requireCoach();
  const parsed = competitionDiveSchema.safeParse({
    athleteId: formData.get("athleteId"),
    listId: formData.get("listId"),
    height: formData.get("height"),
    diveCode: formData.get("diveCode"),
    difficulty: String(formData.get("difficulty") ?? ""),
    platformHeight: String(formData.get("platformHeight") ?? "") || undefined
  });

  if (!parsed.success) {
    throw new Error("Les informations du plongeon sont invalides.");
  }

  const athleteResult = await query<{ id: string }>(`SELECT a.id FROM "Athlete" a JOIN "CompetitionDiveList" l ON l."athleteId"=a.id WHERE a.id = $1 AND l.id=$2 AND a."clubId" = $3 LIMIT 1`, [parsed.data.athleteId, parsed.data.listId, clubId]);
  const athlete = athleteResult.rows[0];
  if (!athlete) {
    throw new Error("Athlète introuvable.");
  }

  if (parsed.data.height === PoolHeight.PLATFORM && !parsed.data.platformHeight) {
    throw new Error("Indique la hauteur pour ce plongeon de plateforme.");
  }

  const difficulty = parsed.data.difficulty ? Number(parsed.data.difficulty.replace(",", ".")) : null;
  if (difficulty !== null && (!Number.isFinite(difficulty) || difficulty < 0 || difficulty > 10)) {
    throw new Error("Le degré de difficulté doit être compris entre 0 et 10.");
  }

  const positionResult = await query<{ position: number }>(`SELECT count(*)::int AS position FROM "CompetitionDive" WHERE "athleteId" = $1 AND "listId"=$2 AND height = $3`, [athlete.id, parsed.data.listId, parsed.data.height]);
  await query(
    `INSERT INTO "CompetitionDive" (id, "athleteId", "listId", height, "platformHeight", "diveCode", "diveName", difficulty, position) VALUES ($1, $2, $3, $4, $5, $6, '', $7, $8)`,
    [randomUUID(), athlete.id, parsed.data.listId, parsed.data.height, parsed.data.height === PoolHeight.PLATFORM && parsed.data.platformHeight ? Number(parsed.data.platformHeight) : null, parsed.data.diveCode.toUpperCase(), difficulty, positionResult.rows[0].position]
  );

  revalidatePath(`/coach/athletes/${athlete.id}`);
  revalidatePath("/athlete/profile");
}

export async function createCompetitionDiveList(formData: FormData): Promise<{ id: string }> {
  const { clubId } = await requireCoach();
  const athleteId = String(formData.get("athleteId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!athleteId || !name || name.length > 60) throw new Error("Le nom de la liste doit contenir de 1 à 60 caractères.");
  const athlete = await query<{ id: string }>(`SELECT id FROM "Athlete" WHERE id=$1 AND "clubId"=$2 LIMIT 1`, [athleteId, clubId]);
  if (!athlete.rows[0]) throw new Error("Athlète introuvable.");
  const duplicate = await query(`SELECT id FROM "CompetitionDiveList" WHERE "athleteId"=$1 AND lower(name)=lower($2) LIMIT 1`, [athleteId, name]);
  if (duplicate.rows[0]) throw new Error("Une liste porte déjà ce nom.");
  const position = await query<{ position: number }>(`SELECT COALESCE(MAX(position)+1,0)::int AS position FROM "CompetitionDiveList" WHERE "athleteId"=$1`, [athleteId]);
  const id = randomUUID();
  await query(`INSERT INTO "CompetitionDiveList" (id,"athleteId",name,position) VALUES ($1,$2,$3,$4)`, [id, athleteId, name, position.rows[0].position]);
  revalidatePath(`/coach/athletes/${athleteId}`);
  return { id };
}

export async function renameCompetitionDiveList(formData: FormData) {
  const { clubId } = await requireCoach();
  const listId = String(formData.get("listId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!listId || !name || name.length > 60) throw new Error("Le nom de la liste doit contenir de 1 à 60 caractères.");
  const list = await query<{ id: string; athleteId: string }>(`SELECT l.id,l."athleteId" FROM "CompetitionDiveList" l JOIN "Athlete" a ON a.id=l."athleteId" WHERE l.id=$1 AND a."clubId"=$2 LIMIT 1`, [listId, clubId]);
  if (!list.rows[0]) throw new Error("Liste introuvable.");
  const duplicate = await query(`SELECT id FROM "CompetitionDiveList" WHERE "athleteId"=$1 AND lower(name)=lower($2) AND id<>$3 LIMIT 1`, [list.rows[0].athleteId, name, listId]);
  if (duplicate.rows[0]) throw new Error("Une liste porte déjà ce nom.");
  await query(`UPDATE "CompetitionDiveList" SET name=$1 WHERE id=$2`, [name, listId]);
  revalidatePath(`/coach/athletes/${list.rows[0].athleteId}`);
}

export async function deleteCompetitionDiveList(listId: string): Promise<{ athleteId: string }> {
  const { clubId } = await requireCoach();
  const list = await query<{ id: string; athleteId: string }>(`SELECT l.id,l."athleteId" FROM "CompetitionDiveList" l JOIN "Athlete" a ON a.id=l."athleteId" WHERE l.id=$1 AND a."clubId"=$2 LIMIT 1`, [listId, clubId]);
  if (!list.rows[0]) throw new Error("Liste introuvable.");
  await withTransaction(async (tx) => {
    await tx.query(`DELETE FROM "AthleteCompetitionDiveEvaluation" WHERE "competitionDiveId" IN (SELECT id FROM "CompetitionDive" WHERE "listId"=$1)`, [listId]);
    await tx.query(`DELETE FROM "CompetitionDiveList" WHERE id=$1`, [listId]);
  });
  revalidatePath(`/coach/athletes/${list.rows[0].athleteId}`);
  revalidatePath("/athlete/profile");
  return { athleteId: list.rows[0].athleteId };
}

export async function saveCoachCompetitionDiveEvaluation(input: z.infer<typeof coachCompetitionEvaluationSchema>) {
  const { coach, clubId } = await requireCoach();
  const data = coachCompetitionEvaluationSchema.parse(input);
  const athleteResult = await query<{ id: string }>(`SELECT id FROM "Athlete" WHERE id = $1 AND "clubId" = $2 LIMIT 1`, [data.athleteId, clubId]);
  const athlete = athleteResult.rows[0];
  if (!athlete) throw new Error("Athlète introuvable pour ce club.");

  const diveResult = await query<{ id: string; diveCode: string; height: string }>(`SELECT id, "diveCode", height FROM "CompetitionDive" WHERE "athleteId" = $1`, [athlete.id]);
  const dives = diveResult.rows;
  const submittedIds = new Set(data.ratings.map((entry) => entry.competitionDiveId));
  if (dives.length === 0 || submittedIds.size !== dives.length || dives.some((dive) => !submittedIds.has(dive.id))) {
    throw new Error("Une note doit être choisie pour chacun des plongeons de compétition.");
  }

  const evaluatedAt = new Date();
  await withTransaction(async (tx) => {
    for (const dive of dives) {
      const rating = data.ratings.find((entry) => entry.competitionDiveId === dive.id)!.rating;
      await tx.query(
        `INSERT INTO "AthleteCompetitionDiveEvaluation" (id, "athleteId", "coachId", "competitionDiveId", "diveCode", height, rating, evaluator, "evaluatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'COACH', $8)`,
        [randomUUID(), athlete.id, coach.id, dive.id, dive.diveCode, dive.height, rating, evaluatedAt]
      );
    }
  });
  revalidatePath(`/coach/athletes/${athlete.id}`);
}

export async function updateCompetitionDiveDifficulty(formData: FormData) {
  const { clubId } = await requireCoach();
  const diveId = String(formData.get("diveId") ?? "");
  const rawDifficulty = String(formData.get("difficulty") ?? "").trim().replace(",", ".");
  const difficulty = rawDifficulty === "" ? null : Number(rawDifficulty);
  const rawPlatformHeight = String(formData.get("platformHeight") ?? "");
  const platformHeight = rawPlatformHeight === "" ? null : Number(rawPlatformHeight);
  if (!diveId || (difficulty !== null && (!Number.isFinite(difficulty) || difficulty < 0 || difficulty > 10)) || (platformHeight !== null && ![5, 7.5, 10].includes(platformHeight))) {
    throw new Error("Le degré de difficulté doit être compris entre 0 et 10.");
  }
  const diveResult = await query<{ id: string; athleteId: string; height: string }>(
    `SELECT d.id, d."athleteId", d.height FROM "CompetitionDive" d JOIN "Athlete" a ON a.id = d."athleteId" WHERE d.id = $1 AND a."clubId" = $2 LIMIT 1`, [diveId, clubId]
  );
  const dive = diveResult.rows[0];
  if (!dive) throw new Error("Plongeon introuvable.");
  if (dive.height === PoolHeight.PLATFORM && platformHeight === null) throw new Error("Indique la hauteur pour ce plongeon de plateforme.");
  await query(`UPDATE "CompetitionDive" SET difficulty = $1, "platformHeight" = $2 WHERE id = $3`, [difficulty, dive.height === PoolHeight.PLATFORM ? platformHeight : null, dive.id]);
  revalidatePath(`/coach/athletes/${dive.athleteId}`);
  revalidatePath("/athlete/profile");
}

export async function removeCompetitionDive(formData: FormData) {
  const { clubId } = await requireCoach();
  const diveId = String(formData.get("diveId") ?? "");
  const diveResult = await query<{ id: string; athleteId: string }>(
    `SELECT d.id, d."athleteId" FROM "CompetitionDive" d JOIN "Athlete" a ON a.id = d."athleteId" WHERE d.id = $1 AND a."clubId" = $2 LIMIT 1`, [diveId, clubId]
  );
  const dive = diveResult.rows[0];

  if (!dive) {
    throw new Error("Plongeon introuvable.");
  }

  await query(`DELETE FROM "CompetitionDive" WHERE id = $1`, [dive.id]);
  revalidatePath(`/coach/athletes/${dive.athleteId}`);
  revalidatePath("/athlete/profile");
}

export async function reorderCompetitionDives(formData: FormData) {
  const { clubId } = await requireCoach();
  let diveIds: unknown;
  try {
    diveIds = JSON.parse(String(formData.get("diveIds") ?? ""));
  } catch {
    throw new Error("L’ordre des plongeons est invalide.");
  }

  const parsed = competitionDiveOrderSchema.safeParse({
    athleteId: formData.get("athleteId"),
    listId: formData.get("listId"),
    height: formData.get("height"),
    diveIds
  });
  if (!parsed.success || new Set(parsed.data.diveIds).size !== parsed.data.diveIds.length) {
    throw new Error("L’ordre des plongeons est invalide.");
  }

  const { athleteId, listId, height, diveIds: orderedIds } = parsed.data;
  const listResult = await query(`SELECT l.id FROM "CompetitionDiveList" l JOIN "Athlete" a ON a.id=l."athleteId" WHERE l.id=$1 AND l."athleteId"=$2 AND a."clubId"=$3 LIMIT 1`, [listId, athleteId, clubId]);
  if (!listResult.rows[0]) throw new Error("Liste introuvable.");
  const currentResult = await query<{ id: string }>(
    `SELECT d.id FROM "CompetitionDive" d JOIN "Athlete" a ON a.id = d."athleteId" WHERE d."athleteId" = $1 AND d."listId"=$2 AND d.height = $3 AND a."clubId" = $4`,
    [athleteId, listId, height, clubId]
  );
  const currentDives = currentResult.rows;
  if (currentDives.length !== orderedIds.length || currentDives.some(({ id }) => !orderedIds.includes(id))) {
    throw new Error("La liste des plongeons a changé. Recharge la page et réessaie.");
  }

  await withTransaction(async (tx) => {
    for (const [position, id] of orderedIds.entries()) {
      await tx.query(`UPDATE "CompetitionDive" SET position = $1 WHERE id = $2`, [position, id]);
    }
  });

  revalidatePath(`/coach/athletes/${athleteId}`);
  revalidatePath("/athlete/profile");
}

export async function updateAthleteDiveFamily(formData: FormData) {
  const { clubId } = await requireCoach();
  const parsed = athleteDiveFamilySchema.safeParse({
    athleteId: formData.get("athleteId"),
    diveCode: formData.get("diveCode"),
    height: formData.get("height"),
    family: formData.get("family"),
    diveName: formData.get("diveName")
  });

  if (!parsed.success) {
    throw new Error("Les informations du plongeon sont invalides.");
  }

  const athleteResult = await query<{ id: string }>(`SELECT id FROM "Athlete" WHERE id = $1 AND "clubId" = $2 LIMIT 1`, [parsed.data.athleteId, clubId]);
  const athlete = athleteResult.rows[0];
  if (!athlete) {
    throw new Error("Athlète introuvable.");
  }

  await query(
    `UPDATE "AthleteDiveLog" l SET "familyOverride" = $1, "actualDiveName" = COALESCE($2, l."actualDiveName") FROM "PoolDive" d JOIN "PoolSection" s ON s.id = d."poolSectionId"
     WHERE l."poolDiveId" = d.id AND l."athleteId" = $3 AND d."diveCode" = $4 AND s.height = $5`,
    [parsed.data.family, parsed.data.diveName, athlete.id, parsed.data.diveCode, parsed.data.height]
  );

  revalidatePath(`/coach/athletes/${athlete.id}`);
  revalidatePath("/athlete/progress");
}

export async function removeAthleteDiveFromVolume(formData: FormData) {
  const { clubId } = await requireCoach();
  const parsed = z.object({
    athleteId: z.string().min(1),
    diveCode: z.string().trim().min(1).max(12),
    height: z.enum([PoolHeight.ONE_METER, PoolHeight.THREE_METER, PoolHeight.PLATFORM, PoolHeight.CUSTOM])
  }).safeParse({
    athleteId: formData.get("athleteId"),
    diveCode: formData.get("diveCode"),
    height: formData.get("height")
  });
  if (!parsed.success) throw new Error("Les informations du plongeon sont invalides.");

  const athleteResult = await query<{ id: string }>(`SELECT id FROM "Athlete" WHERE id = $1 AND "clubId" = $2 LIMIT 1`, [parsed.data.athleteId, clubId]);
  const athlete = athleteResult.rows[0];
  if (!athlete) throw new Error("Athlète introuvable.");

  await query(
    `DELETE FROM "AthleteDiveLog" l USING "PoolDive" d, "PoolSection" s
     WHERE l."poolDiveId" = d.id AND d."poolSectionId" = s.id AND l."athleteId" = $1 AND d."diveCode" = $2 AND s.height = $3`,
    [athlete.id, parsed.data.diveCode, parsed.data.height]
  );

  revalidatePath(`/coach/athletes/${athlete.id}`);
  revalidatePath("/athlete/progress");
}

export async function deleteAthlete(formData: FormData) {
  const { user, clubId } = await requireCoach();
  const athleteId = String(formData.get("athleteId") ?? "");
  const athleteResult = await query<{ id: string; userId: string; firstName: string; lastName: string }>(
    `SELECT a.id, a."userId", u."firstName", u."lastName" FROM "Athlete" a JOIN "User" u ON u.id = a."userId" WHERE a.id = $1 AND a."clubId" = $2 LIMIT 1`, [athleteId, clubId]
  );
  const athlete = athleteResult.rows[0];

  if (!athlete) {
    throw new Error("Athlete introuvable.");
  }

  await withTransaction(async (tx) => {
    await tx.query(`UPDATE "PlanningEvent" SET "athleteId" = NULL WHERE "athleteId" = $1`, [athlete.id]);
    await tx.query(`DELETE FROM "SessionBlockAssignment" WHERE "athleteId" = $1`, [athlete.id]);
    await tx.query(`DELETE FROM "AthleteSessionCompletion" WHERE "athleteId" = $1`, [athlete.id]);
    await tx.query(`DELETE FROM "AthleteSessionAbsence" WHERE "athleteId" = $1`, [athlete.id]);
    await tx.query(`DELETE FROM "AthleteDiveLog" WHERE "athleteId" = $1`, [athlete.id]);
    await tx.query(`DELETE FROM "AthleteDiveNote" WHERE "athleteId" = $1`, [athlete.id]);
    await tx.query(`DELETE FROM "AthleteExerciseLog" WHERE "athleteId" = $1`, [athlete.id]);
    await tx.query(`DELETE FROM "AthleteBlockTiming" WHERE "athleteId" = $1`, [athlete.id]);
    await tx.query(`DELETE FROM "AthleteSkill" WHERE "athleteId" = $1`, [athlete.id]);
    await tx.query(`DELETE FROM "AthleteCompetitionDiveEvaluation" WHERE "athleteId" = $1`, [athlete.id]);
    await tx.query(`DELETE FROM "CompetitionDive" WHERE "athleteId" = $1`, [athlete.id]);
    await tx.query(`DELETE FROM "Athlete" WHERE id = $1`, [athlete.id]);
    await tx.query(`DELETE FROM "User" WHERE id = $1`, [athlete.userId]);
  });

  await trackEvent({
    type: "athlete.deleted",
    message: `Athlete supprime: ${athlete.firstName} ${athlete.lastName}`,
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

function generateTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const characters = ["D", "v", "7", "!"];

  while (characters.length < 14) {
    characters.push(alphabet[randomInt(alphabet.length)]);
  }

  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }

  return characters.join("");
}
