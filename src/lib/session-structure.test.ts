import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { SessionTemplatePayload } from "./session-template";
import { replaceSessionStructure, type SessionStructureExecutor } from "./session-structure";

test("session structure can be created and replaced through one transaction writer", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE "SessionBlock" (
        id text PRIMARY KEY,
        "sessionId" text NOT NULL,
        type text NOT NULL,
        title text NOT NULL,
        description text,
        duration integer NOT NULL,
        position integer NOT NULL,
        "estimatedVolume" integer NOT NULL,
        "competitionEvaluation" boolean NOT NULL
      );
      CREATE TABLE "SessionBlockAssignment" (
        id text PRIMARY KEY,
        "sessionBlockId" text NOT NULL REFERENCES "SessionBlock"(id) ON DELETE CASCADE,
        "athleteId" text NOT NULL,
        UNIQUE ("sessionBlockId", "athleteId")
      );
      CREATE TABLE "DrylandBlockExercise" (
        "blockId" text NOT NULL REFERENCES "SessionBlock"(id) ON DELETE CASCADE,
        "exerciseId" text NOT NULL,
        sets integer,
        reps integer,
        duration integer,
        notes text,
        "order" integer NOT NULL,
        PRIMARY KEY ("blockId", "order")
      );
      CREATE TABLE "PoolTraining" (
        "blockId" text PRIMARY KEY REFERENCES "SessionBlock"(id) ON DELETE CASCADE
      );
      CREATE TABLE "PoolSection" (
        id text PRIMARY KEY,
        "poolTrainingId" text NOT NULL REFERENCES "PoolTraining"("blockId") ON DELETE CASCADE,
        height text NOT NULL,
        label text,
        "order" integer NOT NULL
      );
      CREATE TABLE "PoolDive" (
        id text PRIMARY KEY,
        "poolSectionId" text NOT NULL REFERENCES "PoolSection"(id) ON DELETE CASCADE,
        "diveCode" text NOT NULL,
        "diveName" text NOT NULL,
        position text NOT NULL,
        repetitions integer NOT NULL CHECK (repetitions > 0),
        notes text,
        "order" integer NOT NULL
      );
      INSERT INTO "SessionBlock" (id, "sessionId", type, title, duration, position, "estimatedVolume", "competitionEvaluation")
      VALUES ('old-block', 'session-a', 'DRYLAND', 'Old structure', 10, 0, 8, false);
      INSERT INTO "SessionBlockAssignment" VALUES ('old-assignment', 'old-block', 'athlete-old');
      INSERT INTO "DrylandBlockExercise" VALUES ('old-block', 'exercise-old', 1, 8, NULL, NULL, 0);
    `);

    const blocks: SessionTemplatePayload["blocks"] = [
      {
        type: "WARMUP", title: "Activation", description: null, duration: 10, position: 1,
        estimatedVolume: 0, competitionEvaluation: false, athleteIds: ["athlete-a"],
        drylandExercises: [], poolTraining: null
      },
      {
        type: "DRYLAND", title: "Strength", description: null, duration: 15, position: 2,
        estimatedVolume: 24, competitionEvaluation: true, athleteIds: ["athlete-a", "athlete-b"],
        drylandExercises: [{ exerciseId: "exercise-core", sets: 3, reps: 8, duration: null, notes: "controlled", order: 0 }],
        poolTraining: null
      },
      {
        type: "POOL", title: "Entries", description: null, duration: 20, position: 3,
        estimatedVolume: 6, competitionEvaluation: false, athleteIds: ["athlete-b"],
        drylandExercises: [],
        poolTraining: { sections: [{ height: "ONE_METER", label: "board", dives: [{ diveCode: "101A", diveName: "Forward dive", position: "straight", repetitions: 6, notes: null, order: 0 }] }] }
      }
    ];
    const tx = { query: (sql: string, values?: unknown[]) => db.query(sql, values) } as unknown as SessionStructureExecutor;

    await db.exec("BEGIN");
    await replaceSessionStructure(tx, "session-a", blocks);
    await db.exec("COMMIT");

    const blockRows = await db.query<{ type: string; title: string; position: number; estimatedVolume: number; competitionEvaluation: boolean }>(
      `SELECT type, title, position, "estimatedVolume", "competitionEvaluation" FROM "SessionBlock" WHERE "sessionId" = $1 ORDER BY position`,
      ["session-a"]
    );
    assert.deepEqual(blockRows.rows, [
      { type: "WARMUP", title: "Activation", position: 1, estimatedVolume: 0, competitionEvaluation: false },
      { type: "DRYLAND", title: "Strength", position: 2, estimatedVolume: 24, competitionEvaluation: true },
      { type: "POOL", title: "Entries", position: 3, estimatedVolume: 6, competitionEvaluation: false }
    ]);
    assert.equal((await db.query(`SELECT 1 FROM "SessionBlockAssignment" WHERE "athleteId" IN ('athlete-a', 'athlete-b')`)).rows.length, 4);
    assert.deepEqual((await db.query(`SELECT "exerciseId", sets, reps, notes, "order" FROM "DrylandBlockExercise"`)).rows, [
      { exerciseId: "exercise-core", sets: 3, reps: 8, notes: "controlled", order: 0 }
    ]);
    assert.deepEqual((await db.query(`SELECT s.height, s.label, d."diveCode", d.repetitions FROM "PoolSection" s JOIN "PoolDive" d ON d."poolSectionId" = s.id`)).rows, [
      { height: "ONE_METER", label: "board", diveCode: "101A", repetitions: 6 }
    ]);

    await db.exec("BEGIN");
    await assert.rejects(replaceSessionStructure(tx, "session-a", [{
      type: "POOL", title: "Invalid replacement", description: null, duration: 10, position: 1,
      estimatedVolume: 0, competitionEvaluation: false, athleteIds: ["athlete-a"],
      drylandExercises: [],
      poolTraining: { sections: [{ height: "ONE_METER", label: null, dives: [{ diveCode: "101A", diveName: "Forward dive", position: "straight", repetitions: 0, notes: null, order: 0 }] }] }
    }]), /check constraint/);
    await db.exec("ROLLBACK");
    assert.deepEqual((await db.query(`SELECT type, title FROM "SessionBlock" WHERE "sessionId" = 'session-a' ORDER BY position`)).rows, [
      { type: "WARMUP", title: "Activation" },
      { type: "DRYLAND", title: "Strength" },
      { type: "POOL", title: "Entries" }
    ]);

    await db.exec("BEGIN");
    await replaceSessionStructure(tx, "session-a", [{
      type: "COOLDOWN", title: "Reset", description: null, duration: 5, position: 99,
      estimatedVolume: 0, competitionEvaluation: false, athleteIds: ["athlete-a"],
      drylandExercises: [], poolTraining: null
    }]);
    await db.exec("COMMIT");

    assert.deepEqual((await db.query(`SELECT type, title FROM "SessionBlock" WHERE "sessionId" = 'session-a'`)).rows, [
      { type: "COOLDOWN", title: "Reset" }
    ]);
    assert.equal((await db.query(`SELECT 1 FROM "SessionBlockAssignment" WHERE "sessionBlockId" = 'old-block' OR "athleteId" = 'athlete-b'`)).rows.length, 0);
    assert.equal((await db.query(`SELECT 1 FROM "DrylandBlockExercise" WHERE "exerciseId" IN ('exercise-old', 'exercise-core')`)).rows.length, 0);
    assert.equal((await db.query(`SELECT 1 FROM "PoolTraining"`)).rows.length, 0);
    assert.equal((await db.query(`SELECT 1 FROM "PoolSection"`)).rows.length, 0);
    assert.equal((await db.query(`SELECT 1 FROM "PoolDive"`)).rows.length, 0);
  } finally {
    await db.close();
  }
});
