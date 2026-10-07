"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { withTransaction, query } from "@/lib/db";
import { z } from "zod";
import { requireCoach } from "@/lib/current-user";
import { trackEvent } from "@/lib/monitoring";
import { countPoolContexts, validatePoolListRow, type PoolListRow } from "@/lib/pool-list";
import {
  buildSessionTemplatePayload,
  createSessionFromPayload,
  getSessionSnapshot,
  parseSessionTemplatePayload
  ,BlockType, PoolHeight, SessionStatus, WeekStatus, type SessionBlockType, type SessionPoolHeight
} from "@/lib/session-template";
import { formatMontrealDate, parseMontrealDateTimeInput, startOfMontrealWeek, toMontrealDateInputValue } from "@/lib/timezone";
import { dispatchSessionPublication, isAutomaticSessionPushEnabled, saveSessionPublicationTargets } from "@/lib/web-push";

const sessionInputSchema = z.object({
  title: z.string().min(3),
  date: z.string().min(10),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  groupId: z.string().min(1),
  duration: z.number().int().min(15).max(600),
  focus: z.string().trim().max(200).default(""),
  notes: z.string().optional(),
  evaluationPlacement: z.string().default("none"),
  planningEventId: z.string().optional(),
  templateId: z.string().optional(),
  status: z.nativeEnum(SessionStatus).default(SessionStatus.READY).refine((status) => status === SessionStatus.DRAFT || status === SessionStatus.READY),
  warmup: z.object({
    enabled: z.boolean(),
    competitionEvaluation: z.boolean().default(false),
    title: z.string().trim().min(1),
    duration: z.number().int().min(1),
    description: z.string().optional()
  }),
  cooldown: z.object({
    enabled: z.boolean(),
    competitionEvaluation: z.boolean().default(false),
    title: z.string().trim().min(1),
    duration: z.number().int().min(1),
    description: z.string().optional()
  }),
  drylandBlocks: z.array(z.object({
    competitionEvaluation: z.boolean().default(false),
    title: z.string().trim().min(1),
    duration: z.number().int().min(1),
    exerciseIds: z.array(z.string()).min(1),
    athleteIds: z.array(z.string()).min(1),
    exerciseOverrides: z.record(z.string(), z.object({
      sets: z.number().int().min(1).max(20).nullable(),
      reps: z.number().int().min(1).max(200).nullable(),
      duration: z.number().int().min(1).max(3600).nullable(),
      notes: z.string().nullable()
    })).default({})
  })).default([]),
  poolBlocks: z.array(z.object({
    competitionEvaluation: z.boolean().default(false),
    title: z.string().min(1),
    duration: z.number().int().min(1).max(600),
    athleteIds: z.array(z.string()).default([]),
    sections: z.array(z.object({
      height: z.nativeEnum(PoolHeight),
      label: z.string().nullable(),
      dives: z.array(z.object({
        diveCode: z.string().min(1),
        diveName: z.string().min(1),
        position: z.string().min(1),
        repetitions: z.number().min(1),
        notes: z.string().nullable(),
        order: z.number()
      })).min(1)
    })).min(1)
  })).default([])
});

export type CreateSessionInput = z.infer<typeof sessionInputSchema>;

const quickExerciseSchema = z.object({
  name: z.string().trim().min(2),
  category: z.string().trim().min(2).default("Custom"),
  equipment: z.string().trim().optional(),
  defaultSets: z.number().int().min(1).max(20).nullable().optional(),
  defaultReps: z.number().int().min(1).max(200).nullable().optional(),
  defaultDuration: z.number().int().min(1).max(3600).nullable().optional(),
  roundTrip: z.boolean().default(false),
  tags: z.array(z.string().trim().min(1)).default([])
});

const poolRowsEditSchema = z.array(z.object({
  id: z.string(),
  context: z.string(),
  diveCodes: z.array(z.string()),
  repetitions: z.array(z.number())
})).min(1);

export type QuickExerciseInput = z.infer<typeof quickExerciseSchema>;

export async function createDrylandExercise(input: QuickExerciseInput) {
  await requireCoach();
  const data = quickExerciseSchema.parse(input);
  const exercise = (await query<{id:string;name:string;category:string;defaultSets:number|null;defaultReps:number|null;defaultDuration:number|null;roundTrip:boolean;equipment:string|null;tags:string[]}>(
    `INSERT INTO "DrylandExercise" (id,name,category,description,equipment,"defaultSets","defaultReps","defaultDuration","roundTrip",tags,"createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW()) RETURNING id,name,category,"defaultSets","defaultReps","defaultDuration","roundTrip",equipment,tags`,
    [randomUUID(),data.name,data.category||"Custom",`Exercice ajoute rapidement: ${data.name}`,data.equipment?.trim()||null,data.defaultSets??null,data.roundTrip?null:data.defaultReps??null,data.roundTrip?null:data.defaultDuration??null,data.roundTrip,Array.from(new Set(data.tags.map(tag=>tag.toLowerCase())))]
  )).rows[0];

  revalidatePath("/coach/sessions/new");
  revalidatePath("/coach/library");

  return {
    id: exercise.id,
    name: exercise.name,
    category: exercise.category,
    sets: exercise.defaultSets,
    reps: exercise.defaultReps,
    duration: exercise.defaultDuration,
    roundTrip: exercise.roundTrip,
    equipment: exercise.equipment,
    tags: exercise.tags
  };
}

