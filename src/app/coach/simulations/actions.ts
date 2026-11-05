"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCoach } from "@/lib/current-user";
import { withTransaction } from "@/lib/db";

const diveSchema = z.object({
  sessionId: z.string().min(1),
  turnIndex: z.coerce.number().int().min(0),
  diveCode: z.string().trim().min(1).max(20),
  diveName: z.string().trim().min(1).max(120),
  height: z.enum(["ONE_METER", "THREE_METER", "PLATFORM", "CUSTOM"]),
  difficulty: z.coerce.number().finite().min(0).max(20)
});

export async function updateCompetitionSimulationDive(formData: FormData) {
  const { clubId } = await requireCoach();
  const input = diveSchema.parse(Object.fromEntries(formData.entries()));

  await withTransaction(async (tx) => {
    const result = await tx.query<{ id: string; turns: unknown }>(
      `SELECT cs.id,cs.turns FROM "CompetitionSimulation" cs
       JOIN "TrainingSession" s ON s.id=cs."sessionId"
       JOIN "TrainingWeek" w ON w.id=s."weekId"
       WHERE s.id=$1 AND w."clubId"=$2 AND cs.status='COMPLETED' FOR UPDATE OF cs`,
      [input.sessionId, clubId]
    );
    const simulation = result.rows[0];
    if (!simulation || !Array.isArray(simulation.turns) || input.turnIndex >= simulation.turns.length) {
      throw new Error("Passage de simulation terminé introuvable.");
    }
    const turns = simulation.turns as Array<Record<string, unknown>>;
    const currentTurn = turns[input.turnIndex];
    if (!currentTurn || typeof currentTurn.athleteId !== "string") throw new Error("Passage invalide.");
    turns[input.turnIndex] = {
      ...currentTurn,
      diveCode: input.diveCode,
      diveName: input.diveName,
      height: input.height,
      difficulty: input.difficulty
    };
    await tx.query(`UPDATE "CompetitionSimulation" SET turns=$2::jsonb,"updatedAt"=NOW() WHERE id=$1`, [simulation.id, JSON.stringify(turns)]);
    await tx.query(
      `UPDATE "CompetitionSimulationRepetition" SET "diveCode"=$3,"diveName"=$4,height=$5
       WHERE "simulationId"=$1 AND "turnIndex"=$2`,
      [simulation.id, input.turnIndex, input.diveCode, input.diveName, input.height]
    );
  });

  revalidatePath(`/coach/simulations/${input.sessionId}`);
  revalidatePath("/coach/simulations");
}
