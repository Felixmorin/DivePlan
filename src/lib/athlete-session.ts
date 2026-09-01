import { PoolHeight } from "@prisma/client";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

export type AthleteSessionExercise = {
  id: string;
  name: string;
  category: string;
  sets: number | null;
  reps: number | null;
  duration: number | null;
  equipment: string | null;
  completed: boolean;
  rating: string | null;
  note: string | null;
};

export type AthleteSessionDive = {
  id: string;
  code: string;
  name: string;
  repetitions: number;
  completedRepetitions: number;
  rating: string | null;
  note: string | null;
};

export type AthleteSessionBlock = {
  id: string;
  title: string;
  type: "WARMUP" | "DRYLAND" | "POOL" | "COOLDOWN" | "CUSTOM";
  duration: number;
  volume: number;
  exercises: AthleteSessionExercise[];
  poolSections: Array<{
    id: string;
    label: string;
    height: PoolHeight;
    dives: AthleteSessionDive[];
  }>;
};

export type AthleteSessionView = {
  id: string;
  title: string;
  focus: string;
  date: string;
  duration: number;
  group: string;
  notes: string | null;
  completionStatus: string;
  blocks: AthleteSessionBlock[];
};

export type AthleteProgressTotals = {
  readyScore: number;
  completedSessions: number;
  totalDiveRepetitions: number;
  completedExercises: number;
  completedMinutes: number;
  completionRate: number;
  recentNote: string;
  chartData: Array<{ name: string; volume: number }>;
  skillCategories: string[];
};

export type AthleteRecentCompletion = {
  sessionId: string;
  title: string;
  focus: string;
  duration: number;
  completedAt: string | null;
  status: string;
};

export async function getCurrentAthlete() {
  const user = await getCurrentUser();

  if (!user || user.role !== "ATHLETE") {
    return null;
  }

  return prisma.athlete.findUnique({
    where: { userId: user.id },
    include: { user: true }
  });
}

export async function getAssignedReadySession(athleteId: string) {
  return prisma.trainingSession.findFirst({
    where: {
      status: "READY",
      blocks: { some: { assignments: { some: { athleteId } } } }
    },
    orderBy: { date: "asc" },
    include: {
      week: { include: { group: true } },
      coach: { include: { user: true } },
      blocks: {
        where: { assignments: { some: { athleteId } } },
        include: {
          drylandExercises: {
            orderBy: { order: "asc" },
            include: { exercise: true }
          },
          poolTraining: {
            include: {
              sections: {
                orderBy: { height: "asc" },
                include: { dives: { orderBy: { order: "asc" } } }
              }
            }
          }
        },
        orderBy: { position: "asc" }
      },
      completions: { where: { athleteId } }
    }
  });
}

export async function getAthleteRecentCompletions(athleteId: string): Promise<AthleteRecentCompletion[]> {
  const completions = await prisma.athleteSessionCompletion.findMany({
    where: { athleteId },
    orderBy: [{ completedAt: "desc" }, { startedAt: "desc" }],
    take: 6,
    include: { session: true }
  });

  return completions.map((completion) => ({
    sessionId: completion.sessionId,
    title: completion.session.title,
    focus: completion.session.focus,
    duration: completion.session.duration,
    completedAt: completion.completedAt?.toISOString() ?? completion.startedAt?.toISOString() ?? null,
    status: completion.status
  }));
}

