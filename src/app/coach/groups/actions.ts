"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireCoach } from "@/lib/current-user";
import { trackEvent } from "@/lib/monitoring";
import { prisma } from "@/lib/prisma";

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
  const existingGroup = await prisma.trainingGroup.findFirst({
    where: { clubId, name: { equals: name, mode: "insensitive" } },
    select: { id: true }
  });

  if (existingGroup) {
    throw new Error("Un groupe avec ce nom existe deja.");
  }

  const group = await prisma.trainingGroup.create({
    data: { name, clubId, coachId: coach.id }
  });

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

  const group = await prisma.trainingGroup.findFirst({
    where: { id: groupId, clubId },
    select: { id: true, name: true }
  });

  if (!group) {
    throw new Error("Groupe introuvable.");
  }

  const validAthletes = selectedAthleteIds.length > 0
    ? await prisma.athlete.findMany({
      where: { id: { in: selectedAthleteIds }, clubId, active: true },
      select: { id: true }
    })
    : [];
  const validAthleteIds = validAthletes.map((athlete) => athlete.id);

  await prisma.$transaction([
    prisma.athlete.updateMany({
      where: { clubId, groupId: group.id },
      data: { groupId: null }
    }),
    ...(validAthleteIds.length > 0
      ? [prisma.athlete.updateMany({
        where: { clubId, id: { in: validAthleteIds } },
        data: { groupId: group.id }
      })]
      : [])
  ]);

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
  const group = await prisma.trainingGroup.findFirst({
    where: { id: groupId, clubId },
    select: { id: true, name: true, _count: { select: { weeks: true } } }
  });

  if (!group) throw new Error("Groupe introuvable.");
  if (group._count.weeks > 0) {
    throw new Error("Ce groupe contient des séances planifiées. Supprime ou déplace d’abord ses séances.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.athlete.updateMany({ where: { groupId: group.id }, data: { groupId: null } });
    await tx.planningEvent.updateMany({ where: { groupId: group.id }, data: { groupId: null } });
    await tx.trainingGroup.delete({ where: { id: group.id } });
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
