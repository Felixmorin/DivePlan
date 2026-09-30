"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireCoach } from "@/lib/current-user";
import { trackEvent } from "@/lib/monitoring";
import { query, withTransaction } from "@/lib/db";

const groupSchema = z.object({
  name: z.string().trim().min(2).max(80)
});

export async function createTrainingGroup(formData: FormData) {
  const { user, coach, clubId } = await requireCoach();
  const parsed = groupSchema.safeParse({ name: formData.get("name") });

  if (!parsed.success) {
    throw new Error("Nom de groupe invalide.");
  }

  const name = parsed.data.name;
  const existingGroup = await query(`SELECT id FROM "TrainingGroup" WHERE "clubId" = $1 AND lower(name) = lower($2) LIMIT 1`, [clubId, name]);

  if (existingGroup) {
    throw new Error("Un groupe avec ce nom existe deja.");
  }

  const created = await query<{ id: string; name: string }>(
    `INSERT INTO "TrainingGroup" (id, name, "clubId", "coachId") VALUES ($1, $2, $3, $4) RETURNING id, name`,
    [crypto.randomUUID(), name, clubId, coach.id]
  );
  const group = created.rows[0];

  await trackEvent({
    type: "group.created",
    message: `Groupe cree: ${group.name}`,
    clubId,
    userId: user.id,
    metadata: { groupId: group.id }
  });

  revalidateGroupPaths(group.id);
}

export async function assignAthletesToGroup(formData: FormData) {
  const { user, clubId } = await requireCoach();
  const groupId = String(formData.get("groupId") ?? "");
  const selectedAthleteIds = formData.getAll("athleteId").map(String).filter(Boolean);

  const groupResult = await query<{ id: string; name: string }>(`SELECT id, name FROM "TrainingGroup" WHERE id = $1 AND "clubId" = $2 LIMIT 1`, [groupId, clubId]);
  const group = groupResult.rows[0];

  if (!group) {
    throw new Error("Groupe introuvable.");
  }

  const validResult = selectedAthleteIds.length > 0
    ? await query<{ id: string }>(`SELECT id FROM "Athlete" WHERE id = ANY($1::text[]) AND "clubId" = $2 AND active = true`, [selectedAthleteIds, clubId])
    : { rows: [] as Array<{ id: string }> };
  const validAthleteIds = validResult.rows.map((athlete) => athlete.id);

  await withTransaction(async (tx) => {
    await tx.query(`UPDATE "Athlete" SET "groupId" = NULL WHERE "clubId" = $1 AND "groupId" = $2`, [clubId, group.id]);
    if (validAthleteIds.length) {
      await tx.query(`UPDATE "Athlete" SET "groupId" = $1 WHERE "clubId" = $2 AND id = ANY($3::text[])`, [group.id, clubId, validAthleteIds]);
    }
  });

  await trackEvent({
    type: "group.athletes_assigned",
    message: `${validAthleteIds.length} athletes assignes au groupe ${group.name}`,
    clubId,
    userId: user.id,
    metadata: { groupId: group.id, athletes: validAthleteIds.length }
  });

  revalidateGroupPaths(group.id);
}

export async function deleteTrainingGroup(formData: FormData) {
  const { user, clubId } = await requireCoach();
  const groupId = String(formData.get("groupId") ?? "");
  const groupResult = await query<{ id: string; name: string; weeks: number }>(
    `SELECT g.id, g.name, (SELECT count(*)::int FROM "TrainingWeek" w WHERE w."groupId" = g.id) AS weeks
     FROM "TrainingGroup" g WHERE g.id = $1 AND g."clubId" = $2 LIMIT 1`, [groupId, clubId]
  );
  const group = groupResult.rows[0];

  if (!group) throw new Error("Groupe introuvable.");
  if (group.weeks > 0) {
    throw new Error("Ce groupe contient des séances planifiées. Supprime ou déplace d’abord ses séances.");
  }

  await withTransaction(async (tx) => {
    await tx.query(`UPDATE "Athlete" SET "groupId" = NULL WHERE "groupId" = $1`, [group.id]);
    await tx.query(`UPDATE "PlanningEvent" SET "groupId" = NULL WHERE "groupId" = $1`, [group.id]);
    await tx.query(`DELETE FROM "TrainingGroup" WHERE id = $1 AND "clubId" = $2`, [group.id, clubId]);
  });

  await trackEvent({
    type: "group.deleted",
    message: `Groupe supprime: ${group.name}`,
    clubId,
    userId: user.id,
    metadata: { groupId: group.id }
  });

  revalidateGroupPaths(group.id);
  redirect("/coach/groups");
}

function revalidateGroupPaths(groupId: string) {
  revalidatePath("/coach");
  revalidatePath("/coach/athletes");
  revalidatePath("/coach/groups");
  revalidatePath(`/coach/groups/${groupId}`);
  revalidatePath("/coach/sessions/new");
  revalidatePath("/coach/planning");
}
