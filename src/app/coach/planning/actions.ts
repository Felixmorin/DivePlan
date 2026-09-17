"use server";

import { revalidatePath } from "next/cache";
import { PlanningEventType } from "@prisma/client";
import { z } from "zod";
import { requireCoach } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { addMontrealDays, parseMontrealDateTimeInput } from "@/lib/timezone";

const planningEventSchema = z.object({
  type: z.nativeEnum(PlanningEventType),
  title: z.string().trim().min(3, "Le titre est requis."),
  startsAt: z.string().min(16, "La date et l'heure sont requises."),
  endsAt: z.string().min(16).optional().or(z.literal("")),
  duration: z.coerce.number().int().min(1).max(10080).optional().or(z.literal("").transform(() => undefined)),
  location: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  target: z.string().optional(),
  recurrence: z.enum(["NONE", "WEEKLY"]).default("NONE"),
  recurrenceUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La date de fin est invalide.").optional().or(z.literal(""))
}).superRefine((data, context) => {
  if (data.type === PlanningEventType.COMPETITION && !data.endsAt) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "La date de fin est requise pour une compétition." });
  }
  if (data.endsAt && parseMontrealDateTimeInput(data.endsAt) < parseMontrealDateTimeInput(data.startsAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "La date de fin doit être après le début." });
  }
  if (data.type !== PlanningEventType.TRAINING_SCHEDULE || data.recurrence === "NONE") return;
  if (!data.recurrenceUntil) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["recurrenceUntil"], message: "Choisis une date de fin pour la répétition." });
    return;
  }

  const firstDate = parseMontrealDateTimeInput(data.startsAt);
  const lastDate = parseMontrealDateTimeInput(`${data.recurrenceUntil}T23:59`);
  if (lastDate < firstDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["recurrenceUntil"], message: "La date de fin doit être après la première séance." });
  }
  if (lastDate > addMontrealDays(firstDate, 366)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["recurrenceUntil"], message: "La répétition est limitée à un an." });
  }
});

export async function createPlanningEvent(formData: FormData) {
  const { clubId } = await requireCoach();
  const data = planningEventSchema.parse({
    type: formData.get("type"),
    title: formData.get("title"),
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt") ?? "",
    duration: formData.get("duration") ?? "",
    location: formData.get("location") ?? "",
    notes: formData.get("notes") ?? "",
    target: formData.get("target") ?? "",
    recurrence: formData.get("recurrence") ?? "NONE",
    recurrenceUntil: formData.get("recurrenceUntil") ?? ""
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

  const firstDate = parseMontrealDateTimeInput(data.startsAt);
  const isRecurringTraining = data.type === PlanningEventType.TRAINING_SCHEDULE && data.recurrence === "WEEKLY";
  const lastDate = isRecurringTraining && data.recurrenceUntil
    ? parseMontrealDateTimeInput(`${data.recurrenceUntil}T23:59`)
    : firstDate;
  const startsAt = [];
  for (let occurrence = firstDate; occurrence <= lastDate; occurrence = addMontrealDays(occurrence, 7)) {
    startsAt.push(occurrence);
  }

  await prisma.planningEvent.createMany({
    data: startsAt.map((startsAt) => ({
      clubId,
      groupId: target.groupId,
      athleteId: target.athleteId,
      type: data.type,
      title: data.title,
      startsAt,
      endsAt: data.type === PlanningEventType.COMPETITION && data.endsAt ? parseMontrealDateTimeInput(data.endsAt) : null,
      duration: data.duration,
      location: data.location || null,
      notes: data.notes || null
    }))
  });

  revalidatePath("/coach");
  revalidatePath("/coach/planning");
  revalidatePath("/athlete/calendar");
}

export async function updatePlanningEvent(formData: FormData) {
  const { clubId } = await requireCoach();
  const eventId = String(formData.get("eventId") ?? "");
  const data = planningEventSchema.parse({
    type: formData.get("type"),
    title: formData.get("title"),
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt") ?? "",
    duration: formData.get("duration") ?? "",
    location: formData.get("location") ?? "",
    notes: formData.get("notes") ?? "",
    target: formData.get("target") ?? "club",
    recurrence: "NONE",
    recurrenceUntil: ""
  });
  const target = parseTarget(data.target);

  const event = await prisma.planningEvent.findFirst({
    where: { id: eventId, clubId },
    select: { id: true }
  });
  if (!event) throw new Error("Événement introuvable.");

  if (target.groupId) {
    const group = await prisma.trainingGroup.findFirst({ where: { id: target.groupId, clubId }, select: { id: true } });
    if (!group) throw new Error("Groupe introuvable pour ce club.");
  }

  if (target.athleteId) {
    const athlete = await prisma.athlete.findFirst({ where: { id: target.athleteId, clubId }, select: { id: true } });
    if (!athlete) throw new Error("Athlète introuvable pour ce club.");
  }

  await prisma.planningEvent.update({
    where: { id: event.id },
    data: {
      type: data.type,
      title: data.title,
      startsAt: parseMontrealDateTimeInput(data.startsAt),
      endsAt: data.type === PlanningEventType.COMPETITION && data.endsAt ? parseMontrealDateTimeInput(data.endsAt) : null,
      duration: data.duration,
      location: data.location || null,
      notes: data.notes || null,
      groupId: target.groupId ?? null,
      athleteId: target.athleteId ?? null
    }
  });

  revalidatePath("/coach");
  revalidatePath("/coach/planning");
  revalidatePath("/athlete/calendar");
}

export async function deletePlanningEvent(formData: FormData) {
  const { clubId } = await requireCoach();
  const eventId = String(formData.get("eventId") ?? "");

  if (!eventId) throw new Error("Événement introuvable.");

  const deleted = await prisma.planningEvent.deleteMany({
    where: { id: eventId, clubId }
  });

  if (deleted.count === 0) throw new Error("Événement introuvable.");

  revalidatePath("/coach");
  revalidatePath("/coach/planning");
  revalidatePath("/athlete");
  revalidatePath("/athlete/calendar");
}

function parseTarget(value?: string) {
  if (!value || value === "club") return {};
  if (value.startsWith("group:")) return { groupId: value.slice("group:".length) };
  if (value.startsWith("athlete:")) return { athleteId: value.slice("athlete:".length) };
  return {};
}
