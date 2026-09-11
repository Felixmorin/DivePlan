"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCoach } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

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
    defaultReps: data.defaultReps ?? null,
    defaultDuration: data.defaultDuration ?? null,
    restSeconds: data.restSeconds ?? null,
    coachNotes: clean(data.coachNotes),
    archivedAt: null
  };
  const exercise = data.id
    ? await prisma.drylandExercise.update({ where: { id: data.id }, data: payload })
    : await prisma.drylandExercise.create({ data: { ...payload, tags: [] } });

  revalidatePath("/coach/library");
  revalidatePath("/coach/sessions/new");
  revalidatePath("/coach/sessions");
  return { id: exercise.id, message: data.id ? "Exercice modifié" : "Exercice créé" };
}

export async function toggleLibraryExerciseFavorite(id: string) {
  await requireCoach();
  const exercise = await prisma.drylandExercise.findFirst({ where: { id, archivedAt: null } });
  if (!exercise) throw new Error("Exercice introuvable.");
  await prisma.drylandExercise.update({ where: { id }, data: { favorite: !exercise.favorite } });
  revalidatePath("/coach/library");
  return !exercise.favorite;
}

export async function archiveLibraryExercise(id: string) {
  await requireCoach();
  const exercise = await prisma.drylandExercise.findFirst({ where: { id, archivedAt: null } });
  if (!exercise) throw new Error("Exercice introuvable.");
  await prisma.drylandExercise.update({ where: { id }, data: { archivedAt: new Date() } });
  revalidatePath("/coach/library");
  revalidatePath("/coach/sessions/new");
  revalidatePath("/coach/sessions");
  return { message: "Exercice supprimé" };
}
