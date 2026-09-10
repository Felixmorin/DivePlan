"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { BlockType, PoolHeight, SessionStatus, WeekStatus } from "@prisma/client";
import { z } from "zod";
import { requireCoach } from "@/lib/current-user";
import { trackEvent } from "@/lib/monitoring";
import { prisma } from "@/lib/prisma";
import { countPoolContexts, validatePoolListRow, type PoolListRow } from "@/lib/pool-list";
import {
  buildSessionTemplatePayload,
  createSessionFromPayload,
  getSessionSnapshot,
  parseSessionTemplatePayload
} from "@/lib/session-template";
import { formatMontrealDate, parseMontrealDateTimeInput, parseMontrealSessionDate, startOfMontrealWeek } from "@/lib/timezone";

const sessionInputSchema = z.object({
  title: z.string().min(3),
  date: z.string().min(10),
  groupId: z.string().min(1),
  duration: z.number().min(15),
  focus: z.string().min(3),
  notes: z.string().optional(),
  templateId: z.string().optional(),
  warmup: z.object({
    enabled: z.boolean(),
    title: z.string().trim().min(1),
    duration: z.number().int().min(1),
    description: z.string().optional()
  }),
  cooldown: z.object({
    enabled: z.boolean(),
    title: z.string().trim().min(1),
    duration: z.number().int().min(1),
    description: z.string().optional()
  }),
  drylandBlocks: z.array(z.object({
    title: z.string().trim().min(1),
    duration: z.number().int().min(1),
    exerciseIds: z.array(z.string()).min(1),
    athleteIds: z.array(z.string()).min(1)
  })).default([]),
  poolBlocks: z.array(z.object({
    title: z.string().min(1),
    duration: z.number().min(1),
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
  const exercise = await prisma.drylandExercise.create({
    data: {
      name: data.name,
      category: data.category || "Custom",
      description: `Exercice ajoute rapidement: ${data.name}`,
      equipment: data.equipment?.trim() || null,
      defaultSets: data.defaultSets ?? null,
      defaultReps: data.defaultReps ?? null,
      defaultDuration: data.defaultDuration ?? null,
      tags: Array.from(new Set(data.tags.map((tag) => tag.toLowerCase())))
    },
    select: { id: true, name: true, category: true, defaultSets: true, defaultReps: true, defaultDuration: true, equipment: true, tags: true }
  });

  revalidatePath("/coach/sessions/new");
  revalidatePath("/coach/library");

  return {
    id: exercise.id,
    name: exercise.name,
    category: exercise.category,
    sets: exercise.defaultSets,
    reps: exercise.defaultReps,
    duration: exercise.defaultDuration,
    equipment: exercise.equipment,
    tags: exercise.tags
  };
}

export async function createTrainingSession(input: CreateSessionInput) {
  const { user, coach, clubId } = await requireCoach();
  const data = sessionInputSchema.parse(input);
  const sessionDate = parseMontrealSessionDate(data.date);
  const group = await prisma.trainingGroup.findFirst({
    where: { id: data.groupId, clubId }
  });

  if (!group) {
    throw new Error("Groupe introuvable pour ce club.");
  }

  if (data.templateId) {
    const template = await prisma.sessionTemplate.findFirst({
      where: { id: data.templateId, clubId }
    });

    if (!template) {
      throw new Error("Modele introuvable pour ce club.");
    }

    const payload = parseSessionTemplatePayload(template.payload);
    const session = await prisma.$transaction((tx) =>
      createSessionFromPayload(tx, {
        clubId,
        coachId: coach.id,
        groupId: data.groupId,
        date: sessionDate,
        title: data.title.trim(),
        duration: data.duration,
        focus: data.focus.trim(),
        notes: data.notes?.trim() || null,
        payload,
        status: SessionStatus.READY
      })
    );

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

  if ((!data.warmup.enabled && !data.cooldown.enabled && data.drylandBlocks.length === 0 && data.poolBlocks.length === 0) ||
      data.poolBlocks.some((block) => block.athleteIds.length === 0)) {
    throw new Error("La seance doit contenir au moins un bloc et chaque bloc d'entrainement doit etre complet et assigne.");
  }

  const poolAthleteIds = data.poolBlocks.flatMap((block) => block.athleteIds);
  const requestedAthleteIds = Array.from(new Set([...data.drylandBlocks.flatMap((block) => block.athleteIds), ...poolAthleteIds]));
  const [athletes, exercises] = await Promise.all([
    prisma.athlete.findMany({
      where: { clubId, active: true },
      select: { id: true }
    }),
    prisma.drylandExercise.findMany({
      where: { id: { in: data.drylandBlocks.flatMap((block) => block.exerciseIds) } },
      select: { id: true, defaultSets: true, defaultReps: true, defaultDuration: true }
    })
  ]);

  const validAthleteIds = new Set(athletes.map((athlete) => athlete.id));
  const requireValidAthletes = (ids: string[]) => ids.filter((id) => validAthleteIds.has(id));
  const allAthleteIds = requestedAthleteIds.length > 0
    ? requestedAthleteIds.filter((id) => validAthleteIds.has(id))
    : Array.from(validAthleteIds);
  const drylandBlocks = data.drylandBlocks.map((block) => ({
    ...block,
    athleteIds: requireValidAthletes(block.athleteIds),
    exercises: block.exerciseIds.map((id) => exercises.find((exercise) => exercise.id === id)).filter((exercise): exercise is (typeof exercises)[number] => Boolean(exercise))
  }));
  const poolBlocks = data.poolBlocks.map((block) => ({ ...block, athleteIds: requireValidAthletes(block.athleteIds) }));

  if (allAthleteIds.length === 0 || drylandBlocks.some((block) => block.athleteIds.length === 0 || block.exercises.length !== block.exerciseIds.length) || poolBlocks.some((block) => block.athleteIds.length === 0)) {
    throw new Error("La seance doit contenir au moins un athlete et un exercice valides.");
  }

  const weekStart = startOfMontrealWeek(sessionDate);
  const session = await prisma.$transaction(async (tx) => {
    let week = await tx.trainingWeek.findFirst({
      where: { clubId, groupId: data.groupId, startDate: weekStart }
    });

    week ??= await tx.trainingWeek.create({
      data: {
        clubId,
        groupId: data.groupId,
        startDate: weekStart,
        title: `Semaine du ${formatMontrealDate(weekStart)}`,
        status: WeekStatus.PUBLISHED
      }
    });

    const createdSession = await tx.trainingSession.create({
      data: {
        date: sessionDate,
        title: data.title.trim(),
        duration: data.duration,
        focus: data.focus.trim(),
        notes: data.notes?.trim() || null,
        weekId: week.id,
        coachId: coach.id,
        status: SessionStatus.READY
      }
    });

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
      });
    }

    for (const [index, dryland] of drylandBlocks.entries()) {
      const drylandBlock = await createBlock(tx, {
        sessionId: createdSession.id,
        type: BlockType.DRYLAND,
        title: dryland.title,
        duration: dryland.duration,
        position: index + 2,
        estimatedVolume: dryland.exercises.length * dryland.athleteIds.length * 6,
        athleteIds: dryland.athleteIds
      });

      await tx.drylandBlockExercise.createMany({
        data: dryland.exercises.map((exercise, order) => ({
          blockId: drylandBlock.id,
          exerciseId: exercise.id,
          sets: exercise.defaultSets,
          reps: exercise.defaultReps,
          duration: exercise.defaultDuration,
          order
        }))
      });
    }

    for (const [index, poolBlock] of poolBlocks.entries()) {
      await createPoolBlock(tx, createdSession.id, poolBlock, index + drylandBlocks.length + 2);
    }

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
      });
    }

    return createdSession;
  });

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
  const session = await prisma.$transaction((tx) =>
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

  const template = await prisma.sessionTemplate.create({
    data: {
      name,
      category,
      sessionId: source.id,
      clubId,
      payload: buildSessionTemplatePayload(source)
    }
  });

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

export async function deleteSessionTemplate(formData: FormData) {
  const { user, clubId } = await requireCoach();
  const templateId = String(formData.get("templateId") ?? "");
  const template = await prisma.sessionTemplate.findFirst({
    where: { id: templateId, clubId }
  });

  if (!template) {
    throw new Error("Modele introuvable.");
  }

  await prisma.sessionTemplate.delete({ where: { id: template.id } });
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
  const session = await prisma.trainingSession.findFirst({
    where: { id: sessionId, week: { clubId } },
    select: { id: true, title: true }
  });

  if (!session) {
    throw new Error("Seance introuvable.");
  }

  await prisma.trainingSession.update({
    where: { id: session.id },
    data: { status: SessionStatus.NOT_DONE }
  });

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

export async function deleteTrainingSession(formData: FormData) {
  const { user, clubId } = await requireCoach();
  const sessionId = String(formData.get("sessionId") ?? "");
  const session = await prisma.trainingSession.findFirst({
    where: { id: sessionId, week: { clubId } },
    include: {
      blocks: { select: { id: true } }
    }
  });

  if (!session) {
    throw new Error("Seance introuvable.");
  }

  const blockIds = session.blocks.map((block) => block.id);

  await prisma.$transaction(async (tx) => {
    await tx.sessionTemplate.updateMany({ where: { sessionId: session.id }, data: { sessionId: null } });
    await tx.athleteDiveLog.deleteMany({ where: { sessionId: session.id } });
    await tx.athleteExerciseLog.deleteMany({ where: { sessionId: session.id } });
    await tx.athleteSessionCompletion.deleteMany({ where: { sessionId: session.id } });
    await tx.poolDive.deleteMany({ where: { poolSection: { poolTrainingId: { in: blockIds } } } });
    await tx.poolSection.deleteMany({ where: { poolTrainingId: { in: blockIds } } });
    await tx.poolTraining.deleteMany({ where: { blockId: { in: blockIds } } });
    await tx.drylandBlockExercise.deleteMany({ where: { blockId: { in: blockIds } } });
    await tx.sessionBlockAssignment.deleteMany({ where: { sessionBlockId: { in: blockIds } } });
    await tx.sessionBlock.deleteMany({ where: { sessionId: session.id } });
    await tx.trainingSession.delete({ where: { id: session.id } });
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
  const template = await prisma.sessionTemplate.findFirst({
    where: { id: templateId, clubId }
  });

  if (!template) {
    throw new Error("Modele introuvable.");
  }

  await prisma.sessionTemplate.update({
    where: { id: template.id },
    data: { favorite: !template.favorite }
  });
  revalidatePath("/coach/templates");
  revalidatePath("/coach/library");
}

export async function updateTrainingSession(formData: FormData) {
  const { user, clubId } = await requireCoach();
  const sessionId = String(formData.get("sessionId") ?? "");
  const existing = await prisma.trainingSession.findFirst({
    where: { id: sessionId, week: { clubId } },
    include: {
      completions: true,
      diveLogs: { select: { id: true } },
      exerciseLogs: { select: { id: true } },
      blocks: {
        include: {
          assignments: true,
          drylandExercises: true,
          poolTraining: { include: { sections: { include: { dives: true } } } }
        }
      }
    }
  });

  if (!existing) {
    throw new Error("Seance introuvable.");
  }

  const hasStarted =
    existing.completions.some((completion) => completion.startedAt || completion.status !== "NOT_STARTED") ||
    existing.diveLogs.length > 0 ||
    existing.exerciseLogs.length > 0;

  if (hasStarted) {
    throw new Error("Cette seance a deja ete commencee. Duplique-la pour modifier la planification sans alterer les donnees realisees.");
  }

  const title = String(formData.get("title") ?? "").trim();
  const focus = String(formData.get("focus") ?? "").trim();
  const duration = Number(formData.get("duration") ?? existing.duration);
  const date = String(formData.get("date") ?? "").trim();
  const status = String(formData.get("status") ?? existing.status) as SessionStatus;

  if (!title || !focus || !date || !Object.values(SessionStatus).includes(status)) {
    throw new Error("Details de seance invalides.");
  }

  const validAthletes = await prisma.athlete.findMany({
    where: { clubId, active: true },
    select: { id: true }
  });
  const validAthleteIds = new Set(validAthletes.map((athlete) => athlete.id));
  const includedBlockIds = new Set(formData.getAll("includedBlocks").map(String));
  if (includedBlockIds.size === 0) {
    throw new Error("La seance doit contenir au moins un bloc.");
  }
  const selectedDrylandIds = Array.from(new Set(existing.blocks.flatMap((block) =>
    block.type === BlockType.DRYLAND ? formData.getAll(`exerciseSelection:${block.id}`).map(String) : []
  )));
  const validDrylandExercises = await prisma.drylandExercise.findMany({
    where: { id: { in: selectedDrylandIds } },
    select: { id: true, defaultSets: true, defaultReps: true, defaultDuration: true }
  });
  const validDrylandById = new Map(validDrylandExercises.map((exercise) => [exercise.id, exercise]));

  await prisma.$transaction(async (tx) => {
    await tx.trainingSession.update({
      where: { id: sessionId },
      data: {
        title,
        focus,
        duration: Number.isFinite(duration) ? duration : existing.duration,
        date: parseMontrealDateTimeInput(date),
        notes: String(formData.get("notes") ?? "").trim() || null,
        status
      }
    });

    await tx.sessionBlock.deleteMany({
      where: { sessionId, id: { notIn: Array.from(includedBlockIds) } }
    });

    for (const block of existing.blocks) {
      if (!includedBlockIds.has(block.id)) continue;
      const blockTitle = String(formData.get(`blockTitle:${block.id}`) ?? block.title).trim();
      const blockDuration = Number(formData.get(`blockDuration:${block.id}`) ?? block.duration);
      const estimatedVolume = Number(formData.get(`blockVolume:${block.id}`) ?? block.estimatedVolume);
      const blockDescription = String(formData.get(`blockDescription:${block.id}`) ?? block.description ?? "").trim();
      const assignedIds = formData.getAll(`assign:${block.id}`).map(String).filter((id) => validAthleteIds.has(id));

      await tx.sessionBlock.update({
        where: { id: block.id },
        data: {
          title: blockTitle || block.title,
          description: blockDescription || null,
          duration: Number.isFinite(blockDuration) ? blockDuration : block.duration,
          estimatedVolume: Number.isFinite(estimatedVolume) ? estimatedVolume : block.estimatedVolume
        }
      });

      await tx.sessionBlockAssignment.deleteMany({ where: { sessionBlockId: block.id } });
      if (assignedIds.length > 0) {
        await tx.sessionBlockAssignment.createMany({
          data: assignedIds.map((athleteId) => ({ sessionBlockId: block.id, athleteId })),
          skipDuplicates: true
        });
      }

      if (block.type === BlockType.DRYLAND) {
        const selectedIds = Array.from(new Set(formData.getAll(`exerciseSelection:${block.id}`).map(String)))
          .filter((id) => validDrylandById.has(id));
        await tx.drylandBlockExercise.deleteMany({
          where: { blockId: block.id, exerciseId: { notIn: selectedIds } }
        });

        for (const [order, exerciseId] of selectedIds.entries()) {
          const defaults = validDrylandById.get(exerciseId)!;
          const existingExercise = block.drylandExercises.find((exercise) => exercise.exerciseId === exerciseId);
          await tx.drylandBlockExercise.upsert({
            where: { blockId_exerciseId: { blockId: block.id, exerciseId } },
            create: {
              blockId: block.id,
              exerciseId,
              sets: defaults.defaultSets,
              reps: defaults.defaultReps,
              duration: defaults.defaultDuration,
              order
            },
            update: {
              sets: existingExercise ? nullableNumber(formData.get(`exerciseSets:${block.id}:${exerciseId}`)) : defaults.defaultSets,
              reps: existingExercise ? nullableNumber(formData.get(`exerciseReps:${block.id}:${exerciseId}`)) : defaults.defaultReps,
              duration: existingExercise ? nullableNumber(formData.get(`exerciseDuration:${block.id}:${exerciseId}`)) : defaults.defaultDuration,
              notes: existingExercise ? nullableText(formData.get(`exerciseNotes:${block.id}:${exerciseId}`)) : null,
              order
            }
          });
        }
      }

      if (block.poolTraining) {
        const rows = parsePoolRows(formData.get(`poolRows:${block.id}`));
        await tx.poolDive.deleteMany({ where: { poolSection: { poolTrainingId: block.id } } });
        await tx.poolSection.deleteMany({ where: { poolTrainingId: block.id } });
        for (const row of rows) {
          const section = await tx.poolSection.create({ data: { poolTrainingId: block.id, height: poolHeightFromContext(row.context), label: row.context } });
          const repetitions = row.repetitions.length === 1 ? row.diveCodes.map(() => row.repetitions[0]) : row.repetitions;
          await tx.poolDive.createMany({ data: row.diveCodes.map((diveCode, order) => ({ poolSectionId: section.id, diveCode, diveName: diveCode, position: "Libre", repetitions: repetitions[order], order })) });
        }
        await tx.sessionBlock.update({ where: { id: block.id }, data: { estimatedVolume: poolRowsVolume(rows) } });
      }
    }
  });

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

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

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
  }
) {
  const block = await tx.sessionBlock.create({
    data: {
      sessionId: data.sessionId,
      type: data.type,
      title: data.title,
      duration: data.duration,
      position: data.position,
      estimatedVolume: data.estimatedVolume,
      description: data.description?.trim() || null
    }
  });

  await tx.sessionBlockAssignment.createMany({
    data: data.athleteIds.map((athleteId) => ({ sessionBlockId: block.id, athleteId })),
    skipDuplicates: true
  });

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
  });

  await tx.poolTraining.create({ data: { blockId: block.id } });
  for (const section of data.sections) {
    const createdSection = await tx.poolSection.create({
      data: { poolTrainingId: block.id, height: section.height, label: section.label }
    });

    await tx.poolDive.createMany({
      data: section.dives.map((dive) => ({
        poolSectionId: createdSection.id,
        diveCode: dive.diveCode,
        diveName: dive.diveName,
        position: dive.position,
        repetitions: dive.repetitions,
        notes: dive.notes,
        order: dive.order
      }))
    });
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

function poolHeightFromContext(context: string): PoolHeight {
  const normalized = context.trim().toLowerCase();
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
