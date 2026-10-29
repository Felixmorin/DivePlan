import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { SessionTemplatePayload } from "./session-template";

export type SessionStructureExecutor = Pick<PoolClient, "query">;
export type SessionStructureBlock = SessionTemplatePayload["blocks"][number];

type BlockRow = {
  id: string;
  sessionId: string;
  type: SessionStructureBlock["type"];
  title: string;
  description: string | null;
  duration: number;
  position: number;
  estimatedVolume: number;
  competitionEvaluation: boolean;
};

type AssignmentRow = { id: string; sessionBlockId: string; athleteId: string };
type DrylandExerciseRow = {
  blockId: string;
  exerciseId: string;
  sets: number | null;
  reps: number | null;
  duration: number | null;
  notes: string | null;
  order: number;
};
type PoolSectionRow = { id: string; blockId: string; height: string; label: string | null; order: number };
type PoolDiveRow = {
  id: string;
  sectionId: string;
  diveCode: string;
  diveName: string;
  position: string;
  repetitions: number;
  notes: string | null;
  order: number;
};

/**
 * Replaces a session's block graph. Call inside the transaction that creates
 * or updates the parent TrainingSession so deleting the old graph and writing
 * its replacement commit together.
 */
export async function replaceSessionStructure(
  tx: SessionStructureExecutor,
  sessionId: string,
  blocks: SessionStructureBlock[]
) {
  await tx.query(`DELETE FROM "SessionBlock" WHERE "sessionId" = $1`, [sessionId]);

  const blockRows: BlockRow[] = [];
  const assignmentRows: AssignmentRow[] = [];
  const exerciseRows: DrylandExerciseRow[] = [];
  const poolBlockIds: string[] = [];
  const sectionRows: PoolSectionRow[] = [];
  const diveRows: PoolDiveRow[] = [];

  for (const block of blocks) {
    const blockId = randomUUID();
    blockRows.push({
      id: blockId,
      sessionId,
      type: block.type,
      title: block.title,
      description: block.description,
      duration: block.duration,
      position: block.position,
      estimatedVolume: block.estimatedVolume,
      competitionEvaluation: block.competitionEvaluation
    });
    for (const athleteId of block.athleteIds) {
      assignmentRows.push({ id: randomUUID(), sessionBlockId: blockId, athleteId });
    }
    for (const exercise of block.drylandExercises) {
      exerciseRows.push({ blockId, ...exercise });
    }

    if (!block.poolTraining) continue;
    poolBlockIds.push(blockId);
    for (const [sectionOrder, section] of block.poolTraining.sections.entries()) {
      const sectionId = randomUUID();
      sectionRows.push({ id: sectionId, blockId, height: section.height, label: section.label, order: sectionOrder });
      for (const dive of section.dives) {
        diveRows.push({ id: randomUUID(), sectionId, ...dive });
      }
    }
  }

  await insertRows(tx, '"SessionBlock"', ['id', '"sessionId"', 'type', 'title', 'description', 'duration', 'position', '"estimatedVolume"', '"competitionEvaluation"'], blockRows.map((row) => [row.id, row.sessionId, row.type, row.title, row.description, row.duration, row.position, row.estimatedVolume, row.competitionEvaluation]));
  await insertRows(tx, '"SessionBlockAssignment"', ['id', '"sessionBlockId"', '"athleteId"'], assignmentRows.map((row) => [row.id, row.sessionBlockId, row.athleteId]), ' ON CONFLICT ("sessionBlockId","athleteId") DO NOTHING');
  await insertRows(tx, '"DrylandBlockExercise"', ['"blockId"', '"exerciseId"', 'sets', 'reps', 'duration', 'notes', '"order"'], exerciseRows.map((row) => [row.blockId, row.exerciseId, row.sets, row.reps, row.duration, row.notes, row.order]), ' ON CONFLICT ("blockId","order") DO NOTHING');
  await insertRows(tx, '"PoolTraining"', ['"blockId"'], poolBlockIds.map((blockId) => [blockId]));
  await insertRows(tx, '"PoolSection"', ['id', '"poolTrainingId"', 'height', 'label', '"order"'], sectionRows.map((row) => [row.id, row.blockId, row.height, row.label, row.order]));
  await insertRows(tx, '"PoolDive"', ['id', '"poolSectionId"', '"diveCode"', '"diveName"', 'position', 'repetitions', 'notes', '"order"'], diveRows.map((row) => [row.id, row.sectionId, row.diveCode, row.diveName, row.position, row.repetitions, row.notes, row.order]));
}

async function insertRows(tx: SessionStructureExecutor, table: string, columns: string[], rows: unknown[][], suffix = "") {
  const batchSize = 500;
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const values = batch.map((row, rowIndex) =>
      `(${columns.map((_, columnIndex) => `$${rowIndex * columns.length + columnIndex + 1}`).join(",")})`
    ).join(",");
    await tx.query(`INSERT INTO ${table} (${columns.join(",")}) VALUES ${values}${suffix}`, batch.flat());
  }
}
