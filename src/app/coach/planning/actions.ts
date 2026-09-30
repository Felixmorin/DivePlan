"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireCoach } from "@/lib/current-user";
import { query, withTransaction } from "@/lib/db";
import { addMontrealDays, parseMontrealDateTimeInput } from "@/lib/timezone";

const PlanningEventType = { COMPETITION: "COMPETITION", CAMP: "CAMP", TRAINING_SCHEDULE: "TRAINING_SCHEDULE" } as const;

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
    const group = await query(`SELECT id FROM "TrainingGroup" WHERE id = $1 AND "clubId" = $2 LIMIT 1`, [target.groupId, clubId]);
    if (!group.rowCount) throw new Error("Groupe introuvable pour ce club.");
  }

  if (target.athleteId) {
    const athlete = await query(`SELECT id FROM "Athlete" WHERE id = $1 AND "clubId" = $2 LIMIT 1`, [target.athleteId, clubId]);
    if (!athlete.rowCount) throw new Error("Athlete introuvable pour ce club.");
  }

  const firstDate = parseMontrealDateTimeInput(data.startsAt);
  const isRecurringTraining = data.type === PlanningEventType.TRAINING_SCHEDULE && data.recurrence === "WEEKLY";
  const lastDate = isRecurringTraining && data.recurrenceUntil
    ? parseMontrealDateTimeInput(`${data.recurrenceUntil}T23:59`)
    : firstDate;
  const startsAt: Date[] = [];
  for (let occurrence = firstDate; occurrence <= lastDate; occurrence = addMontrealDays(occurrence, 7)) {
    startsAt.push(occurrence);
  }

  await withTransaction(async (tx) => {
    for (const occurrence of startsAt) {
      await tx.query(
        `INSERT INTO "PlanningEvent" (id, "clubId", "groupId", "athleteId", type, title, "startsAt", "endsAt", duration, location, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [randomUUID(), clubId, target.groupId ?? null, target.athleteId ?? null, data.type, data.title, occurrence,
          data.type === PlanningEventType.COMPETITION && data.endsAt ? parseMontrealDateTimeInput(data.endsAt) : null,
          data.duration ?? null, data.location || null, data.notes || null]
      );
    }
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

  const event = await query(`SELECT id FROM "PlanningEvent" WHERE id = $1 AND "clubId" = $2 LIMIT 1`, [eventId, clubId]);
  if (!event.rowCount) throw new Error("Événement introuvable.");

  if (target.groupId) {
    const group = await query(`SELECT id FROM "TrainingGroup" WHERE id = $1 AND "clubId" = $2 LIMIT 1`, [target.groupId, clubId]);
    if (!group.rowCount) throw new Error("Groupe introuvable pour ce club.");
  }

  if (target.athleteId) {
    const athlete = await query(`SELECT id FROM "Athlete" WHERE id = $1 AND "clubId" = $2 LIMIT 1`, [target.athleteId, clubId]);
    if (!athlete.rowCount) throw new Error("Athlète introuvable pour ce club.");
  }

  await query(
    `UPDATE "PlanningEvent" SET type=$1, title=$2, "startsAt"=$3, "endsAt"=$4, duration=$5, location=$6, notes=$7, "groupId"=$8, "athleteId"=$9 WHERE id=$10 AND "clubId"=$11`,
    [data.type, data.title, parseMontrealDateTimeInput(data.startsAt), data.type === PlanningEventType.COMPETITION && data.endsAt ? parseMontrealDateTimeInput(data.endsAt) : null,
      data.duration ?? null, data.location || null, data.notes || null, target.groupId ?? null, target.athleteId ?? null, eventId, clubId]
  );

  revalidatePath("/coach");
  revalidatePath("/coach/planning");
  revalidatePath("/athlete/calendar");
}

export async function deletePlanningEvent(formData: FormData) {
  const { clubId } = await requireCoach();
  const eventId = String(formData.get("eventId") ?? "");

  if (!eventId) throw new Error("Événement introuvable.");

  const deleted = await query(`DELETE FROM "PlanningEvent" WHERE id = $1 AND "clubId" = $2`, [eventId, clubId]);

  if (!deleted.rowCount) throw new Error("Événement introuvable.");

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
