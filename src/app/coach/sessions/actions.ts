"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { BlockType, PoolHeight, SessionStatus, WeekStatus } from "@prisma/client";
import { z } from "zod";
import { requireCoach } from "@/lib/current-user";
import { trackEvent } from "@/lib/monitoring";
import { prisma } from "@/lib/prisma";

const sessionInputSchema = z.object({
  title: z.string().min(3),
  date: z.string().min(10),
  groupId: z.string().min(1),
  duration: z.number().min(15),
  focus: z.string().min(3),
  notes: z.string().optional(),
  drylandExerciseIds: z.array(z.string()).min(1),
  drylandAthleteIds: z.array(z.string()).min(1),
  poolA: z.array(z.string()).min(1),
  poolB: z.array(z.string()).min(1)
});

export type CreateSessionInput = z.infer<typeof sessionInputSchema>;

export async function createTrainingSession(input: CreateSessionInput) {
  const { user, coach, clubId } = await requireCoach();
  const data = sessionInputSchema.parse(input);
  const sessionDate = new Date(`${data.date}T16:30:00`);

  const [group, athletes, exercises] = await Promise.all([
    prisma.trainingGroup.findFirst({
      where: { id: data.groupId, clubId }
    }),
    prisma.athlete.findMany({
      where: {
        clubId,
        id: { in: Array.from(new Set([...data.drylandAthleteIds, ...data.poolA, ...data.poolB])) }
      },
      select: { id: true }
    }),
    prisma.drylandExercise.findMany({
      where: { id: { in: data.drylandExerciseIds } },
      select: { id: true, defaultSets: true, defaultReps: true, defaultDuration: true }
    })
  ]);

  if (!group) {
    throw new Error("Groupe introuvable pour ce club.");
  }

  const validAthleteIds = new Set(athletes.map((athlete) => athlete.id));
  const validExerciseIds = new Set(exercises.map((exercise) => exercise.id));

  const requireValidAthletes = (ids: string[]) => ids.filter((id) => validAthleteIds.has(id));
  const allAthleteIds = Array.from(validAthleteIds);
  const drylandAthleteIds = requireValidAthletes(data.drylandAthleteIds);
  const poolAIds = requireValidAthletes(data.poolA);
  const poolBIds = requireValidAthletes(data.poolB);
  const drylandExercises = exercises.filter((exercise) => validExerciseIds.has(exercise.id));

  if (allAthleteIds.length === 0 || drylandAthleteIds.length === 0 || drylandExercises.length === 0) {
    throw new Error("La seance doit contenir au moins un athlete et un exercice valides.");
  }

  const weekStart = startOfWeek(sessionDate);
  const session = await prisma.$transaction(async (tx) => {
    let week = await tx.trainingWeek.findFirst({
      where: { clubId, groupId: data.groupId, startDate: weekStart }
    });

    week ??= await tx.trainingWeek.create({
      data: {
        clubId,
        groupId: data.groupId,
        startDate: weekStart,
        title: `Semaine du ${weekStart.toLocaleDateString("fr-CA")}`,
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

    await createBlock(tx, {
      sessionId: createdSession.id,
      type: BlockType.WARMUP,
      title: "Echauffement dynamique",
      duration: 12,
      position: 1,
      estimatedVolume: 0,
      athleteIds: allAthleteIds
    });

    const drylandBlock = await createBlock(tx, {
      sessionId: createdSession.id,
      type: BlockType.DRYLAND,
      title: "Dryland - Activation technique",
      duration: 22,
      position: 2,
      estimatedVolume: drylandExercises.length * drylandAthleteIds.length * 6,
      athleteIds: drylandAthleteIds
    });

    await tx.drylandBlockExercise.createMany({
      data: drylandExercises.map((exercise, order) => ({
        blockId: drylandBlock.id,
        exerciseId: exercise.id,
        sets: exercise.defaultSets,
        reps: exercise.defaultReps,
        duration: exercise.defaultDuration,
        order
      }))
    });

    if (poolAIds.length > 0) {
      await createPoolBlock(tx, createdSession.id, "Entrainement piscine A", 3, poolAIds, [
        ["101C", "Avant groupe", 3],
        ["201B", "Arriere carpe", 5],
        ["203C", "Un et demi arriere", 4],
        ["301C", "Retour groupe", 4],
        ["401B", "Renverse carpe", 3]
      ]);
    }

    if (poolBIds.length > 0) {
      await createPoolBlock(tx, createdSession.id, "Entrainement piscine B", 4, poolBIds, [
        ["201C", "Arriere groupe", 4],
        ["301C", "Retour groupe", 5],
        ["401B", "Renverse carpe", 4],
        ["5331D", "Vrille avant", 3]
      ]);
    }

    await createBlock(tx, {
      sessionId: createdSession.id,
      type: BlockType.COOLDOWN,
      title: "Retour au calme",
      duration: 8,
      position: 99,
      estimatedVolume: 0,
      athleteIds: allAthleteIds
    });

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

export async function updateTrainingSession(formData: FormData) {
  const { user, clubId } = await requireCoach();
  const sessionId = String(formData.get("sessionId") ?? "");
  const existing = await prisma.trainingSession.findFirst({
    where: { id: sessionId, week: { clubId } },
    include: {
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

  await prisma.$transaction(async (tx) => {
    await tx.trainingSession.update({
      where: { id: sessionId },
      data: {
        title,
        focus,
        duration: Number.isFinite(duration) ? duration : existing.duration,
        date: new Date(date),
        notes: String(formData.get("notes") ?? "").trim() || null,
        status
      }
    });

    for (const block of existing.blocks) {
      const blockTitle = String(formData.get(`blockTitle:${block.id}`) ?? block.title).trim();
      const blockDuration = Number(formData.get(`blockDuration:${block.id}`) ?? block.duration);
      const estimatedVolume = Number(formData.get(`blockVolume:${block.id}`) ?? block.estimatedVolume);
      const assignedIds = formData.getAll(`assign:${block.id}`).map(String).filter((id) => validAthleteIds.has(id));

      await tx.sessionBlock.update({
        where: { id: block.id },
        data: {
          title: blockTitle || block.title,
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

      for (const exercise of block.drylandExercises) {
        await tx.drylandBlockExercise.update({
          where: { blockId_exerciseId: { blockId: exercise.blockId, exerciseId: exercise.exerciseId } },
          data: {
            sets: nullableNumber(formData.get(`exerciseSets:${block.id}:${exercise.exerciseId}`)),
            reps: nullableNumber(formData.get(`exerciseReps:${block.id}:${exercise.exerciseId}`)),
            duration: nullableNumber(formData.get(`exerciseDuration:${block.id}:${exercise.exerciseId}`)),
            notes: nullableText(formData.get(`exerciseNotes:${block.id}:${exercise.exerciseId}`))
          }
        });
      }

      for (const section of block.poolTraining?.sections ?? []) {
        await tx.poolSection.update({
          where: { id: section.id },
          data: { label: nullableText(formData.get(`sectionLabel:${section.id}`)) }
        });

        for (const dive of section.dives) {
          const repetitions = Number(formData.get(`diveReps:${dive.id}`) ?? dive.repetitions);
          await tx.poolDive.update({
            where: { id: dive.id },
            data: {
              diveCode: String(formData.get(`diveCode:${dive.id}`) ?? dive.diveCode).trim() || dive.diveCode,
              diveName: String(formData.get(`diveName:${dive.id}`) ?? dive.diveName).trim() || dive.diveName,
              repetitions: Number.isFinite(repetitions) ? repetitions : dive.repetitions,
              notes: nullableText(formData.get(`diveNotes:${dive.id}`))
            }
          });
        }
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
  }
) {
  const block = await tx.sessionBlock.create({
    data: {
      sessionId: data.sessionId,
      type: data.type,
      title: data.title,
      duration: data.duration,
      position: data.position,
      estimatedVolume: data.estimatedVolume
    }
  });

  await tx.sessionBlockAssignment.createMany({
    data: data.athleteIds.map((athleteId) => ({ sessionBlockId: block.id, athleteId })),
    skipDuplicates: true
  });

  return block;
}

async function createPoolBlock(tx: Tx, sessionId: string, title: string, position: number, athleteIds: string[], dives: Array<[string, string, number]>) {
  const volume = dives.reduce((sum, [, , reps]) => sum + reps, 0);
  const block = await createBlock(tx, {
    sessionId,
    type: BlockType.POOL,
    title,
    duration: 45,
    position,
    estimatedVolume: volume,
    athleteIds
  });

  await tx.poolTraining.create({ data: { blockId: block.id } });
  const oneMeter = await tx.poolSection.create({ data: { poolTrainingId: block.id, height: PoolHeight.ONE_METER, label: "1 metre" } });
  const threeMeter = await tx.poolSection.create({ data: { poolTrainingId: block.id, height: PoolHeight.THREE_METER, label: "3 metres" } });
  const split = Math.ceil(dives.length / 2);

  await tx.poolDive.createMany({
    data: dives.slice(0, split).map(([diveCode, diveName, repetitions], order) => ({
      poolSectionId: oneMeter.id,
      diveCode,
      diveName,
      position: diveCode.slice(-1),
      repetitions,
      order
    }))
  });

  await tx.poolDive.createMany({
    data: dives.slice(split).map(([diveCode, diveName, repetitions], order) => ({
      poolSectionId: threeMeter.id,
      diveCode,
      diveName,
      position: diveCode.slice(-1),
      repetitions,
      order
    }))
  });
}

function startOfWeek(date: Date) {
  const copy = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() - day + 1);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

function nullableNumber(value: FormDataEntryValue | null) {
  const number = Number(value);
  return Number.isFinite(number) && String(value ?? "").trim() !== "" ? number : null;
}

function nullableText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || null;
}
