import { notFound } from "next/navigation";
import { requireCoach } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

export async function getCoachSession(sessionId: string) {
  const { clubId } = await requireCoach();
  const session = await prisma.trainingSession.findFirst({
    where: {
      id: sessionId,
      week: { clubId }
    },
    include: {
      week: { include: { group: true } },
      completions: { include: { athlete: { include: { user: true } } } },
      diveLogs: { include: { athlete: { include: { user: true } }, poolDive: true } },
      exerciseLogs: { include: { athlete: { include: { user: true } }, exercise: true } },
      blocks: {
        orderBy: { position: "asc" },
        include: {
          assignments: { include: { athlete: { include: { user: true } } } },
          drylandExercises: { orderBy: { order: "asc" }, include: { exercise: true } },
          poolTraining: {
            include: {
              sections: {
                orderBy: { height: "asc" },
                include: { dives: { orderBy: { order: "asc" } } }
              }
            }
          }
        }
      }
    }
  });

  if (!session) {
    notFound();
  }

  return session;
}