export async function getAthleteSession(sessionId: string, athleteId: string): Promise<AthleteSessionView | null> {
  const session = await prisma.trainingSession.findFirst({
    where: {
      id: sessionId,
      blocks: { some: { assignments: { some: { athleteId } } } }
    },
    include: {
      week: { include: { group: true } },
      blocks: {
        where: { assignments: { some: { athleteId } } },
        include: {
          drylandExercises: {
            orderBy: { order: "asc" },
            include: { exercise: { include: { logs: { where: { athleteId, sessionId } } } } }
          },
          poolTraining: {
            include: {
              sections: {
                orderBy: { height: "asc" },
                include: { dives: { orderBy: { order: "asc" }, include: { logs: { where: { athleteId, sessionId } } } } }
              }
            }
          }
        },
        orderBy: { position: "asc" }
      },
      completions: { where: { athleteId } }
    }
  });

  if (!session) {
    return null;
  }

  return {
    id: session.id,
    title: session.title,
    focus: session.focus,
    date: session.date.toISOString(),
    duration: session.duration,
    group: session.week.group.name,
    notes: session.notes,
    completionStatus: session.completions[0]?.status ?? "NOT_STARTED",
    blocks: session.blocks.map((block) => ({
      id: block.id,
      title: block.title,
      type: block.type,
      duration: block.duration,
      volume: block.estimatedVolume,
      exercises: block.drylandExercises.map((blockExercise) => {
        const latestLog = blockExercise.exercise.logs.at(-1);

        return {
          id: blockExercise.exercise.id,
          name: blockExercise.exercise.name,
          category: blockExercise.exercise.category,
          sets: blockExercise.sets,
          reps: blockExercise.reps,
          duration: blockExercise.duration,
          equipment: blockExercise.exercise.equipment,
          completed: latestLog?.completed ?? false,
          rating: latestLog?.rating ?? null,
          note: latestLog?.note ?? null
        };
      }),
      poolSections:
        block.poolTraining?.sections.map((section) => ({
          id: section.id,
          label: section.label ?? poolHeightLabel(section.height),
          height: section.height,
          dives: section.dives.map((dive) => {
            const latestLog = dive.logs.at(-1);

            return {
              id: dive.id,
              code: dive.diveCode,
              name: dive.diveName,
              repetitions: dive.repetitions,
              completedRepetitions: latestLog?.repetitionsCompleted ?? 0,
              rating: latestLog?.rating ?? null,
              note: latestLog?.note ?? null
            };
          })
        })) ?? []
    }))
  };
}

export async function getAthleteProgressTotals(athleteId: string): Promise<AthleteProgressTotals> {
  const [completedSessions, assignedSessions, diveLogs, completedExercises, skills] = await Promise.all([
    prisma.athleteSessionCompletion.findMany({
      where: { athleteId, status: "COMPLETED" },
      include: { session: true },
      orderBy: { completedAt: "desc" }
    }),
    prisma.trainingSession.count({
      where: { blocks: { some: { assignments: { some: { athleteId } } } } }
    }),
    prisma.athleteDiveLog.findMany({
      where: { athleteId },
      include: { poolDive: true }
    }),
    prisma.athleteExerciseLog.count({ where: { athleteId, completed: true } }),
    prisma.athleteSkill.findMany({ where: { athleteId }, include: { skill: true } })
  ]);

  const familyLabels: Record<string, string> = {
    "1": "Avant",
    "2": "Arriere",
    "3": "Retour",
    "4": "Renverse",
    "5": "Vrille"
  };
  const chartTotals = new Map<string, number>([
    ["Avant", 0],
    ["Arriere", 0],
    ["Retour", 0],
    ["Renverse", 0],
    ["Vrille", 0],
    ["Equilibre", 0]
  ]);

  for (const log of diveLogs) {
    const label = familyLabels[log.poolDive.diveCode.charAt(0)] ?? "Equilibre";
    chartTotals.set(label, (chartTotals.get(label) ?? 0) + log.repetitionsCompleted);
  }

  const completedMinutes = completedSessions.reduce((sum, completion) => sum + completion.session.duration, 0);
  const totalDiveRepetitions = diveLogs.reduce((sum, log) => sum + log.repetitionsCompleted, 0);
  const completionRate = assignedSessions > 0 ? Math.round((completedSessions.length / assignedSessions) * 100) : 0;
  const readyScore = Math.min(100, Math.round(completionRate * 0.6 + Math.min(totalDiveRepetitions, 120) * 0.25 + Math.min(completedExercises, 20) * 0.5));

  return {
    readyScore,
    completedSessions: completedSessions.length,
    totalDiveRepetitions,
    completedExercises,
    completedMinutes,
    completionRate,
    recentNote: completedSessions[0]?.session.focus ?? "Complete une seance pour generer une tendance.",
    chartData: Array.from(chartTotals, ([name, volume]) => ({ name, volume })),
    skillCategories: Array.from(new Set(skills.map((skill) => skill.skill.category)))
  };
}

function poolHeightLabel(height: PoolHeight) {
  switch (height) {
    case PoolHeight.ONE_METER:
      return "1 metre";
    case PoolHeight.THREE_METER:
      return "3 metres";
    case PoolHeight.PLATFORM:
      return "Plateforme";
    default:
      return "Autre";
  }
}