export async function createTrainingSession(input: CreateSessionInput) {
  const { user, coach, clubId } = await requireCoach();
  const data = sessionInputSchema.parse(input);
  const group = (await query<{id:string}>(`SELECT id FROM "TrainingGroup" WHERE id=$1 AND "clubId"=$2`,[data.groupId,clubId])).rows[0];

  if (!group) {
    throw new Error("Groupe introuvable pour ce club.");
  }

  const planningEvent = data.planningEventId
    ? (await query<{id:string;startsAt:Date}>(`SELECT id,"startsAt" FROM "PlanningEvent" WHERE id=$1 AND "clubId"=$2 AND ("groupId"=$3 OR "groupId" IS NULL) AND type='TRAINING_SCHEDULE'`,[data.planningEventId,clubId,data.groupId])).rows[0] ?? null
    : null;
  if (data.planningEventId && !planningEvent) throw new Error("Horaire d'entraînement introuvable pour ce groupe.");
  if (planningEvent && toMontrealDateInputValue(planningEvent.startsAt) !== data.date) {
    throw new Error("L'horaire sélectionné ne correspond pas à la date de la séance.");
  }
  const sessionDate = planningEvent?.startsAt ?? parseMontrealDateTimeInput(`${data.date}T${data.time}`);

  if (data.templateId) {
    const template = (await query<{id:string;payload:unknown;name:string}>(`SELECT id,payload,name FROM "SessionTemplate" WHERE id=$1 AND "clubId"=$2`,[data.templateId,clubId])).rows[0];

    if (!template) {
      throw new Error("Modele introuvable pour ce club.");
    }

    const payload = parseSessionTemplatePayload(template.payload);
    const session = await withTransaction(async (tx) => {
      const created = await createSessionFromPayload(tx, {
        clubId,
        coachId: coach.id,
        groupId: data.groupId,
        date: sessionDate,
        title: data.title.trim(),
        duration: data.duration,
        focus: data.focus.trim(),
        notes: data.notes?.trim() || null,
        payload,
        status: data.status
      });
      if (planningEvent?.id) await tx.query(`UPDATE "TrainingSession" SET "planningEventId"=$1 WHERE id=$2`,[planningEvent.id,created.id]);
      if (data.status === SessionStatus.READY && isAutomaticSessionPushEnabled()) await saveSessionPublicationTargets(tx, created.id);
      return created;
    });

    if (data.status === SessionStatus.READY) await dispatchSessionPublication(session.id).catch(() => undefined);

    revalidatePath("/coach");
    revalidatePath("/coach/planning");
    revalidatePath("/coach/sessions");
    await trackEvent({
      type: "session.created_from_template",
      message: `Seance creee depuis modele: ${session.title}`,
      clubId,
      userId: user.id,
      metadata: { sessionId: session.id, templateId: template.id }
    });
    redirect(`/coach/sessions/${session.id}`);
  }

  const blockEvaluationCount = Number(data.warmup.competitionEvaluation) + Number(data.cooldown.competitionEvaluation) +
    data.drylandBlocks.filter((block) => block.competitionEvaluation).length +
    data.poolBlocks.filter((block) => block.competitionEvaluation).length;
  const isBlockPlacement = data.evaluationPlacement.startsWith("block:") && data.evaluationPlacement.length > 6;
  const invalidEvaluationPlacement = data.evaluationPlacement === "none"
    ? blockEvaluationCount !== 0
    : data.evaluationPlacement === "start"
      ? blockEvaluationCount !== 0
      : !isBlockPlacement || data.warmup.competitionEvaluation || data.cooldown.competitionEvaluation || blockEvaluationCount !== 1;
  if (invalidEvaluationPlacement) {
    throw new Error("Choisis un seul moment pour l’évaluation de confiance.");
  }

  if ((!data.warmup.enabled && !data.cooldown.enabled && data.drylandBlocks.length === 0 && data.poolBlocks.length === 0) ||
      data.poolBlocks.some((block) => block.athleteIds.length === 0)) {
    throw new Error("La seance doit contenir au moins un bloc et chaque bloc d'entrainement doit etre complet et assigne.");
  }

  const poolAthleteIds = data.poolBlocks.flatMap((block) => block.athleteIds);
  const requestedAthleteIds = Array.from(new Set([...data.drylandBlocks.flatMap((block) => block.athleteIds), ...poolAthleteIds]));
  const [athletes, exercises] = await Promise.all([
    query<{id:string}>(`SELECT id FROM "Athlete" WHERE "clubId"=$1 AND active=true AND "groupId"=$2`,[clubId,data.groupId]),
    query<{id:string;defaultSets:number|null;defaultReps:number|null;defaultDuration:number|null;roundTrip:boolean}>(`SELECT id,"defaultSets","defaultReps","defaultDuration","roundTrip" FROM "DrylandExercise" WHERE id=ANY($1::text[]) AND "archivedAt" IS NULL`,[data.drylandBlocks.flatMap((block) => block.exerciseIds)])
  ]);

  const validAthleteIds = new Set(athletes.rows.map((athlete) => athlete.id));
  const requireValidAthletes = (ids: string[]) => ids.filter((id) => validAthleteIds.has(id));
  const allAthleteIds = requestedAthleteIds.length > 0
    ? requestedAthleteIds.filter((id) => validAthleteIds.has(id))
    : Array.from(validAthleteIds);
  const drylandBlocks = data.drylandBlocks.map((block) => ({
    ...block,
    athleteIds: requireValidAthletes(block.athleteIds),
    exercises: block.exerciseIds.flatMap((id) => {
      const exercise = exercises.rows.find((item) => item.id === id);
      return exercise ? [{ ...exercise, override: block.exerciseOverrides[id] }] : [];
    })
  }));
  const poolBlocks = data.poolBlocks.map((block) => ({ ...block, athleteIds: requireValidAthletes(block.athleteIds) }));

  if (allAthleteIds.length === 0 || drylandBlocks.some((block) => block.athleteIds.length === 0 || block.exercises.length !== block.exerciseIds.length) || poolBlocks.some((block) => block.athleteIds.length === 0)) {
    throw new Error("La seance doit contenir au moins un athlete et un exercice valides.");
  }

  const weekStart = startOfMontrealWeek(sessionDate);
  const session = await withTransaction(async (tx) => {
    const found=(await tx.query<{id:string}>(`SELECT id FROM "TrainingWeek" WHERE "clubId"=$1 AND "groupId"=$2 AND "startDate"=$3 LIMIT 1`,[clubId,data.groupId,weekStart])).rows[0];
    const weekId=found?.id??randomUUID();
    if(!found) await tx.query(`INSERT INTO "TrainingWeek" (id,"clubId","groupId","startDate",title,status) VALUES ($1,$2,$3,$4,$5,$6)`,[weekId,clubId,data.groupId,weekStart,`Semaine du ${formatMontrealDate(weekStart)}`,WeekStatus.PUBLISHED]);
    const createdSession=(await tx.query<{id:string;title:string}>(`INSERT INTO "TrainingSession" (id,date,title,duration,focus,notes,"weekId","coachId",status,"competitionEvaluationAtStart","planningEventId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,title`,[randomUUID(),sessionDate,data.title.trim(),data.duration,data.focus.trim(),data.notes?.trim()||null,weekId,coach.id,data.status,data.evaluationPlacement === "start",planningEvent?.id??null])).rows[0];

    if (data.warmup.enabled) {
      await createBlock(tx, {
        sessionId: createdSession.id,
        type: BlockType.WARMUP,
        title: data.warmup.title,
        description: data.warmup.description,
        duration: data.warmup.duration,
        position: 1,
        estimatedVolume: 0,
        athleteIds: allAthleteIds
        ,competitionEvaluation: data.warmup.competitionEvaluation
      });
    }

    for (const [index, dryland] of drylandBlocks.entries()) {
      const drylandBlock = await createBlock(tx, {
        sessionId: createdSession.id,
        type: BlockType.DRYLAND,
        title: dryland.title,
        duration: dryland.duration,
        position: index + 2,
        estimatedVolume: dryland.exercises.reduce((sum, exercise) => sum + (exercise.override?.sets ?? exercise.defaultSets ?? 1) * (exercise.override?.reps ?? exercise.defaultReps ?? 1) * dryland.athleteIds.length, 0),
        athleteIds: dryland.athleteIds
        ,competitionEvaluation: dryland.competitionEvaluation
      });

      for (const [order, exercise] of dryland.exercises.entries()) await tx.query(`INSERT INTO "DrylandBlockExercise" ("blockId","exerciseId",sets,reps,duration,notes,"order") VALUES ($1,$2,$3,$4,$5,$6,$7)`,[drylandBlock.id,exercise.id,exercise.override?.sets??exercise.defaultSets,exercise.roundTrip?null:exercise.override?.reps??exercise.defaultReps,exercise.roundTrip?null:exercise.override?.duration??exercise.defaultDuration,exercise.override?.notes??null,order]);
    }

    for (const [index, poolBlock] of poolBlocks.entries()) {
      await createPoolBlock(tx, createdSession.id, poolBlock, index + drylandBlocks.length + 2);
    }

    if (data.status === SessionStatus.READY && isAutomaticSessionPushEnabled()) await saveSessionPublicationTargets(tx, createdSession.id);

    if (data.cooldown.enabled) {
      await createBlock(tx, {
        sessionId: createdSession.id,
        type: BlockType.COOLDOWN,
        title: data.cooldown.title,
        description: data.cooldown.description,
        duration: data.cooldown.duration,
        position: 99,
        estimatedVolume: 0,
        athleteIds: allAthleteIds
        ,competitionEvaluation: data.cooldown.competitionEvaluation
      });
    }

    return createdSession;
  });

  if (data.status === SessionStatus.READY) await dispatchSessionPublication(session.id).catch(() => undefined);

  revalidatePath("/coach");
  revalidatePath("/coach/planning");
  revalidatePath("/coach/sessions");
  await trackEvent({
    type: "session.created",
    message: `Seance creee: ${session.title}`,
    clubId,
    userId: user.id,
    metadata: { sessionId: session.id }
  });
  redirect(`/coach/sessions/${session.id}`);
}

