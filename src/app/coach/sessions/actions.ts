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
import { dispatchSessionCancellation, dispatchSessionPublication, dispatchSessionUpdate, isAutomaticSessionPushEnabled, saveSessionCancellationTargets, saveSessionPublicationTargets, saveSessionUpdateTargets } from "@/lib/web-push";
import { completeSessionIfAllAthletesAreDone } from "@/lib/session-status";
import { replaceSessionStructure, type SessionStructureBlock } from "@/lib/session-structure";

const sessionInputSchema = z.object({
  title: z.string(),
  date: z.string().min(10),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  groupId: z.string().min(1),
  duration: z.number().int().min(15).max(600),
  notes: z.string().optional(),
  coachAthleteNotes: z.record(z.string(), z.string().max(2000)).default({}),
  evaluationPlacement: z.string().default("none"),
  planningEventId: z.string().optional(),
  templateId: z.string().optional(),
  status: z.nativeEnum(SessionStatus).default(SessionStatus.READY).refine((status) => status === SessionStatus.DRAFT || status === SessionStatus.READY),
  warmup: z.object({
    enabled: z.boolean(),
    competitionEvaluation: z.boolean().default(false),
    title: z.string().trim(),
    duration: z.number().int(),
    description: z.string().optional()
  }),
  cooldown: z.object({
    enabled: z.boolean(),
    competitionEvaluation: z.boolean().default(false),
    title: z.string().trim(),
    duration: z.number().int(),
    description: z.string().optional()
  }),
  drylandBlocks: z.array(z.object({
    competitionEvaluation: z.boolean().default(false),
    title: z.string().trim(),
    duration: z.number().int(),
    exerciseIds: z.array(z.string()),
    athleteIds: z.array(z.string()),
    exerciseOverrides: z.record(z.string(), z.object({
      sets: z.number().int().nullable(),
      reps: z.number().int().nullable(),
      duration: z.number().int().nullable(),
      notes: z.string().nullable()
    })).default({})
  })).default([]),
  poolBlocks: z.array(z.object({
    competitionEvaluation: z.boolean().default(false),
    title: z.string(),
    duration: z.number().int(),
    athleteIds: z.array(z.string()).default([]),
    sections: z.array(z.object({
      height: z.nativeEnum(PoolHeight),
      label: z.string().nullable(),
      dives: z.array(z.object({
        diveCode: z.string(),
        diveName: z.string(),
        position: z.string(),
        repetitions: z.number().int(),
        notes: z.string().nullable(),
        order: z.number()
    }))
    }))
  })).default([])
});

export type CreateSessionInput = z.infer<typeof sessionInputSchema>;

