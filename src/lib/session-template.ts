import { BlockType, PoolHeight, SessionStatus, WeekStatus, type Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { formatMontrealDate, startOfMontrealWeek } from "@/lib/timezone";

export const sessionTemplatePayloadSchema = z.object({
  version: z.literal(1),
  title: z.string(),
  duration: z.number(),
  focus: z.string(),
  notes: z.string().nullable(),
  blocks: z.array(z.object({
    type: z.nativeEnum(BlockType),
    title: z.string(),
    description: z.string().nullable(),
    duration: z.number(),
    position: z.number(),
    estimatedVolume: z.number(),
    athleteIds: z.array(z.string()),
    drylandExercises: z.array(z.object({
      exerciseId: z.string(),
      sets: z.number().nullable(),
      reps: z.number().nullable(),
      duration: z.number().nullable(),
      notes: z.string().nullable(),
      order: z.number()
    })),
    poolTraining: z.object({
      sections: z.array(z.object({
        height: z.nativeEnum(PoolHeight),
        label: z.string().nullable(),
        dives: z.array(z.object({
          diveCode: z.string(),
          diveName: z.string(),
          position: z.string(),
          repetitions: z.number(),
          notes: z.string().nullable(),
          order: z.number()
        }))
      }))
    }).nullable()
  }))
});

export type SessionTemplatePayload = z.infer<typeof sessionTemplatePayloadSchema>;
export type SessionSnapshot = Prisma.TrainingSessionGetPayload<{
  include: {
    week: true;
    blocks: {
      include: {
        assignments: true;
        drylandExercises: true;
        poolTraining: { include: { sections: { include: { dives: true } } } };
      };
    };
  };
}>;

type Tx = Prisma.TransactionClient;

export function buildSessionTemplatePayload(session: SessionSnapshot): SessionTemplatePayload {
  return {
    version: 1,
    title: session.title,
    duration: session.duration,
    focus: session.focus,
    notes: session.notes,
    blocks: session.blocks
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((block) => ({
        type: block.type,
        title: block.title,
        description: block.description,
        duration: block.duration,
        position: block.position,
        estimatedVolume: block.estimatedVolume,
        athleteIds: block.assignments.map((assignment) => assignment.athleteId),
        drylandExercises: block.drylandExercises
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((item) => ({
            exerciseId: item.exerciseId,
            sets: item.sets,
            reps: item.reps,
            duration: item.duration,
            notes: item.notes,
            order: item.order
          })),
        poolTraining: block.poolTraining
          ? {
              sections: block.poolTraining.sections.map((section) => ({
                height: section.height,
                label: section.label,
                dives: section.dives
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((dive) => ({
                    diveCode: dive.diveCode,
                    diveName: dive.diveName,
                    position: dive.position,
                    repetitions: dive.repetitions,
                    notes: dive.notes,
                    order: dive.order
                  }))
              }))
            }
          : null
      }))
  };
}

export async function createSessionFromPayload(
  tx: Tx,
  data: {
    clubId: string;
    coachId: string;
    groupId: string;
    date: Date;
    title: string;
    duration: number;
    focus: string;
    notes?: string | null;
    payload: SessionTemplatePayload;
    status?: SessionStatus;
  }
) {
  const [validAthletes, validExercises] = await Promise.all([
    tx.athlete.findMany({ where: { clubId: data.clubId }, select: { id: true } }),
    tx.drylandExercise.findMany({
      where: { id: { in: data.payload.blocks.flatMap((block) => block.drylandExercises.map((item) => item.exerciseId)) } },
      select: { id: true }
    })
  ]);
  const validAthleteIds = new Set(validAthletes.map((athlete) => athlete.id));
  const validExerciseIds = new Set(validExercises.map((exercise) => exercise.id));
  const weekStart = startOfMontrealWeek(data.date);
  let week = await tx.trainingWeek.findFirst({
    where: { clubId: data.clubId, groupId: data.groupId, startDate: weekStart }
  });

  week ??= await tx.trainingWeek.create({
    data: {
      clubId: data.clubId,
      groupId: data.groupId,
      startDate: weekStart,
      title: `Semaine du ${formatMontrealDate(weekStart)}`,
      status: WeekStatus.PUBLISHED
    }
  });

  const session = await tx.trainingSession.create({
    data: {
      date: data.date,
      title: data.title,
      duration: data.duration,
      focus: data.focus,
      notes: data.notes ?? null,
      weekId: week.id,
      coachId: data.coachId,
      status: data.status ?? SessionStatus.READY
    }
  });

  for (const block of data.payload.blocks) {
    const createdBlock = await tx.sessionBlock.create({
      data: {
        sessionId: session.id,
        type: block.type,
        title: block.title,
        description: block.description,
        duration: block.duration,
        position: block.position,
        estimatedVolume: block.estimatedVolume
      }
    });
    const athleteIds = block.athleteIds.filter((athleteId) => validAthleteIds.has(athleteId));

    if (athleteIds.length > 0) {
      await tx.sessionBlockAssignment.createMany({
        data: athleteIds.map((athleteId) => ({ sessionBlockId: createdBlock.id, athleteId })),
        skipDuplicates: true
      });
    }

    const exercises = block.drylandExercises.filter((item) => validExerciseIds.has(item.exerciseId));
    if (exercises.length > 0) {
      await tx.drylandBlockExercise.createMany({
        data: exercises.map((item) => ({
          blockId: createdBlock.id,
          exerciseId: item.exerciseId,
          sets: item.sets,
          reps: item.reps,
          duration: item.duration,
          notes: item.notes,
          order: item.order
        })),
        skipDuplicates: true
      });
    }

    if (block.poolTraining) {
      await tx.poolTraining.create({ data: { blockId: createdBlock.id } });
      for (const section of block.poolTraining.sections) {
        const createdSection = await tx.poolSection.create({
          data: {
            poolTrainingId: createdBlock.id,
            height: section.height,
            label: section.label
          }
        });

        if (section.dives.length > 0) {
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
    }
  }

  return session;
}

export async function getSessionSnapshot(sessionId: string, clubId: string) {
  return prisma.trainingSession.findFirst({
    where: { id: sessionId, week: { clubId } },
    include: {
      week: true,
      blocks: {
        orderBy: { position: "asc" },
        include: {
          assignments: true,
          drylandExercises: { orderBy: { order: "asc" } },
          poolTraining: {
            include: {
              sections: {
                include: { dives: { orderBy: { order: "asc" } } }
              }
            }
          }
        }
      }
    }
  });
}

export function parseSessionTemplatePayload(payload: Prisma.JsonValue) {
  return sessionTemplatePayloadSchema.parse(payload);
}