export async function duplicateTrainingSession(formData: FormData) {
  const { user, coach, clubId } = await requireCoach();
  const sessionId = String(formData.get("sessionId") ?? "");
  const source = await getSessionSnapshot(sessionId, clubId);

  if (!source) {
    throw new Error("Seance introuvable.");
  }

  const payload = buildSessionTemplatePayload(source);
  const copyDate = new Date(source.date);
  const session = await withTransaction((tx) =>
    createSessionFromPayload(tx, {
      clubId,
      coachId: coach.id,
      groupId: source.week.groupId,
      date: copyDate,
      title: `Copie de ${source.title}`,
      duration: source.duration,
      focus: source.focus,
      notes: source.notes,
      payload,
      status: SessionStatus.DRAFT
    })
  );

  await trackEvent({
    type: "session.duplicated",
    message: `Seance dupliquee: ${source.title}`,
    clubId,
    userId: user.id,
    metadata: { sourceSessionId: source.id, sessionId: session.id }
  });

  revalidatePath("/coach");
  revalidatePath("/coach/planning");
  revalidatePath("/coach/sessions");
  redirect(`/coach/sessions/${session.id}/edit`);
}

export async function saveSessionAsTemplate(formData: FormData) {
  const { user, clubId } = await requireCoach();
  const sessionId = String(formData.get("sessionId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "General").trim() || "General";
  const source = await getSessionSnapshot(sessionId, clubId);

  if (!source) {
    throw new Error("Seance introuvable.");
  }

  if (name.length < 3) {
    throw new Error("Le nom du modele est requis.");
  }

  const template=(await query<{id:string;name:string}>(`INSERT INTO "SessionTemplate" (id,name,category,"sessionId","clubId",favorite,payload) VALUES ($1,$2,$3,$4,$5,false,$6::jsonb) RETURNING id,name`,[randomUUID(),name,category,source.id,clubId,JSON.stringify(buildSessionTemplatePayload(source))])).rows[0];

  await trackEvent({
    type: "session_template.created",
    message: `Modele cree: ${template.name}`,
    clubId,
    userId: user.id,
    metadata: { templateId: template.id, sessionId: source.id }
  });

  revalidatePath("/coach/templates");
  revalidatePath("/coach/library");
  revalidatePath(`/coach/sessions/${source.id}`);
}

export async function saveDrylandBlockAsTemplate(formData: FormData) {
  const { user, clubId } = await requireCoach();
  const name = String(formData.get("name") ?? "").trim();
  let block: { title: string; duration: number; exercises: { exerciseId: string; sets: number | null; reps: number | null; duration: number | null; notes: string | null }[] };
  try {
    block = JSON.parse(String(formData.get("block") ?? ""));
  } catch {
    throw new Error("Bloc dryland invalide.");
  }
  if (name.length < 3 || !block.title || !Number.isFinite(block.duration) || !Array.isArray(block.exercises) || block.exercises.length === 0) {
    throw new Error("Donne un nom au modèle et ajoute au moins un exercice au bloc.");
  }
  const exercises = await query<{id:string}>(`SELECT id FROM "DrylandExercise" WHERE id=ANY($1::text[]) AND "archivedAt" IS NULL`,[block.exercises.map((item) => item.exerciseId)]);
  const validIds = new Set(exercises.rows.map((exercise) => exercise.id));
  const items = block.exercises.filter((item) => validIds.has(item.exerciseId));
  if (items.length === 0) throw new Error("Aucun exercice valide dans ce bloc.");
  const volume = items.reduce((sum, item) => sum + (item.sets ?? 1) * (item.reps ?? 0), 0);
  const payload = {
        version: 1,
        competitionEvaluationAtStart: false,
        title: name,
        duration: block.duration,
        focus: "",
        notes: null,
        blocks: [{
          type: "DRYLAND",
          title: block.title,
          description: null,
          duration: block.duration,
          position: 0,
          estimatedVolume: volume,
          competitionEvaluation: false,
          athleteIds: [],
          drylandExercises: items.map((item, order) => ({ ...item, order })),
          poolTraining: null
        }]
      };
  await query(`INSERT INTO "SessionTemplate" (id,name,category,"clubId",favorite,payload) VALUES ($1,$2,'Dryland',$3,false,$4::jsonb)`,[randomUUID(),name,clubId,JSON.stringify(payload)]);
  await trackEvent({ type: "session_template.created", message: `Modele dryland cree: ${name}`, clubId, userId: user.id });
  revalidatePath("/coach/templates");
  revalidatePath("/coach/library");
}

export async function deleteSessionTemplate(formData: FormData) {
  const { user, clubId } = await requireCoach();
  const templateId = String(formData.get("templateId") ?? "");
  const template=(await query<{id:string;name:string}>(`SELECT id,name FROM "SessionTemplate" WHERE id=$1 AND "clubId"=$2`,[templateId,clubId])).rows[0];

  if (!template) {
    throw new Error("Modele introuvable.");
  }

  await query(`DELETE FROM "SessionTemplate" WHERE id=$1 AND "clubId"=$2`,[template.id,clubId]);
  await trackEvent({
    type: "session_template.deleted",
    message: `Modele supprime: ${template.name}`,
    clubId,
    userId: user.id,
    metadata: { templateId: template.id }
  });
  revalidatePath("/coach/templates");
  revalidatePath("/coach/library");
}

export async function markTrainingSessionNotDone(formData: FormData) {
  const { user, clubId } = await requireCoach();
  const sessionId = String(formData.get("sessionId") ?? "");
  const session=(await query<{id:string;title:string}>(`SELECT s.id,s.title FROM "TrainingSession" s JOIN "TrainingWeek" w ON w.id=s."weekId" WHERE s.id=$1 AND w."clubId"=$2`,[sessionId,clubId])).rows[0];

  if (!session) {
    throw new Error("Seance introuvable.");
  }

  await query(`UPDATE "TrainingSession" s SET status=$1 FROM "TrainingWeek" w WHERE s.id=$2 AND w.id=s."weekId" AND w."clubId"=$3`,[SessionStatus.NOT_DONE,session.id,clubId]);

  await trackEvent({
    type: "session.not_done",
    message: `Seance marquee non faite: ${session.title}`,
    clubId,
    userId: user.id,
    metadata: { sessionId: session.id }
  });

  revalidatePath("/coach");
  revalidatePath("/coach/planning");
  revalidatePath("/coach/sessions");
  revalidatePath(`/coach/sessions/${session.id}`);
}

export async function publishTrainingSession(formData: FormData) {
  const { user, clubId } = await requireCoach();
  const sessionId = String(formData.get("sessionId") ?? "");
  const session=(await query<{id:string;title:string}>(`SELECT s.id,s.title FROM "TrainingSession" s JOIN "TrainingWeek" w ON w.id=s."weekId" WHERE s.id=$1 AND w."clubId"=$2 AND s.status=$3`,[sessionId,clubId,SessionStatus.DRAFT])).rows[0];
  if (!session) throw new Error("Brouillon introuvable pour ce club.");

  await withTransaction(async (tx) => {
    const published = await tx.query(`UPDATE "TrainingSession" s SET status=$1 FROM "TrainingWeek" w WHERE s.id=$2 AND w.id=s."weekId" AND w."clubId"=$3 AND s.status=$4 RETURNING s.id`,[SessionStatus.READY,session.id,clubId,SessionStatus.DRAFT]);
    if (!published.rowCount) throw new Error("Ce brouillon a déjà été publié ou est introuvable.");
    if (isAutomaticSessionPushEnabled()) await saveSessionPublicationTargets(tx, session.id);
  });
  await dispatchSessionPublication(session.id).catch(() => undefined);
  await trackEvent({ type: "session.published", message: `Seance publiee: ${session.title}`, clubId, userId: user.id, metadata: { sessionId: session.id } });
  revalidatePath("/coach");
  revalidatePath("/coach/planning");
  revalidatePath("/coach/sessions");
  revalidatePath(`/coach/sessions/${session.id}`);
  revalidatePath("/athlete");
  revalidatePath("/athlete/calendar");
}

export async function markAthleteSessionCompleted(formData: FormData) {
  const { user, clubId } = await requireCoach();
  const sessionId = String(formData.get("sessionId") ?? "");
  const athleteId = String(formData.get("athleteId") ?? "");
  const session=(await query<{id:string;title:string}>(`SELECT DISTINCT s.id,s.title FROM "TrainingSession" s JOIN "TrainingWeek" w ON w.id=s."weekId" JOIN "SessionBlock" b ON b."sessionId"=s.id JOIN "SessionBlockAssignment" a ON a."sessionBlockId"=b.id WHERE s.id=$1 AND w."clubId"=$2 AND a."athleteId"=$3`,[sessionId,clubId,athleteId])).rows[0];
  if (!session) throw new Error("Séance ou athlète introuvable.");

  const completedAt = new Date();
  await query(`INSERT INTO "AthleteSessionCompletion" ("athleteId","sessionId","startedAt","completedAt",status) VALUES ($1,$2,$3,$3,'COMPLETED') ON CONFLICT ("athleteId","sessionId") DO UPDATE SET "completedAt"=EXCLUDED."completedAt",status='COMPLETED'`,[athleteId,sessionId,completedAt]);

  await trackEvent({
    type: "session.completed",
    message: `Séance marquée terminée par le coach: ${session.title}`,
    clubId,
    userId: user.id,
    metadata: { sessionId, athleteId, completedByCoach: true }
  });

  revalidatePath("/coach");
  revalidatePath("/coach/athletes");
  revalidatePath(`/coach/sessions/${sessionId}`);
  revalidatePath(`/coach/athletes/${athleteId}`);
  revalidatePath("/athlete");
  revalidatePath("/athlete/progress");
  revalidatePath("/athlete/profile");
}

export async function updateSessionDive(formData: FormData) {
  const { clubId } = await requireCoach();
  const sessionId = String(formData.get("sessionId") ?? "");
  const poolDiveId = String(formData.get("poolDiveId") ?? "");
  const athleteId = String(formData.get("athleteId") ?? "");
  const mode = String(formData.get("mode") ?? "planned");
  const diveCode = String(formData.get("diveCode") ?? "").trim().toUpperCase();
  const repetitions = Number(formData.get("repetitions"));
  if (!sessionId || !poolDiveId || !/^[0-9A-Z]{2,8}$/.test(diveCode) || !Number.isInteger(repetitions) || repetitions < 0 || repetitions > 500) {
    throw new Error("Vérifie le code du plongeon et son volume (0 à 500 répétitions).");
  }

  if (mode === "actual") {
    if (!athleteId) throw new Error("Athlète introuvable.");
    const authorized = await query<{ id: string }>(
      `SELECT d.id FROM "PoolDive" d JOIN "PoolSection" ps ON ps.id=d."poolSectionId" JOIN "PoolTraining" pt ON pt."blockId"=ps."poolTrainingId"
       JOIN "SessionBlock" b ON b.id=pt."blockId" JOIN "TrainingSession" s ON s.id=b."sessionId" JOIN "TrainingWeek" w ON w.id=s."weekId"
       JOIN "SessionBlockAssignment" a ON a."sessionBlockId"=b.id AND a."athleteId"=$1
       JOIN "AthleteSessionCompletion" c ON c."sessionId"=s.id AND c."athleteId"=a."athleteId" AND c.status='COMPLETED'
       WHERE d.id=$2 AND s.id=$3 AND w."clubId"=$4`, [athleteId, poolDiveId, sessionId, clubId]
    );
    if (!authorized.rowCount) throw new Error("Seule une séance terminée peut être corrigée ici.");
    await query(
      `INSERT INTO "AthleteDiveLog" (id,"athleteId","sessionId","poolDiveId","actualDiveCode","repetitionsCompleted","goldenRepetitions",rating)
       VALUES ($1,$2,$3,$4,$5,$6,0,'Coach') ON CONFLICT ("athleteId","sessionId","poolDiveId")
       DO UPDATE SET "actualDiveCode"=EXCLUDED."actualDiveCode","repetitionsCompleted"=EXCLUDED."repetitionsCompleted"`,
      [randomUUID(), athleteId, sessionId, poolDiveId, diveCode, repetitions]
    );
  } else if (mode === "planned") {
    const result = await query(
      `UPDATE "PoolDive" d SET "diveCode"=$1,"diveName"=$1,repetitions=$2
       FROM "PoolSection" ps JOIN "PoolTraining" pt ON pt."blockId"=ps."poolTrainingId"
       JOIN "SessionBlock" b ON b.id=pt."blockId" JOIN "TrainingSession" s ON s.id=b."sessionId"
       JOIN "TrainingWeek" w ON w.id=s."weekId"
       WHERE d."poolSectionId"=ps.id AND d.id=$3 AND s.id=$4 AND w."clubId"=$5 AND s.status='READY'
       AND EXISTS (SELECT 1 FROM "AthleteSessionCompletion" c WHERE c."sessionId"=s.id AND c.status='IN_PROGRESS')`,
      [diveCode, repetitions, poolDiveId, sessionId, clubId]
    );
    if (!result.rowCount) throw new Error("Le plongeon est modifiable pendant une séance en cours.");
  } else {
    throw new Error("Mode de modification invalide.");
  }

  revalidatePath(`/coach/sessions/${sessionId}`);
  if (mode === "actual") {
    revalidatePath("/coach/athletes");
    revalidatePath(`/coach/athletes/${athleteId}`);
  }
  revalidatePath(`/athlete/session/${sessionId}`);
  revalidatePath("/athlete/progress");
}

export async function updateActualSessionDive(_previousState: { success: boolean }, formData: FormData) {
  await updateSessionDive(formData);
  return { success: true };
}

export async function updatePoolSectionLine(_previousState: { success: boolean }, formData: FormData) {
  const { clubId } = await requireCoach();
  const sessionId = String(formData.get("sessionId") ?? "");
  const sectionId = String(formData.get("sectionId") ?? "");
  if (!sessionId || !sectionId) throw new Error("Ligne piscine introuvable.");

  await withTransaction(async (tx) => {
    const section = (await tx.query<{ id: string; height: SessionPoolHeight; label: string | null; blockId: string; poolTrainingId: string; hasCompleted: boolean }>(
      `SELECT ps.id,ps.height,ps.label,ps."poolTrainingId",b.id AS "blockId",
       (s.status='COMPLETED' OR EXISTS (SELECT 1 FROM "AthleteSessionCompletion" c WHERE c."sessionId"=s.id AND c.status='COMPLETED')) AS "hasCompleted"
       FROM "PoolSection" ps
       JOIN "PoolTraining" pt ON pt."blockId"=ps."poolTrainingId"
       JOIN "SessionBlock" b ON b.id=pt."blockId"
       JOIN "TrainingSession" s ON s.id=b."sessionId"
       JOIN "TrainingWeek" w ON w.id=s."weekId"
       WHERE ps.id=$1 AND s.id=$2 AND w."clubId"=$3 AND s.status IN ('READY','COMPLETED')
       AND (s.status='COMPLETED'
         OR EXISTS (SELECT 1 FROM "AthleteSessionCompletion" c WHERE c."sessionId"=s.id AND c.status='IN_PROGRESS')
         OR EXISTS (SELECT 1 FROM "AthleteSessionCompletion" c WHERE c."sessionId"=s.id AND c.status='COMPLETED')
         OR (NOT EXISTS (SELECT 1 FROM "AthleteSessionCompletion" c WHERE c."sessionId"=s.id AND (c."startedAt" IS NOT NULL OR c.status<>'NOT_STARTED'))
           AND NOT EXISTS (SELECT 1 FROM "AthleteDiveLog" l WHERE l."sessionId"=s.id)
           AND NOT EXISTS (SELECT 1 FROM "AthleteExerciseLog" l WHERE l."sessionId"=s.id)))`,
      [sectionId, sessionId, clubId]
    )).rows[0];
    if (!section) throw new Error("Cette ligne piscine n'est plus modifiable.");

    const dives = (await tx.query<{ id: string; diveCode: string; repetitions: number; order: number }>(`SELECT id,"diveCode",repetitions,"order" FROM "PoolDive" WHERE "poolSectionId"=$1 ORDER BY "order"`, [sectionId])).rows;
    const diveCodes = formData.getAll("diveCodes").map((value) => String(value).trim().toUpperCase());
    const repetitionValues = formData.getAll("repetitions").map((value) => String(value).trim());
    const contexts = formData.getAll("diveContexts").map((value) => String(value).trim());
    if (dives.length === 0 || diveCodes.length !== dives.length || repetitionValues.length !== dives.length || contexts.length !== dives.length) {
      throw new Error("Vérifie les codes, hauteurs et répétitions de chaque plongeon.");
    }
    const updates = dives.map((dive, index) => {
      const repetitions = /^\d+$/.test(repetitionValues[index]) ? Number(repetitionValues[index]) : Number.NaN;
      const diveCode = diveCodes[index];
      const context = contexts[index];
      if (!/^[0-9A-Z]{2,8}$/.test(diveCode) || !Number.isInteger(repetitions) || repetitions < 1 || repetitions > 500 || !context || validatePoolListRow({ id: dive.id, context, diveCodes: [diveCode], repetitions: [repetitions] }).errors.length > 0) {
        throw new Error("Vérifie la hauteur, le code et les répétitions de chaque plongeon.");
      }
      return { ...dive, originalDiveCode: dive.diveCode, originalRepetitions: dive.repetitions, diveCode, context, repetitions };
    });

    const previousContext = section.label ?? (section.height === PoolHeight.ONE_METER ? "1m" : section.height === PoolHeight.THREE_METER ? "3m" : section.height === PoolHeight.PLATFORM ? "Plateforme" : "Section personnalisée");
    const previousContextCount = Math.max(1, countPoolContexts(previousContext));
    const previousVolume = previousContextCount * dives.reduce((sum, dive) => sum + dive.repetitions, 0);
    const groups = Array.from(updates.reduce((map, dive) => {
      const group = map.get(dive.context) ?? [];
      group.push(dive);
      map.set(dive.context, group);
      return map;
    }, new Map<string, typeof updates>()));
    let nextOrder = (await tx.query<{ order: number }>(`SELECT COALESCE(MAX("order"),-1)::int AS "order" FROM "PoolSection" WHERE "poolTrainingId"=$1`, [section.poolTrainingId])).rows[0]?.order ?? -1;
    let nextVolume = 0;
    for (const [groupIndex, [context, groupDives]] of groups.entries()) {
      let targetSectionId = sectionId;
      if (groupIndex === 0) {
        await tx.query(`UPDATE "PoolSection" SET height=$1,label=$2 WHERE id=$3`, [poolHeightFromContext(context), context, sectionId]);
      } else {
        targetSectionId = randomUUID();
        nextOrder += 1;
        await tx.query(`INSERT INTO "PoolSection" (id,"poolTrainingId",height,label,"order") VALUES ($1,$2,$3,$4,$5)`, [targetSectionId, section.poolTrainingId, poolHeightFromContext(context), context, nextOrder]);
      }
      for (const dive of groupDives) {
        const postSessionChange = section.hasCompleted && (dive.diveCode !== dive.originalDiveCode || dive.repetitions !== dive.originalRepetitions || dive.context !== previousContext);
        const plannedRepetitions = section.hasCompleted ? dive.originalRepetitions : dive.repetitions;
        await tx.query(`UPDATE "PoolDive" SET "poolSectionId"=$1,"diveCode"=$2,"diveName"=$2,repetitions=$3,"postSessionModified"="postSessionModified" OR $4 WHERE id=$5`, [targetSectionId, dive.diveCode, plannedRepetitions, postSessionChange, dive.id]);
        if (section.hasCompleted && dive.repetitions !== dive.originalRepetitions) {
          // In a completed session this field is the realized repetition count.
          // Keep the plan above intact and save the correction for each completed assignee.
          await tx.query(
            `INSERT INTO "AthleteDiveLog" (id,"athleteId","sessionId","poolDiveId","actualDiveCode","repetitionsCompleted","goldenRepetitions",rating)
             SELECT gen_random_uuid()::text,a."athleteId",$1,$2,$5,$3,0,'Coach'
             FROM "SessionBlockAssignment" a
             JOIN "AthleteSessionCompletion" c ON c."athleteId"=a."athleteId" AND c."sessionId"=$1 AND c.status='COMPLETED'
             WHERE a."sessionBlockId"=$4
             ON CONFLICT ("athleteId","sessionId","poolDiveId")
             DO UPDATE SET "actualDiveCode"=COALESCE("AthleteDiveLog"."actualDiveCode",EXCLUDED."actualDiveCode"),"repetitionsCompleted"=EXCLUDED."repetitionsCompleted"`,
            [sessionId, dive.id, dive.repetitions, section.blockId, dive.diveCode]
          );
        }
        nextVolume += Math.max(1, countPoolContexts(context)) * plannedRepetitions;
      }
    }
    await tx.query(`UPDATE "SessionBlock" SET "estimatedVolume"=GREATEST(0,"estimatedVolume"+$1-$2) WHERE id=$3`, [nextVolume, previousVolume, section.blockId]);
  });

  revalidatePath(`/coach/sessions/${sessionId}`);
  revalidatePath("/coach/athletes");
  revalidatePath("/coach/athletes/[id]", "page");
  revalidatePath(`/athlete/session/${sessionId}`);
  revalidatePath("/athlete/progress");
  return { success: true };
}

export async function setAthleteSessionAbsence(formData: FormData) {
  const { clubId } = await requireCoach();
  const sessionId = String(formData.get("sessionId") ?? "");
  const athleteId = String(formData.get("athleteId") ?? "");
  const absent = formData.get("absent") === "on";
  const session=(await query<{id:string}>(`SELECT DISTINCT s.id FROM "TrainingSession" s JOIN "TrainingWeek" w ON w.id=s."weekId" JOIN "SessionBlock" b ON b."sessionId"=s.id JOIN "SessionBlockAssignment" a ON a."sessionBlockId"=b.id WHERE s.id=$1 AND w."clubId"=$2 AND a."athleteId"=$3`,[sessionId,clubId,athleteId])).rows[0];
  if (!session) throw new Error("Séance ou athlète introuvable.");

  if (absent) {
    await query(`INSERT INTO "AthleteSessionAbsence" ("athleteId","sessionId","createdAt") VALUES ($1,$2,NOW()) ON CONFLICT ("athleteId","sessionId") DO NOTHING`,[athleteId,sessionId]);
  } else {
    await query(`DELETE FROM "AthleteSessionAbsence" WHERE "athleteId"=$1 AND "sessionId"=$2`,[athleteId,sessionId]);
  }

  revalidatePath(`/coach/sessions/${sessionId}`);
  revalidatePath(`/coach/athletes/${athleteId}`);
  revalidatePath("/athlete");
  revalidatePath("/athlete/progress");
  revalidatePath("/athlete/profile");
}

export async function deleteTrainingSession(formData: FormData) {
  const { user, clubId } = await requireCoach();
  const sessionId = String(formData.get("sessionId") ?? "");
  const session=(await query<{id:string;title:string}>(`SELECT s.id,s.title FROM "TrainingSession" s JOIN "TrainingWeek" w ON w.id=s."weekId" WHERE s.id=$1 AND w."clubId"=$2`,[sessionId,clubId])).rows[0];

  if (!session) {
    throw new Error("Seance introuvable.");
  }

  await withTransaction(async (tx) => {
    await tx.query(`UPDATE "SessionTemplate" SET "sessionId"=NULL WHERE "sessionId"=$1`,[session.id]);
    await tx.query(`DELETE FROM "AthleteDiveLog" WHERE "sessionId"=$1`,[session.id]);
    await tx.query(`DELETE FROM "AthleteExerciseLog" WHERE "sessionId"=$1`,[session.id]);
    await tx.query(`DELETE FROM "AthleteSessionCompletion" WHERE "sessionId"=$1`,[session.id]);
    await tx.query(`DELETE FROM "AthleteSessionAbsence" WHERE "sessionId"=$1`,[session.id]);
    await tx.query(`DELETE FROM "PoolDive" d USING "PoolSection" p,"PoolTraining" t,"SessionBlock" b WHERE d."poolSectionId"=p.id AND p."poolTrainingId"=t."blockId" AND t."blockId"=b.id AND b."sessionId"=$1`,[session.id]);
    await tx.query(`DELETE FROM "PoolSection" p USING "PoolTraining" t,"SessionBlock" b WHERE p."poolTrainingId"=t."blockId" AND t."blockId"=b.id AND b."sessionId"=$1`,[session.id]);
    await tx.query(`DELETE FROM "PoolTraining" t USING "SessionBlock" b WHERE t."blockId"=b.id AND b."sessionId"=$1`,[session.id]);
    await tx.query(`DELETE FROM "DrylandBlockExercise" d USING "SessionBlock" b WHERE d."blockId"=b.id AND b."sessionId"=$1`,[session.id]);
    await tx.query(`DELETE FROM "SessionBlockAssignment" a USING "SessionBlock" b WHERE a."sessionBlockId"=b.id AND b."sessionId"=$1`,[session.id]);
    await tx.query(`DELETE FROM "SessionBlock" WHERE "sessionId"=$1`,[session.id]);
    await tx.query(`DELETE FROM "TrainingSession" WHERE id=$1`,[session.id]);
  });

  await trackEvent({
    type: "session.deleted",
    message: `Seance supprimee: ${session.title}`,
    clubId,
    userId: user.id,
    metadata: { sessionId: session.id }
  });

  revalidatePath("/coach");
  revalidatePath("/coach/planning");
  revalidatePath("/coach/sessions");
  redirect("/coach/sessions");
}

export async function toggleSessionTemplateFavorite(formData: FormData) {
  const { clubId } = await requireCoach();
  const templateId = String(formData.get("templateId") ?? "");
  const template=(await query<{id:string;favorite:boolean}>(`SELECT id,favorite FROM "SessionTemplate" WHERE id=$1 AND "clubId"=$2`,[templateId,clubId])).rows[0];

  if (!template) {
    throw new Error("Modele introuvable.");
  }

  await query(`UPDATE "SessionTemplate" SET favorite=$1 WHERE id=$2 AND "clubId"=$3`,[!template.favorite,template.id,clubId]);
  revalidatePath("/coach/templates");
  revalidatePath("/coach/library");
}

export async function updateTrainingSession(formData: FormData) {
  const { user, clubId } = await requireCoach();
  const sessionId = String(formData.get("sessionId") ?? "");
  const existing = await getSessionSnapshot(sessionId,clubId);

  if (!existing) {
    throw new Error("Seance introuvable.");
  }

  const [completions,diveLogs,exerciseLogs]=await Promise.all([
    query<{startedAt:Date|null;status:string}>(`SELECT "startedAt",status FROM "AthleteSessionCompletion" WHERE "sessionId"=$1`,[sessionId]),
    query<{id:string}>(`SELECT id FROM "AthleteDiveLog" WHERE "sessionId"=$1 LIMIT 1`,[sessionId]),
    query<{id:string}>(`SELECT id FROM "AthleteExerciseLog" WHERE "sessionId"=$1 LIMIT 1`,[sessionId])
  ]);
  const hasStarted = completions.rows.some((completion) => completion.startedAt || completion.status !== "NOT_STARTED") || diveLogs.rowCount! > 0 || exerciseLogs.rowCount! > 0;

  if (hasStarted) {
    throw new Error("Cette seance a deja ete commencee. Duplique-la pour modifier la planification sans alterer les donnees realisees.");
  }

  const title = String(formData.get("title") ?? "").trim();
  const focus = String(formData.get("focus") ?? existing.focus).trim();
  const duration = Number(formData.get("duration") ?? existing.duration);
  const date = String(formData.get("date") ?? "").trim();
  const status = String(formData.get("status") ?? existing.status) as SessionStatus;

  if (!title || !date || !Object.values(SessionStatus).includes(status) || !Number.isInteger(duration) || duration < 15 || duration > 600) {
    throw new Error("Details de seance invalides.");
  }

  const validAthletes = await query<{id:string}>(`SELECT id FROM "Athlete" WHERE "clubId"=$1 AND active=true`,[clubId]);
  const validAthleteIds = new Set(validAthletes.rows.map((athlete) => athlete.id));
  const includedBlockIds = new Set(formData.getAll("includedBlocks").map(String));
  if (includedBlockIds.size === 0) {
    throw new Error("La seance doit contenir au moins un bloc.");
  }
  const selectedDrylandIds = Array.from(new Set(existing.blocks.flatMap((block) =>
    block.type === BlockType.DRYLAND ? formData.getAll(`exerciseSelection:${block.id}`).map(String) : []
  )));
  const validDrylandExercises = await query<{id:string;defaultSets:number|null;defaultReps:number|null;defaultDuration:number|null}>(`SELECT id,"defaultSets","defaultReps","defaultDuration" FROM "DrylandExercise" WHERE id=ANY($1::text[]) AND "archivedAt" IS NULL`,[selectedDrylandIds]);
  const validDrylandById = new Map(validDrylandExercises.rows.map((exercise) => [exercise.id, exercise]));

  const wasPublished = existing.status === SessionStatus.DRAFT && status === SessionStatus.READY;
  await withTransaction(async (tx) => {
    const updated=await tx.query(`UPDATE "TrainingSession" s SET title=$1,focus=$2,duration=$3,date=$4,notes=$5,status=$6 FROM "TrainingWeek" w WHERE s.id=$7 AND s."weekId"=w.id AND w."clubId"=$8 AND (NOT $9 OR s.status='DRAFT') AND NOT EXISTS (SELECT 1 FROM "AthleteSessionCompletion" c WHERE c."sessionId"=s.id AND (c."startedAt" IS NOT NULL OR c.status<>'NOT_STARTED')) AND NOT EXISTS (SELECT 1 FROM "AthleteDiveLog" l WHERE l."sessionId"=s.id) AND NOT EXISTS (SELECT 1 FROM "AthleteExerciseLog" l WHERE l."sessionId"=s.id)`,[title,focus,Number.isFinite(duration)?duration:existing.duration,parseMontrealDateTimeInput(date),String(formData.get("notes")??"").trim()||null,status,sessionId,clubId,wasPublished]);
    if(!updated.rowCount) throw new Error("Cette seance a deja ete commencee ou est introuvable.");
    await tx.query(`DELETE FROM "SessionBlock" WHERE "sessionId"=$1 AND NOT (id=ANY($2::text[]))`,[sessionId,Array.from(includedBlockIds)]);

    for (const block of existing.blocks) {
      if (!includedBlockIds.has(block.id)) continue;
      const blockTitle = String(formData.get(`blockTitle:${block.id}`) ?? block.title).trim();
      const blockDuration = Number(formData.get(`blockDuration:${block.id}`) ?? block.duration);
      const estimatedVolume = Number(formData.get(`blockVolume:${block.id}`) ?? block.estimatedVolume);
      const blockDescription = String(formData.get(`blockDescription:${block.id}`) ?? block.description ?? "").trim();
      const assignedIds = formData.getAll(`assign:${block.id}`).map(String).filter((id) => validAthleteIds.has(id));

      if (!blockTitle || !Number.isInteger(blockDuration) || blockDuration < 1 || blockDuration > 600 || !Number.isInteger(estimatedVolume) || estimatedVolume < 0 || assignedIds.length === 0) {
        throw new Error(`Le bloc « ${block.title} » est incomplet.`);
      }

      await tx.query(`UPDATE "SessionBlock" SET title=$1,description=$2,duration=$3,"estimatedVolume"=$4 WHERE id=$5 AND "sessionId"=$6`,[blockTitle,blockDescription||null,Number.isFinite(blockDuration)?blockDuration:block.duration,Number.isFinite(estimatedVolume)?estimatedVolume:block.estimatedVolume,block.id,sessionId]);
      await tx.query(`DELETE FROM "SessionBlockAssignment" WHERE "sessionBlockId"=$1`,[block.id]);
      for(const athleteId of assignedIds) await tx.query(`INSERT INTO "SessionBlockAssignment" (id,"sessionBlockId","athleteId") VALUES ($1,$2,$3) ON CONFLICT ("sessionBlockId","athleteId") DO NOTHING`,[randomUUID(),block.id,athleteId]);

      if (block.type === BlockType.DRYLAND) {
        const selectedIds = formData.getAll(`exerciseSelection:${block.id}`).map(String)
          .filter((id) => validDrylandById.has(id));
        if (selectedIds.length === 0) throw new Error(`Le bloc dryland « ${block.title} » doit contenir un exercice.`);
        await tx.query(`DELETE FROM "DrylandBlockExercise" WHERE "blockId"=$1`,[block.id]);
        for(const [order,exerciseId] of selectedIds.entries()) {
          const defaults = validDrylandById.get(exerciseId)!;
          const existingExercise = block.drylandExercises.filter((exercise) => exercise.exerciseId === exerciseId)[order];
          await tx.query(`INSERT INTO "DrylandBlockExercise" ("blockId","exerciseId",sets,reps,duration,notes,"order") VALUES ($1,$2,$3,$4,$5,$6,$7)`,[block.id,exerciseId,existingExercise?nullableNumber(formData.get(`exerciseSets:${block.id}:${existingExercise.order}`)):defaults.defaultSets,existingExercise?nullableNumber(formData.get(`exerciseReps:${block.id}:${existingExercise.order}`)):defaults.defaultReps,existingExercise?nullableNumber(formData.get(`exerciseDuration:${block.id}:${existingExercise.order}`)):defaults.defaultDuration,existingExercise?nullableText(formData.get(`exerciseNotes:${block.id}:${existingExercise.order}`)):null,order]);
        }
      }

      if (block.poolTraining) {
        const rows = parsePoolRows(formData.get(`poolRows:${block.id}`));
        if (rows.length === 0 || rows.some((row) => validatePoolListRow(row).errors.length > 0)) {
          throw new Error(`Le bloc piscine « ${block.title} » contient une ligne invalide.`);
        }
        await tx.query(`DELETE FROM "PoolDive" d USING "PoolSection" s WHERE d."poolSectionId"=s.id AND s."poolTrainingId"=$1`,[block.id]);
        await tx.query(`DELETE FROM "PoolSection" WHERE "poolTrainingId"=$1`,[block.id]);
        for (const [sectionOrder, row] of rows.entries()) {
          const sectionId=randomUUID(); await tx.query(`INSERT INTO "PoolSection" (id,"poolTrainingId",height,label,"order") VALUES ($1,$2,$3,$4,$5)`,[sectionId,block.id,poolHeightFromContext(row.context),row.context,sectionOrder]);
          const repetitions = row.repetitions.length === 1 ? row.diveCodes.map(() => row.repetitions[0]) : row.repetitions;
          for(const [order,diveCode] of row.diveCodes.entries()) await tx.query(`INSERT INTO "PoolDive" (id,"poolSectionId","diveCode","diveName",position,repetitions,"order") VALUES ($1,$2,$3,$3,'Libre',$4,$5)`,[randomUUID(),sectionId,diveCode,repetitions[order],order]);
        }
        await tx.query(`UPDATE "SessionBlock" SET "estimatedVolume"=$1 WHERE id=$2 AND "sessionId"=$3`,[poolRowsVolume(rows),block.id,sessionId]);
      }
    }
    if (wasPublished && isAutomaticSessionPushEnabled()) await saveSessionPublicationTargets(tx, sessionId);
  });

  if (wasPublished) await dispatchSessionPublication(sessionId).catch(() => undefined);

  await trackEvent({
    type: "session.updated",
    message: `Seance modifiee: ${title}`,
    clubId,
    userId: user.id,
    metadata: { sessionId }
  });

  revalidatePath("/coach");
  revalidatePath("/coach/planning");
  revalidatePath("/coach/sessions");
  revalidatePath(`/coach/sessions/${sessionId}`);
  redirect(`/coach/sessions/${sessionId}`);
}

type Tx = import("pg").PoolClient;
type BlockType = SessionBlockType;

async function createBlock(
  tx: Tx,
  data: {
    sessionId: string;
    type: BlockType;
    title: string;
    duration: number;
    position: number;
    estimatedVolume: number;
    athleteIds: string[];
    description?: string;
    competitionEvaluation?: boolean;
  }
) {
  const block=(await tx.query<{id:string}>(`INSERT INTO "SessionBlock" (id,"sessionId",type,title,duration,position,"estimatedVolume",description,"competitionEvaluation") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[randomUUID(),data.sessionId,data.type,data.title,data.duration,data.position,data.estimatedVolume,data.description?.trim()||null,data.competitionEvaluation??false])).rows[0];
  for(const athleteId of data.athleteIds) await tx.query(`INSERT INTO "SessionBlockAssignment" (id,"sessionBlockId","athleteId") VALUES ($1,$2,$3) ON CONFLICT ("sessionBlockId","athleteId") DO NOTHING`,[randomUUID(),block.id,athleteId]);
  return block;
}

async function createPoolBlock(tx: Tx, sessionId: string, data: CreateSessionInput["poolBlocks"][number], position: number) {
  const volume = data.sections.reduce((sum, section) => sum + Math.max(1, countPoolContexts(section.label ?? "")) * section.dives.reduce((sectionSum, dive) => sectionSum + dive.repetitions, 0), 0);
  const block = await createBlock(tx, {
    sessionId,
    type: BlockType.POOL,
    title: data.title,
    duration: data.duration,
    position,
    estimatedVolume: volume,
    athleteIds: data.athleteIds
    ,competitionEvaluation: data.competitionEvaluation
  });

  await tx.query(`INSERT INTO "PoolTraining" ("blockId") VALUES ($1)`,[block.id]);
  for (const [sectionOrder, section] of data.sections.entries()) {
    const createdSectionId=randomUUID();
    await tx.query(`INSERT INTO "PoolSection" (id,"poolTrainingId",height,label,"order") VALUES ($1,$2,$3,$4,$5)`,[createdSectionId,block.id,section.height,section.label,sectionOrder]);
    for(const dive of section.dives) await tx.query(`INSERT INTO "PoolDive" (id,"poolSectionId","diveCode","diveName",position,repetitions,notes,"order") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,[randomUUID(),createdSectionId,dive.diveCode,dive.diveName,dive.position,dive.repetitions,dive.notes,dive.order]);
  }
}

function parsePoolRows(value: FormDataEntryValue | null): PoolListRow[] {
  let payload: unknown;
  try {
    payload = JSON.parse(String(value ?? "[]"));
  } catch {
    throw new Error("La liste de plongeons est illisible.");
  }
  const parsed = poolRowsEditSchema.safeParse(payload);
  if (!parsed.success || parsed.data.some((row) => validatePoolListRow(row).errors.length > 0)) {
    throw new Error("Chaque ligne piscine doit contenir une hauteur, des plongeons et des repetitions correspondantes.");
  }
  return parsed.data;
}

function poolRowsVolume(rows: PoolListRow[]) {
  return rows.reduce((sum, row) => sum + validatePoolListRow(row).total, 0);
}

function poolHeightFromContext(context: string): SessionPoolHeight {
  const normalized = context.trim().toLowerCase().replace(/\s+/g, "");
  if (countPoolContexts(context) > 1) return PoolHeight.CUSTOM;
  if (normalized.startsWith("1m")) return PoolHeight.ONE_METER;
  if (normalized.startsWith("3m")) return PoolHeight.THREE_METER;
  if (normalized.includes("plateforme")) return PoolHeight.PLATFORM;
  return PoolHeight.CUSTOM;
}

function nullableNumber(value: FormDataEntryValue | null) {
  const number = Number(value);
  return Number.isFinite(number) && String(value ?? "").trim() !== "" ? number : null;
}

function nullableText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || null;
}