const quickExerciseSchema = z.object({
  name: z.string().trim().min(2),
  category: z.string().trim().min(2).default("Custom"),
  equipment: z.string().trim().optional(),
  level: z.string().trim().optional(),
  description: z.string().trim().optional(),
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
    `INSERT INTO "DrylandExercise" (id,name,category,description,equipment,level,"defaultSets","defaultReps","defaultDuration","roundTrip",tags,"createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW()) RETURNING id,name,category,"defaultSets","defaultReps","defaultDuration","roundTrip",equipment,tags`,
    [randomUUID(),data.name,data.category||"Custom",data.description?.trim()||`Exercice: ${data.name}`,data.equipment?.trim()||null,data.level?.trim()||null,data.defaultSets??null,data.roundTrip?null:data.defaultReps??null,data.roundTrip?null:data.defaultDuration??null,data.roundTrip,Array.from(new Set(data.tags.map(tag=>tag.toLowerCase())))]
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
  if (!data.templateId) validateSessionForPublication(data);
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
    redirect(`/coach/sessions/${session.id}?notice=session-created`);
  }

  const poolAthleteIds = data.poolBlocks.flatMap((block) => block.athleteIds);
  const requestedAthleteIds = Array.from(new Set([...data.drylandBlocks.flatMap((block) => block.athleteIds), ...poolAthleteIds]));
  const [athletes, exercises] = await Promise.all([
    query<{id:string}>(`SELECT id FROM "Athlete" WHERE "clubId"=$1 AND active=true AND "groupId"=$2`,[clubId,data.groupId]),
    query<{id:string;defaultSets:number|null;defaultReps:number|null;defaultDuration:number|null;roundTrip:boolean}>(`SELECT id,"defaultSets","defaultReps","defaultDuration","roundTrip" FROM "DrylandExercise" WHERE id=ANY($1::text[]) AND "archivedAt" IS NULL`,[data.drylandBlocks.flatMap((block) => block.exerciseIds)])
  ]);

  const validAthleteIds = new Set(athletes.rows.map((athlete) => athlete.id));
  const allAthleteIds = requestedAthleteIds.length > 0
    ? requestedAthleteIds.filter((id) => validAthleteIds.has(id))
    : Array.from(validAthleteIds);
  const { drylandBlocks, poolBlocks } = prepareSessionBuilderBlocks(data, validAthleteIds, exercises.rows);
  const structureBlocks = buildSessionStructureBlocks(data, drylandBlocks, poolBlocks, allAthleteIds);

  validateSessionReferencesForPublication(data, allAthleteIds, drylandBlocks, poolBlocks);

  const weekStart = startOfMontrealWeek(sessionDate);
  const session = await withTransaction(async (tx) => {
    const found=(await tx.query<{id:string}>(`SELECT id FROM "TrainingWeek" WHERE "clubId"=$1 AND "groupId"=$2 AND "startDate"=$3 LIMIT 1`,[clubId,data.groupId,weekStart])).rows[0];
    const weekId=found?.id??randomUUID();
    if(!found) await tx.query(`INSERT INTO "TrainingWeek" (id,"clubId","groupId","startDate",title,status) VALUES ($1,$2,$3,$4,$5,$6)`,[weekId,clubId,data.groupId,weekStart,`Semaine du ${formatMontrealDate(weekStart)}`,WeekStatus.PUBLISHED]);
    const createdSession=(await tx.query<{id:string;title:string}>(`INSERT INTO "TrainingSession" (id,date,title,duration,notes,"weekId","coachId",status,"competitionEvaluationAtStart","planningEventId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,title`,[randomUUID(),sessionDate,data.title.trim(),data.duration,data.notes?.trim()||null,weekId,coach.id,data.status,data.evaluationPlacement === "start",planningEvent?.id??null])).rows[0];

    await replaceSessionStructure(tx, createdSession.id, structureBlocks);

    const assignedPoolAthletes = new Set(poolBlocks.flatMap((block) => block.athleteIds));
    for (const [athleteId, note] of Object.entries(data.coachAthleteNotes)) {
      const trimmedNote = note.trim();
      if (trimmedNote && assignedPoolAthletes.has(athleteId) && validAthleteIds.has(athleteId)) {
        await tx.query(`INSERT INTO "CoachAthleteSessionNote" ("sessionId","athleteId",note,"updatedAt") VALUES ($1,$2,$3,NOW()) ON CONFLICT ("sessionId","athleteId") DO UPDATE SET note=EXCLUDED.note,"updatedAt"=NOW()`, [createdSession.id, athleteId, trimmedNote]);
      }
    }

    if (data.status === SessionStatus.READY && isAutomaticSessionPushEnabled()) await saveSessionPublicationTargets(tx, createdSession.id);

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
  redirect(`/coach/sessions/${session.id}?notice=session-created`);
}

export async function updateDraftSessionFromBuilder(sessionId: string, input: CreateSessionInput) {
  const { user, clubId } = await requireCoach();
  let data = sessionInputSchema.parse(input);
  const existing = await getSessionSnapshot(sessionId, clubId);
  if (!existing || (existing.status !== SessionStatus.DRAFT && existing.status !== SessionStatus.READY)) throw new Error("Séance introuvable ou déjà démarrée pour ce club.");
  if (existing.status === SessionStatus.READY) data = { ...data, status: SessionStatus.READY };
  validateSessionForPublication(data);
  const activity = await query<{ started: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM "AthleteSessionCompletion" WHERE "sessionId"=$1 AND ("startedAt" IS NOT NULL OR status<>'NOT_STARTED')) OR EXISTS (SELECT 1 FROM "AthleteDiveLog" WHERE "sessionId"=$1) OR EXISTS (SELECT 1 FROM "AthleteExerciseLog" WHERE "sessionId"=$1) AS started`,
    [sessionId]
  );
  if (activity.rows[0]?.started) throw new Error("Cette séance a déjà commencé et ne peut plus être modifiée.");

  const group = (await query<{ id: string }>(`SELECT id FROM "TrainingGroup" WHERE id=$1 AND "clubId"=$2`, [data.groupId, clubId])).rows[0];
  if (!group) throw new Error("Groupe introuvable pour ce club.");
  const planningEvent = data.planningEventId
    ? (await query<{ id: string; startsAt: Date }>(`SELECT id,"startsAt" FROM "PlanningEvent" WHERE id=$1 AND "clubId"=$2 AND ("groupId"=$3 OR "groupId" IS NULL) AND type='TRAINING_SCHEDULE'`, [data.planningEventId, clubId, data.groupId])).rows[0] ?? null
    : null;
  if (data.planningEventId && !planningEvent) throw new Error("Horaire d'entraînement introuvable pour ce groupe.");
  if (planningEvent && toMontrealDateInputValue(planningEvent.startsAt) !== data.date) throw new Error("L'horaire sélectionné ne correspond pas à la date de la séance.");
  const sessionDate = planningEvent?.startsAt ?? parseMontrealDateTimeInput(`${data.date}T${data.time}`);
  const athletes = await query<{ id: string }>(`SELECT id FROM "Athlete" WHERE "clubId"=$1 AND active=true AND "groupId"=$2`, [clubId, data.groupId]);
  const validAthleteIds = new Set(athletes.rows.map((athlete) => athlete.id));
  const allAthleteIds = Array.from(validAthleteIds);
  const drylandIds = data.drylandBlocks.flatMap((block) => block.exerciseIds);
  const exercises = await query<{ id: string; defaultSets: number | null; defaultReps: number | null; defaultDuration: number | null; roundTrip: boolean }>(
    `SELECT id,"defaultSets","defaultReps","defaultDuration","roundTrip" FROM "DrylandExercise" WHERE id=ANY($1::text[]) AND "archivedAt" IS NULL`, [drylandIds]
  );
  const { drylandBlocks, poolBlocks } = prepareSessionBuilderBlocks(data, validAthleteIds, exercises.rows);
  const structureBlocks = buildSessionStructureBlocks(data, drylandBlocks, poolBlocks, allAthleteIds);
  validateSessionReferencesForPublication(data, allAthleteIds, drylandBlocks, poolBlocks);
  const weekStart = startOfMontrealWeek(sessionDate);
  const isPublishing = existing.status === SessionStatus.DRAFT && data.status === SessionStatus.READY;
  const isPublishedUpdate = existing.status === SessionStatus.READY && data.status === SessionStatus.READY;
  const updateId = randomUUID();
  const updated = await withTransaction(async (tx) => {
    if (isPublishedUpdate && isAutomaticSessionPushEnabled()) await saveSessionUpdateTargets(tx, sessionId, updateId);
    const found = (await tx.query<{ id: string }>(`SELECT id FROM "TrainingWeek" WHERE "clubId"=$1 AND "groupId"=$2 AND "startDate"=$3 LIMIT 1`, [clubId, data.groupId, weekStart])).rows[0];
    const weekId = found?.id ?? randomUUID();
    if (!found) await tx.query(`INSERT INTO "TrainingWeek" (id,"clubId","groupId","startDate",title,status) VALUES ($1,$2,$3,$4,$5,$6)`, [weekId, clubId, data.groupId, weekStart, `Semaine du ${formatMontrealDate(weekStart)}`, WeekStatus.PUBLISHED]);
    await tx.query(`UPDATE "TrainingSession" SET date=$1,title=$2,duration=$3,notes=$4,"weekId"=$5,status=$6,"competitionEvaluationAtStart"=$7,"planningEventId"=$8 WHERE id=$9`, [sessionDate, data.title.trim(), data.duration, data.notes?.trim() || null, weekId, data.status, data.evaluationPlacement === "start", planningEvent?.id ?? null, sessionId]);
    await replaceSessionStructure(tx, sessionId, structureBlocks);
    await tx.query(`DELETE FROM "CoachAthleteSessionNote" WHERE "sessionId"=$1`, [sessionId]);
    const assignedPoolAthletes = new Set(data.poolBlocks.flatMap((block) => block.athleteIds).filter((id) => validAthleteIds.has(id)));
    for (const [athleteId, note] of Object.entries(data.coachAthleteNotes)) {
      const trimmedNote = note.trim();
      if (trimmedNote && assignedPoolAthletes.has(athleteId)) {
        await tx.query(`INSERT INTO "CoachAthleteSessionNote" ("sessionId","athleteId",note,"updatedAt") VALUES ($1,$2,$3,NOW())`, [sessionId, athleteId, trimmedNote]);
      }
    }
    if (isPublishing && isAutomaticSessionPushEnabled()) await saveSessionPublicationTargets(tx, sessionId);
    if (isPublishedUpdate && isAutomaticSessionPushEnabled()) await saveSessionUpdateTargets(tx, sessionId, updateId);
    return { id: sessionId, title: data.title.trim() };
  });
  if (isPublishing) await dispatchSessionPublication(sessionId).catch(() => undefined);
  if (isPublishedUpdate) await dispatchSessionUpdate(sessionId, updateId).catch(() => undefined);
  await trackEvent({ type: "session.updated", message: `Séance modifiée: ${updated.title}`, clubId, userId: user.id, metadata: { sessionId } });
  revalidatePath("/coach");
  revalidatePath("/coach/planning");
  revalidatePath("/coach/sessions");
  revalidatePath(`/coach/sessions/${sessionId}`);
  revalidatePath("/athlete");
  revalidatePath("/athlete/calendar");
  revalidatePath("/athlete/week");
  revalidatePath(`/athlete/session/${sessionId}`);
  redirect(`/coach/sessions/${sessionId}?notice=session-updated`);
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
  const source = await getSessionSnapshot(sessionId, clubId);

  if (!source) {
    throw new Error("Seance introuvable.");
  }

  if (!name) {
    throw new Error("Le nom du modele est requis.");
  }

  const payload = buildSessionTemplatePayload(source);
  const poolAthleteIds = Array.from(new Set(payload.blocks.filter((block) => block.type === "POOL").flatMap((block) => block.athleteIds)));
  const poolAthletes = poolAthleteIds.length > 0
    ? await query<{ id: string; firstName: string; lastName: string }>(`SELECT a.id,u."firstName",u."lastName" FROM "Athlete" a JOIN "User" u ON u.id=a."userId" WHERE a.id=ANY($1::text[])`, [poolAthleteIds])
    : { rows: [] as { id: string; firstName: string; lastName: string }[] };
  const athleteNames = new Map(poolAthletes.rows.map((athlete) => [athlete.id, `${athlete.firstName} ${athlete.lastName}`.trim()]));
  let position = 0;
  payload.blocks = payload.blocks.flatMap((block) => {
    const poolVariants = block.type === "POOL" && block.athleteIds.length > 0
      ? block.athleteIds.map((athleteId) => ({ athleteId, title: `Piscine - ${athleteNames.get(athleteId) ?? "Athlète"}` }))
      : [null];
    return poolVariants.map((variant) => ({
      ...block,
      title: variant?.title ?? block.title,
      position: position++,
      athleteIds: variant ? [variant.athleteId] : block.athleteIds,
      estimatedVolume: 0,
      drylandExercises: [],
      poolTraining: null
    }));
  });
  const template=(await query<{id:string;name:string}>(`INSERT INTO "SessionTemplate" (id,name,category,"sessionId","clubId",favorite,payload) VALUES ($1,$2,'Séance',$3,$4,false,$5::jsonb) RETURNING id,name`,[randomUUID(),name,source.id,clubId,JSON.stringify(payload)])).rows[0];

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

export async function saveSessionStructureTemplate(formData: FormData) {
  const { user, clubId } = await requireCoach();
  const name = String(formData.get("name") ?? "").trim();
  let payload: unknown;
  try {
    payload = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    throw new Error("Le modèle de séance est invalide.");
  }
  const parsed = parseSessionTemplatePayload(payload);
  if (!name) throw new Error("Donne un nom au modèle.");
  const structureOnly = {
    ...parsed,
    blocks: parsed.blocks.map((block) => ({ ...block, estimatedVolume: 0, drylandExercises: [], poolTraining: null }))
  };
  const template = (await query<{ id: string }>(
    `INSERT INTO "SessionTemplate" (id,name,category,"clubId",favorite,payload) VALUES ($1,$2,'Séance',$3,false,$4::jsonb) RETURNING id`,
    [randomUUID(), name, clubId, JSON.stringify(structureOnly)]
  )).rows[0];
  await trackEvent({ type: "session_template.created", message: `Modèle de séance créé: ${name}`, clubId, userId: user.id, metadata: { templateId: template.id } });
  revalidatePath("/coach/templates");
  revalidatePath("/coach/library");
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
  if (!name || !block.title || !Number.isFinite(block.duration) || !Array.isArray(block.exercises) || block.exercises.length === 0) {
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

export async function savePoolBlockAsTemplate(formData: FormData) {
  const { user, clubId } = await requireCoach();
  const name = String(formData.get("name") ?? "").trim();
  let rawBlock: unknown;
  try {
    rawBlock = JSON.parse(String(formData.get("block") ?? ""));
  } catch {
    throw new Error("Bloc piscine invalide.");
  }
  const blockSchema = z.object({
    title: z.string().trim().min(2),
    duration: z.number().int().min(1),
    sections: z.array(z.object({
      height: z.enum(["ONE_METER", "THREE_METER", "PLATFORM", "CUSTOM"]),
      label: z.string().nullable(),
      dives: z.array(z.object({ diveCode: z.string(), diveName: z.string(), position: z.string(), repetitions: z.number().int().min(0), notes: z.string().nullable(), order: z.number().int().min(0) }))
    }))
  });
  const parsedBlock = blockSchema.safeParse(rawBlock);
  if (!name || !parsedBlock.success) {
    throw new Error("Donne un nom au modèle et vérifie le bloc piscine.");
  }
  const block = parsedBlock.data;
  const volume = block.sections.reduce((sum, section) => sum + section.dives.reduce((diveSum, dive) => diveSum + dive.repetitions, 0), 0);
  const payload = {
    version: 1,
    competitionEvaluationAtStart: false,
    title: name,
    duration: block.duration,
    notes: null,
    blocks: [{
      type: "POOL",
      title: block.title,
      description: null,
      duration: block.duration,
      position: 0,
      estimatedVolume: volume,
      competitionEvaluation: false,
      athleteIds: [],
      drylandExercises: [],
      poolTraining: { sections: block.sections }
    }]
  };
  parseSessionTemplatePayload(payload);
  await query(`INSERT INTO "SessionTemplate" (id,name,category,"clubId",favorite,payload) VALUES ($1,$2,'Piscine',$3,false,$4::jsonb)`, [randomUUID(), name, clubId, JSON.stringify(payload)]);
  await trackEvent({ type: "session_template.created", message: `Modèle piscine créé: ${name}`, clubId, userId: user.id });
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

export async function cancelTrainingSession(formData: FormData) {
  const { user, clubId } = await requireCoach();
  const sessionId = String(formData.get("sessionId") ?? "");
  const session = await withTransaction(async (tx) => {
    const result = await tx.query<{ id: string; title: string }>(
      `UPDATE "TrainingSession" s SET status=$1
       FROM "TrainingWeek" w
       WHERE s.id=$2 AND w.id=s."weekId" AND w."clubId"=$3 AND s.status=$4
       RETURNING s.id,s.title`,
      [SessionStatus.CANCELLED, sessionId, clubId, SessionStatus.READY]
    );
    if (!result.rowCount) throw new Error("Séance publiée introuvable ou déjà annulée.");
    await tx.query(`UPDATE "PlanningEvent" SET "cancelledAt"=NOW() WHERE id=(SELECT "planningEventId" FROM "TrainingSession" WHERE id=$1) AND type='TRAINING_SCHEDULE'`, [sessionId]);
    await saveSessionCancellationTargets(tx, sessionId);
    return result.rows[0];
  });
  await dispatchSessionCancellation(session.id).catch(() => undefined);
  await trackEvent({ type: "session.cancelled", message: `Entraînement annulé: ${session.title}`, clubId, userId: user.id, metadata: { sessionId: session.id } });
  revalidatePath("/coach");
  revalidatePath("/coach/planning");
  revalidatePath("/coach/sessions");
  revalidatePath(`/coach/sessions/${session.id}`);
  revalidatePath("/athlete");
  revalidatePath("/athlete/calendar");
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

export async function startTrainingSession(formData: FormData) {
  const { user, clubId } = await requireCoach();
  const sessionId = String(formData.get("sessionId") ?? "");
  const result = await query<{ id: string; title: string }>(
    `UPDATE "TrainingSession" s SET status='IN_PROGRESS' FROM "TrainingWeek" w
     WHERE s.id=$1 AND s."weekId"=w.id AND w."clubId"=$2 AND s.status='READY'
     RETURNING s.id,s.title`, [sessionId, clubId]
  );
  const session = result.rows[0];
  if (!session) throw new Error("Séance publiée introuvable ou déjà démarrée.");
  await trackEvent({ type: "session.started", message: `Séance démarrée: ${session.title}`, clubId, userId: user.id, metadata: { sessionId } });
  revalidatePath("/coach");
  revalidatePath("/coach/planning");
  revalidatePath("/coach/sessions");
  revalidatePath(`/coach/sessions/${sessionId}`);
  revalidatePath("/athlete");
}

export async function updateCompletedSessionSummary(formData: FormData) {
  const { user, clubId } = await requireCoach();
  const sessionId = String(formData.get("sessionId") ?? "");
  const summary = String(formData.get("summary") ?? "").trim().slice(0, 5000);
  const updated = await query<{ id: string; title: string }>(
    `UPDATE "TrainingSession" s SET notes=$1 FROM "TrainingWeek" w WHERE s.id=$2 AND s."weekId"=w.id AND w."clubId"=$3 AND s.status='COMPLETED' RETURNING s.id,s.title`,
    [summary || null, sessionId, clubId]
  );
  const session = updated.rows[0];
  if (!session) throw new Error("Séance terminée introuvable pour ce club.");
  await trackEvent({ type: "session.summary_updated", message: `Résumé de séance mis à jour: ${session.title}`, clubId, userId: user.id, metadata: { sessionId: session.id } });
  revalidatePath(`/coach/sessions/${session.id}`);
  revalidatePath(`/coach/sessions/${session.id}/edit`);
}

export async function saveCompletedSessionCoachNote(formData: FormData) {
  const { user, clubId } = await requireCoach();
  const sessionId = String(formData.get("sessionId") ?? "");
  const athleteId = String(formData.get("athleteId") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 2000);
  if (!note) throw new Error("La note ne peut pas être vide.");
  const session = (await query<{ id: string; title: string }>(
    `SELECT DISTINCT s.id,s.title FROM "TrainingSession" s JOIN "TrainingWeek" w ON w.id=s."weekId" JOIN "SessionBlock" b ON b."sessionId"=s.id JOIN "SessionBlockAssignment" a ON a."sessionBlockId"=b.id WHERE s.id=$1 AND w."clubId"=$2 AND s.status='COMPLETED' AND a."athleteId"=$3`,
    [sessionId, clubId, athleteId]
  )).rows[0];
  if (!session) throw new Error("Séance ou athlète introuvable pour ce club.");
  await query(`INSERT INTO "CoachAthleteSessionNote" ("sessionId","athleteId",note,"updatedAt") VALUES ($1,$2,$3,NOW()) ON CONFLICT ("sessionId","athleteId") DO UPDATE SET note=EXCLUDED.note,"updatedAt"=NOW()`, [session.id, athleteId, note]);
  await trackEvent({ type: "session.coach_note_saved", message: `Note coach mise à jour: ${session.title}`, clubId, userId: user.id, metadata: { sessionId, athleteId } });
  revalidatePath(`/coach/sessions/${session.id}`);
}

export async function markAthleteSessionCompleted(formData: FormData) {
  const { user, clubId } = await requireCoach();
  const sessionId = String(formData.get("sessionId") ?? "");
  const athleteId = String(formData.get("athleteId") ?? "");
  const session=(await query<{id:string;title:string}>(`SELECT DISTINCT s.id,s.title FROM "TrainingSession" s JOIN "TrainingWeek" w ON w.id=s."weekId" JOIN "SessionBlock" b ON b."sessionId"=s.id JOIN "SessionBlockAssignment" a ON a."sessionBlockId"=b.id WHERE s.id=$1 AND w."clubId"=$2 AND a."athleteId"=$3`,[sessionId,clubId,athleteId])).rows[0];
  if (!session) throw new Error("Séance ou athlète introuvable.");

  const completedAt = new Date();
  await withTransaction(async (tx) => {
    await tx.query(`INSERT INTO "AthleteSessionCompletion" ("athleteId","sessionId","startedAt","completedAt",status) VALUES ($1,$2,$3,$3,'COMPLETED') ON CONFLICT ("athleteId","sessionId") DO UPDATE SET "completedAt"=EXCLUDED."completedAt",status='COMPLETED'`,[athleteId,sessionId,completedAt]);
    await completeSessionIfAllAthletesAreDone(tx, sessionId);
  });

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

export async function finishTrainingSession(formData: FormData) {
  const { user, clubId } = await requireCoach();
  const sessionId = String(formData.get("sessionId") ?? "");
  const session = (await query<{ id: string; title: string }>(
    `SELECT s.id,s.title FROM "TrainingSession" s JOIN "TrainingWeek" w ON w.id=s."weekId"
     WHERE s.id=$1 AND w."clubId"=$2 AND s.status='IN_PROGRESS'`, [sessionId, clubId]
  )).rows[0];
  if (!session) throw new Error("Séance en cours introuvable pour ce club.");
  const completedAt = new Date();
  await withTransaction(async (tx) => {
    await tx.query(`UPDATE "TrainingSession" SET status='COMPLETED' WHERE id=$1 AND status='IN_PROGRESS'`, [sessionId]);
    await tx.query(
      `INSERT INTO "AthleteSessionCompletion" ("athleteId","sessionId","startedAt","completedAt",status)
       SELECT DISTINCT a."athleteId",s.id,s.date,
         CASE WHEN absence."athleteId" IS NULL THEN $2::timestamp ELSE NULL::timestamp END,
         CASE WHEN absence."athleteId" IS NULL THEN 'COMPLETED'::"CompletionStatus" ELSE 'SKIPPED'::"CompletionStatus" END
       FROM "SessionBlockAssignment" a JOIN "SessionBlock" b ON b.id=a."sessionBlockId"
       JOIN "TrainingSession" s ON s.id=b."sessionId"
       LEFT JOIN "AthleteSessionAbsence" absence ON absence."sessionId"=s.id AND absence."athleteId"=a."athleteId"
       WHERE s.id=$1
       ON CONFLICT ("athleteId","sessionId") DO UPDATE SET
         "startedAt"=COALESCE("AthleteSessionCompletion"."startedAt",EXCLUDED."startedAt"),
         "completedAt"=EXCLUDED."completedAt",status=EXCLUDED.status`, [sessionId, completedAt]
    );
  });
  await trackEvent({ type: "session.completed", message: `Séance terminée manuellement par le coach: ${session.title}`, clubId, userId: user.id, metadata: { sessionId, completedByCoach: true } });
  revalidatePath("/coach");
  revalidatePath("/coach/sessions");
  revalidatePath(`/coach/sessions/${sessionId}`);
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
    const diveWrites: Array<{ dive: typeof updates[number]; targetSectionId: string; plannedRepetitions: number; postSessionChange: boolean }> = [];
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
        diveWrites.push({ dive, targetSectionId, plannedRepetitions, postSessionChange });
        nextVolume += Math.max(1, countPoolContexts(context)) * plannedRepetitions;
      }
    }
    await tx.query(
      `UPDATE "PoolDive" d
       SET "poolSectionId"=u."poolSectionId","diveCode"=u."diveCode","diveName"=u."diveCode",repetitions=u.repetitions,
           "postSessionModified"=d."postSessionModified" OR u."postSessionChange"
       FROM unnest($1::text[],$2::text[],$3::text[],$4::int[],$5::boolean[]) AS u(id,"poolSectionId","diveCode",repetitions,"postSessionChange")
       WHERE d.id=u.id`,
      [diveWrites.map(({ dive }) => dive.id), diveWrites.map(({ targetSectionId }) => targetSectionId), diveWrites.map(({ dive }) => dive.diveCode), diveWrites.map(({ plannedRepetitions }) => plannedRepetitions), diveWrites.map(({ postSessionChange }) => postSessionChange)]
    );
    const actualCorrections = section.hasCompleted ? diveWrites.filter(({ dive }) => dive.repetitions !== dive.originalRepetitions) : [];
    if (actualCorrections.length > 0) {
      // In a completed session, keep the plan intact and save realized repetitions for every completed assignee.
      await tx.query(
        `INSERT INTO "AthleteDiveLog" (id,"athleteId","sessionId","poolDiveId","actualDiveCode","repetitionsCompleted","goldenRepetitions",rating)
         SELECT gen_random_uuid()::text,a."athleteId",$1,u."poolDiveId",u."diveCode",u.repetitions,0,'Coach'
         FROM "SessionBlockAssignment" a
         JOIN "AthleteSessionCompletion" c ON c."athleteId"=a."athleteId" AND c."sessionId"=$1 AND c.status='COMPLETED'
         CROSS JOIN unnest($3::text[],$4::int[],$5::text[]) AS u("poolDiveId",repetitions,"diveCode")
         WHERE a."sessionBlockId"=$2
         ON CONFLICT ("athleteId","sessionId","poolDiveId")
         DO UPDATE SET "actualDiveCode"=COALESCE("AthleteDiveLog"."actualDiveCode",EXCLUDED."actualDiveCode"),"repetitionsCompleted"=EXCLUDED."repetitionsCompleted"`,
        [sessionId, section.blockId, actualCorrections.map(({ dive }) => dive.id), actualCorrections.map(({ dive }) => dive.repetitions), actualCorrections.map(({ dive }) => dive.diveCode)]
      );
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
  if (absent) await withTransaction(async (tx) => completeSessionIfAllAthletesAreDone(tx, sessionId));

  revalidatePath(`/coach/sessions/${sessionId}`);
  revalidatePath(`/coach/athletes/${athleteId}`);
  revalidatePath("/athlete");
  revalidatePath("/athlete/progress");
  revalidatePath("/athlete/profile");
}

export async function saveSessionAttendance(formData: FormData) {
  const { clubId } = await requireCoach();
  const sessionId = String(formData.get("sessionId") ?? "");
  const absentAthleteIds = [...new Set(formData.getAll("absentAthleteIds").map(String).filter(Boolean))];
  const assignedAthletes = (await query<{ athleteId: string }>(`SELECT DISTINCT a."athleteId" FROM "SessionBlockAssignment" a JOIN "SessionBlock" b ON b.id=a."sessionBlockId" JOIN "TrainingSession" s ON s.id=b."sessionId" JOIN "TrainingWeek" w ON w.id=s."weekId" WHERE s.id=$1 AND w."clubId"=$2`, [sessionId, clubId])).rows;
  const assignedIds = assignedAthletes.map(({ athleteId }) => athleteId);
  if (!assignedIds.length || absentAthleteIds.some((athleteId) => !assignedIds.includes(athleteId))) throw new Error("Séance ou athlète introuvable.");

  await withTransaction(async (tx) => {
    await tx.query(`DELETE FROM "AthleteSessionAbsence" WHERE "sessionId"=$1 AND "athleteId"=ANY($2::text[])`, [sessionId, assignedIds]);
    if (absentAthleteIds.length) {
      await tx.query(`INSERT INTO "AthleteSessionAbsence" ("athleteId","sessionId","createdAt") SELECT absent_ids."athleteId",$1,NOW() FROM unnest($2::text[]) AS absent_ids("athleteId") ON CONFLICT ("athleteId","sessionId") DO NOTHING`, [sessionId, absentAthleteIds]);
      await completeSessionIfAllAthletesAreDone(tx, sessionId);
    }
  });

  revalidatePath(`/coach/sessions/${sessionId}`);
  revalidatePath("/coach/athletes");
  revalidatePath("/coach/athletes/[id]", "page");
  revalidatePath(`/athlete/session/${sessionId}`);
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
  redirect("/coach/sessions?notice=session-deleted");
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
    query<{started:boolean}>(`SELECT EXISTS (SELECT 1 FROM "AthleteSessionCompletion" WHERE "sessionId"=$1 AND ("startedAt" IS NOT NULL OR status<>'NOT_STARTED')) AS started`,[sessionId]),
    query<{id:string}>(`SELECT id FROM "AthleteDiveLog" WHERE "sessionId"=$1 LIMIT 1`,[sessionId]),
    query<{id:string}>(`SELECT id FROM "AthleteExerciseLog" WHERE "sessionId"=$1 LIMIT 1`,[sessionId])
  ]);
  const hasStarted = completions.rows[0]?.started || diveLogs.rowCount! > 0 || exerciseLogs.rowCount! > 0;

  if (hasStarted) {
    throw new Error("Cette seance a deja ete commencee. Duplique-la pour modifier la planification sans alterer les donnees realisees.");
  }

  const title = String(formData.get("title") ?? "").trim();
  const duration = Number(formData.get("duration") ?? existing.duration);
  const date = String(formData.get("date") ?? "").trim();
  const status = String(formData.get("status") ?? existing.status) as SessionStatus;

  if (!title || !date || !Object.values(SessionStatus).includes(status) || !Number.isInteger(duration) || duration < 15 || duration > 600) {
    throw new Error("Details de seance invalides.");
  }

  const validAthletes = await query<{id:string}>(`SELECT id FROM "Athlete" WHERE "clubId"=$1 AND "groupId"=$2 AND active=true`,[clubId,existing.week.groupId]);
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
  const isPublishedUpdate = existing.status === SessionStatus.READY && status === SessionStatus.READY;
  const updateId = randomUUID();
  await withTransaction(async (tx) => {
    if (isPublishedUpdate && isAutomaticSessionPushEnabled()) await saveSessionUpdateTargets(tx, sessionId, updateId);
    const updated=await tx.query(`UPDATE "TrainingSession" s SET title=$1,duration=$2,date=$3,notes=$4,status=$5 FROM "TrainingWeek" w WHERE s.id=$6 AND s."weekId"=w.id AND w."clubId"=$7 AND (NOT $8 OR s.status='DRAFT') AND NOT EXISTS (SELECT 1 FROM "AthleteSessionCompletion" c WHERE c."sessionId"=s.id AND (c."startedAt" IS NOT NULL OR c.status<>'NOT_STARTED')) AND NOT EXISTS (SELECT 1 FROM "AthleteDiveLog" l WHERE l."sessionId"=s.id) AND NOT EXISTS (SELECT 1 FROM "AthleteExerciseLog" l WHERE l."sessionId"=s.id)`,[title,Number.isFinite(duration)?duration:existing.duration,parseMontrealDateTimeInput(date),String(formData.get("notes")??"").trim()||null,status,sessionId,clubId,wasPublished]);
    if(!updated.rowCount) throw new Error("Cette seance a deja ete commencee ou est introuvable.");
    if (existing.planningEventId) {
      await tx.query(`UPDATE "PlanningEvent" SET "startsAt"=$1,duration=$2 WHERE id=$3 AND "clubId"=$4 AND type='TRAINING_SCHEDULE' AND "cancelledAt" IS NULL`, [parseMontrealDateTimeInput(date), Number.isFinite(duration) ? duration : existing.duration, existing.planningEventId, clubId]);
    }
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
      await insertBlockAssignments(tx, block.id, assignedIds);

      if (block.type === BlockType.DRYLAND) {
        const selectedIds = formData.getAll(`exerciseSelection:${block.id}`).map(String)
          .filter((id) => validDrylandById.has(id));
        if (selectedIds.length === 0) throw new Error(`Le bloc dryland « ${block.title} » doit contenir un exercice.`);
        await tx.query(`DELETE FROM "DrylandBlockExercise" WHERE "blockId"=$1`,[block.id]);
        const exerciseRows = selectedIds.map((exerciseId, order) => {
          const defaults = validDrylandById.get(exerciseId)!;
          const existingExercise = block.drylandExercises.filter((exercise) => exercise.exerciseId === exerciseId)[order];
          return { exerciseId, sets: existingExercise ? nullableNumber(formData.get(`exerciseSets:${block.id}:${existingExercise.order}`)) : defaults.defaultSets, reps: existingExercise ? nullableNumber(formData.get(`exerciseReps:${block.id}:${existingExercise.order}`)) : defaults.defaultReps, duration: existingExercise ? nullableNumber(formData.get(`exerciseDuration:${block.id}:${existingExercise.order}`)) : defaults.defaultDuration, notes: existingExercise ? nullableText(formData.get(`exerciseNotes:${block.id}:${existingExercise.order}`)) : null, order };
        });
        await insertDrylandExercises(tx, block.id, exerciseRows);
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
          await insertPoolDives(tx, row.diveCodes.map((diveCode, order) => ({ id: randomUUID(), sectionId, diveCode, diveName: diveCode, position: "Libre", repetitions: repetitions[order], notes: null, order })));
        }
        await tx.query(`UPDATE "SessionBlock" SET "estimatedVolume"=$1 WHERE id=$2 AND "sessionId"=$3`,[poolRowsVolume(rows),block.id,sessionId]);
      }
    }
    if (wasPublished && isAutomaticSessionPushEnabled()) await saveSessionPublicationTargets(tx, sessionId);
    if (isPublishedUpdate && isAutomaticSessionPushEnabled()) await saveSessionUpdateTargets(tx, sessionId, updateId);
  });

  if (wasPublished) await dispatchSessionPublication(sessionId).catch(() => undefined);
  if (isPublishedUpdate) await dispatchSessionUpdate(sessionId, updateId).catch(() => undefined);

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
  revalidatePath("/athlete");
  revalidatePath("/athlete/calendar");
  revalidatePath("/athlete/week");
  revalidatePath(`/athlete/session/${sessionId}`);
  redirect(`/coach/sessions/${sessionId}?notice=session-updated`);
}

type Tx = import("pg").PoolClient;
type BlockType = SessionBlockType;

type PreparedDrylandExercise = {
  id: string;
  defaultSets: number | null;
  defaultReps: number | null;
  defaultDuration: number | null;
  roundTrip: boolean;
  override: CreateSessionInput["drylandBlocks"][number]["exerciseOverrides"][string] | undefined;
};
type DrylandExerciseDefaults = Omit<PreparedDrylandExercise, "override">;
type PreparedDrylandBlock = CreateSessionInput["drylandBlocks"][number] & {
  athleteIds: string[];
  exercises: PreparedDrylandExercise[];
};
type PreparedPoolBlock = CreateSessionInput["poolBlocks"][number] & { athleteIds: string[] };

function validateSessionForPublication(data: CreateSessionInput) {
  if (data.status !== SessionStatus.READY) return;
  const invalidBlocks =
    data.title.trim().length < 3 ||
    (data.warmup.enabled && (!data.warmup.title.trim() || data.warmup.duration < 1)) ||
    (data.cooldown.enabled && (!data.cooldown.title.trim() || data.cooldown.duration < 1)) ||
    data.drylandBlocks.some((block) => !block.title.trim() || block.duration < 1 || block.exerciseIds.length === 0 || block.athleteIds.length === 0 || Object.values(block.exerciseOverrides).some((value) => (value.sets !== null && (value.sets < 1 || value.sets > 20)) || (value.reps !== null && (value.reps < 1 || value.reps > 200)) || (value.duration !== null && (value.duration < 1 || value.duration > 3600)))) ||
    data.poolBlocks.some((block) => !block.title.trim() || block.duration < 1 || block.duration > 600 || block.athleteIds.length === 0 || block.sections.length === 0 || block.sections.some((section) => section.dives.length === 0 || section.dives.some((dive) => !dive.diveCode.trim() || !dive.diveName.trim() || !dive.position.trim() || dive.repetitions < 1)));
  if (invalidBlocks) throw new Error("La séance contient des éléments à corriger avant publication.");

  const blockEvaluationCount = Number(data.warmup.competitionEvaluation) + Number(data.cooldown.competitionEvaluation) +
    data.drylandBlocks.filter((block) => block.competitionEvaluation).length +
    data.poolBlocks.filter((block) => block.competitionEvaluation).length;
  const isBlockPlacement = data.evaluationPlacement.startsWith("block:") && data.evaluationPlacement.length > 6;
  const invalidEvaluationPlacement = data.evaluationPlacement === "none"
    ? blockEvaluationCount !== 0
    : data.evaluationPlacement === "start"
      ? blockEvaluationCount !== 0
      : !isBlockPlacement || data.warmup.competitionEvaluation || data.cooldown.competitionEvaluation || blockEvaluationCount !== 1;
  if (invalidEvaluationPlacement) throw new Error("Choisis un seul moment pour l’évaluation de confiance.");

  if ((!data.warmup.enabled && !data.cooldown.enabled && data.drylandBlocks.length === 0 && data.poolBlocks.length === 0) ||
      data.poolBlocks.some((block) => block.athleteIds.length === 0)) {
    throw new Error("La seance doit contenir au moins un bloc et chaque bloc d'entrainement doit etre complet et assigne.");
  }
}

function validateSessionReferencesForPublication(
  data: CreateSessionInput,
  allAthleteIds: string[],
  drylandBlocks: PreparedDrylandBlock[],
  poolBlocks: PreparedPoolBlock[]
) {
  if (data.status === SessionStatus.READY && (allAthleteIds.length === 0 || drylandBlocks.some((block) => block.athleteIds.length === 0 || block.exercises.length !== block.exerciseIds.length) || poolBlocks.some((block) => block.athleteIds.length === 0))) {
    throw new Error("La seance doit contenir au moins un athlete et un exercice valides.");
  }
}

function prepareSessionBuilderBlocks(
  data: CreateSessionInput,
  validAthleteIds: Set<string>,
  exerciseRows: DrylandExerciseDefaults[]
) {
  const exercisesById = new Map(exerciseRows.map((exercise) => [exercise.id, exercise]));
  const drylandBlocks: PreparedDrylandBlock[] = data.drylandBlocks.map((block) => ({
    ...block,
    athleteIds: block.athleteIds.filter((athleteId) => validAthleteIds.has(athleteId)),
    exercises: block.exerciseIds.flatMap((exerciseId) => {
      const exercise = exercisesById.get(exerciseId);
      return exercise ? [{ ...exercise, override: block.exerciseOverrides[exerciseId] }] : [];
    })
  }));
  const poolBlocks: PreparedPoolBlock[] = data.poolBlocks.map((block) => ({
    ...block,
    athleteIds: block.athleteIds.filter((athleteId) => validAthleteIds.has(athleteId))
  }));
  return { drylandBlocks, poolBlocks };
}

function buildSessionStructureBlocks(
  data: CreateSessionInput,
  drylandBlocks: PreparedDrylandBlock[],
  poolBlocks: PreparedPoolBlock[],
  allAthleteIds: string[]
): SessionStructureBlock[] {
  const blocks: SessionStructureBlock[] = [];

  if (data.warmup.enabled) {
    blocks.push({
      type: BlockType.WARMUP,
      title: data.warmup.title,
      description: data.warmup.description?.trim() || null,
      duration: data.warmup.duration,
      position: 1,
      estimatedVolume: 0,
      competitionEvaluation: data.warmup.competitionEvaluation,
      athleteIds: allAthleteIds,
      drylandExercises: [],
      poolTraining: null
    });
  }

  for (const [index, block] of drylandBlocks.entries()) {
    blocks.push({
      type: BlockType.DRYLAND,
      title: block.title,
      description: null,
      duration: block.duration,
      position: index + 2,
      estimatedVolume: block.exercises.reduce((sum, exercise) =>
        sum + (exercise.override?.sets ?? exercise.defaultSets ?? 1) * (exercise.override?.reps ?? exercise.defaultReps ?? 1) * block.athleteIds.length, 0),
      competitionEvaluation: block.competitionEvaluation,
      athleteIds: block.athleteIds,
      drylandExercises: block.exercises.map((exercise, order) => ({
        exerciseId: exercise.id,
        sets: exercise.override?.sets ?? exercise.defaultSets,
        reps: exercise.roundTrip ? null : exercise.override?.reps ?? exercise.defaultReps,
        duration: exercise.roundTrip ? null : exercise.override?.duration ?? exercise.defaultDuration,
        notes: exercise.override?.notes ?? null,
        order
      })),
      poolTraining: null
    });
  }

  for (const [index, block] of poolBlocks.entries()) {
    blocks.push({
      type: BlockType.POOL,
      title: block.title,
      description: null,
      duration: block.duration,
      position: index + drylandBlocks.length + 2,
      estimatedVolume: block.sections.reduce((sum, section) =>
        sum + Math.max(1, countPoolContexts(section.label ?? "")) * section.dives.reduce((sectionSum, dive) => sectionSum + dive.repetitions, 0), 0),
      competitionEvaluation: block.competitionEvaluation,
      athleteIds: block.athleteIds,
      drylandExercises: [],
      poolTraining: {
        sections: block.sections.map((section) => ({
          height: section.height,
          label: section.label,
          dives: section.dives
        }))
      }
    });
  }

  if (data.cooldown.enabled) {
    blocks.push({
      type: BlockType.COOLDOWN,
      title: data.cooldown.title,
      description: data.cooldown.description?.trim() || null,
      duration: data.cooldown.duration,
      position: 99,
      estimatedVolume: 0,
      competitionEvaluation: data.cooldown.competitionEvaluation,
      athleteIds: allAthleteIds,
      drylandExercises: [],
      poolTraining: null
    });
  }

  return blocks;
}

async function insertDrylandExercises(tx: Tx, blockId: string, rows: Array<{
  exerciseId: string; sets: number | null; reps: number | null; duration: number | null; notes: string | null; order: number;
}>) {
  if (!rows.length) return;
  await tx.query(
    `INSERT INTO "DrylandBlockExercise" ("blockId","exerciseId",sets,reps,duration,notes,"order")
     SELECT $1, * FROM unnest($2::text[], $3::int[], $4::int[], $5::int[], $6::text[], $7::int[])`,
    [blockId, rows.map((row) => row.exerciseId), rows.map((row) => row.sets), rows.map((row) => row.reps), rows.map((row) => row.duration), rows.map((row) => row.notes), rows.map((row) => row.order)]
  );
}

async function insertBlockAssignments(tx: Tx, blockId: string, athleteIds: string[]) {
  if (!athleteIds.length) return;
  await tx.query(
    `INSERT INTO "SessionBlockAssignment" (id,"sessionBlockId","athleteId")
     SELECT assignment_id, $1, athlete_id FROM unnest($2::text[], $3::text[]) AS assignments(assignment_id, athlete_id)
     ON CONFLICT ("sessionBlockId","athleteId") DO NOTHING`,
    [blockId, athleteIds.map(() => randomUUID()), athleteIds]
  );
}

async function insertPoolDives(tx: Tx, rows: Array<{
  id: string; sectionId: string; diveCode: string; diveName: string; position: string;
  repetitions: number; notes: string | null; order: number;
}>) {
  if (!rows.length) return;
  await tx.query(
    `INSERT INTO "PoolDive" (id,"poolSectionId","diveCode","diveName",position,repetitions,notes,"order")
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::int[], $7::text[], $8::int[])`,
    [rows.map((row) => row.id), rows.map((row) => row.sectionId), rows.map((row) => row.diveCode), rows.map((row) => row.diveName), rows.map((row) => row.position), rows.map((row) => row.repetitions), rows.map((row) => row.notes), rows.map((row) => row.order)]
  );
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
