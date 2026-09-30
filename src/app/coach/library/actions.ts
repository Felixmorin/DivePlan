"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireCoach } from "@/lib/current-user";
import { query } from "@/lib/db";

const exerciseSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Le nom est requis."),
  category: z.string().trim().min(1, "La catégorie est requise."),
  description: z.string().trim().min(1, "La description est requise."),
  bodyArea: z.string().trim().optional(),
  equipment: z.string().trim().optional(),
  setup: z.string().trim().optional(),
  defaultSets: z.number().int().min(1).max(50).nullable().optional(),
  defaultReps: z.number().int().min(1).max(500).nullable().optional(),
  defaultDuration: z.number().int().min(1).max(7200).nullable().optional(),
  roundTrip: z.boolean().default(false),
  restSeconds: z.number().int().min(0).max(3600).nullable().optional(),
  coachNotes: z.string().trim().optional()
});

export type LibraryExerciseInput = z.infer<typeof exerciseSchema>;

function clean(value?: string | null) {
  return value?.trim() || null;
}

export async function saveLibraryExercise(input: LibraryExerciseInput) {
  await requireCoach();
  const data = exerciseSchema.parse(input);
  const payload = {
    name: data.name,
    category: data.category,
    description: data.description,
    bodyArea: clean(data.bodyArea),
    equipment: clean(data.equipment),
    setup: clean(data.setup),
    defaultSets: data.defaultSets ?? null,
    defaultReps: data.roundTrip ? null : data.defaultReps ?? null,
    defaultDuration: data.roundTrip ? null : data.defaultDuration ?? null,
    roundTrip: data.roundTrip,
    restSeconds: data.restSeconds ?? null,
    coachNotes: clean(data.coachNotes),
    archivedAt: null
  };
  const exerciseId = data.id ?? randomUUID();
  if (data.id) {
    await query(
      `UPDATE "DrylandExercise" SET name=$1, category=$2, description=$3, "bodyArea"=$4, equipment=$5, setup=$6,
       "defaultSets"=$7, "defaultReps"=$8, "defaultDuration"=$9, "roundTrip"=$10, "restSeconds"=$11,
       "coachNotes"=$12, "archivedAt"=NULL, "updatedAt"=now() WHERE id=$13`,
      [payload.name, payload.category, payload.description, payload.bodyArea, payload.equipment, payload.setup,
       payload.defaultSets, payload.defaultReps, payload.defaultDuration, payload.roundTrip, payload.restSeconds, payload.coachNotes, exerciseId]
    );
  } else {
    await query(
      `INSERT INTO "DrylandExercise" (id, name, category, description, "bodyArea", equipment, setup, "defaultSets", "defaultReps", "defaultDuration", "roundTrip", "restSeconds", "coachNotes", "archivedAt", tags, "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NULL,'{}',now(),now())`,
      [exerciseId, payload.name, payload.category, payload.description, payload.bodyArea, payload.equipment, payload.setup,
       payload.defaultSets, payload.defaultReps, payload.defaultDuration, payload.roundTrip, payload.restSeconds, payload.coachNotes]
    );
  }

  revalidatePath("/coach/library");
  revalidatePath("/coach/sessions/new");
  revalidatePath("/coach/sessions");
  return { id: exerciseId, message: data.id ? "Exercice modifié" : "Exercice créé" };
}

export async function toggleLibraryExerciseFavorite(id: string) {
  await requireCoach();
  const result = await query<{ favorite: boolean }>(`UPDATE "DrylandExercise" SET favorite = NOT favorite, "updatedAt" = now() WHERE id = $1 AND "archivedAt" IS NULL RETURNING favorite`, [id]);
  const exercise = result.rows[0];
  if (!exercise) throw new Error("Exercice introuvable.");
  revalidatePath("/coach/library");
  return exercise.favorite;
}

export async function archiveLibraryExercise(id: string) {
  await requireCoach();
  const result = await query(`UPDATE "DrylandExercise" SET "archivedAt" = $1, "updatedAt" = $1 WHERE id = $2 AND "archivedAt" IS NULL`, [new Date(), id]);
  if (!result.rowCount) throw new Error("Exercice introuvable.");
  revalidatePath("/coach/library");
  revalidatePath("/coach/sessions/new");
  revalidatePath("/coach/sessions");
  return { message: "Exercice supprimé" };
}
