"use server";

import { revalidatePath } from "next/cache";
import { PlanningEventType } from "@prisma/client";
import { z } from "zod";
import { requireCoach } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { parseMontrealDateTimeInput } from "@/lib/timezone";

const planningEventSchema = z.object({
  type: z.nativeEnum(PlanningEventType),
  title: z.string().trim().min(3, "Le titre est requis."),
  startsAt: z.string().min(16, "La date et l'heure sont requises."),
  duration: z.coerce.number().int().min(1).max(10080).optional().or(z.literal("").transform(() => undefined)),
  location: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  target: z.string().optional()
});

export async function createPlanningEvent(formData: FormData) {
  const { clubId } = await requireCoach();
  const data = planningEventSchema.parse({
    type: formData.get("type"),
    title: formData.get("title"),
    startsAt: formData.get("startsAt"),
    duration: formData.get("duration") ?? "",
    location: formData.get("location") ?? "",
    notes: formData.get("notes") ?? "",
    target: formData.get("target") ?? ""
  });
  const target = parseTarget(data.target);

  if (target.groupId) {
    const group = await prisma.trainingGroup.findFirst({ where: { id: target.groupId, clubId }, select: { id: true } });
    if (!group) throw new Error("Groupe introuvable pour ce club.");
  }

  if (target.athleteId) {
    const athlete = await prisma.athlete.findFirst({ where: { id: target.athleteId, clubId }, select: { id: true } });
    if (!athlete) throw new Error("Athlete introuvable pour ce club.");
  }

  await prisma.planningEvent.create({
    data: {
      clubId,
      groupId: target.groupId,
      athleteId: target.athleteId,
      type: data.type,
      title: data.title,
      startsAt: parseMontrealDateTimeInput(data.startsAt),
      duration: data.duration,
      location: data.location || null,
      notes: data.notes || null
    }
  });

  revalidatePath("/coach");
  revalidatePath("/coach/planning");
}

function parseTarget(value?: string) {
  if (!value || value === "club") return {};
  if (value.startsWith("group:")) return { groupId: value.slice("group:".length) };
  if (value.startsWith("athlete:")) return { athleteId: value.slice("athlete:".length) };
  return {};
}
