import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import type { AthleteProgressPayload, persistAthleteProgress } from "./athlete-progress";

type Persist = typeof persistAthleteProgress;

// The player keys checks by exercise ID. Reusing an exercise in two blocks
// legitimately emits that ID twice when saving the full session on pagehide.
function playerPayload(): AthleteProgressPayload {
  const file = ts.createSourceFile("player.tsx", readFileSync("src/components/athlete/session-player.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const builder = file.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "buildSessionProgressPayload");
  assert.ok(builder);
  const exports: { buildSessionProgressPayload?: (...args: unknown[]) => AthleteProgressPayload } = {};
  runInNewContext(ts.transpileModule(`export ${builder.getText(file)}`, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports });
  return exports.buildSessionProgressPayload!("session-a", [
    { exercises: [{ id: "exercise-a" }], poolSections: [] },
    { exercises: [{ id: "exercise-a" }], poolSections: [] }
  ], { "exercise-a": true }, {}, { rating: "5", note: "Synthetic" });
}

test("progress persistence accepts repeated session items without PostgreSQL 21000", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE "AthleteExerciseLog" (id text PRIMARY KEY, "athleteId" text, "sessionId" text, "exerciseId" text,
        completed boolean, rating text, note text, UNIQUE ("athleteId", "sessionId", "exerciseId"));
      CREATE TABLE "AthleteDiveLog" (id text PRIMARY KEY, "athleteId" text, "sessionId" text, "poolDiveId" text,
        "repetitionsCompleted" int, "goldenRepetitions" int, "feedbackCompleted" boolean, rating text, note text,
        timestamp timestamptz, UNIQUE ("athleteId", "sessionId", "poolDiveId"));
      CREATE TABLE "AthleteSessionCompletion" ("athleteId" text, "sessionId" text, "startedAt" timestamptz,
        status text, rating text, note text, UNIQUE ("athleteId", "sessionId"));
      INSERT INTO "AthleteExerciseLog" VALUES ('other-exercise','athlete-b','session-a','exercise-a',false,NULL,'untouched');
      INSERT INTO "AthleteDiveLog" VALUES ('other-dive','athlete-b','session-a','dive-a',9,3,true,NULL,'untouched',NOW());
    `);
    let writes = 0;
    const dependencies: Record<string, unknown> = {
      "node:crypto": { randomUUID },
      "@/lib/db": { query: db.query.bind(db), withTransaction: (callback: (tx: unknown) => Promise<unknown>) => db.transaction((tx) => callback({
        query: (sql: string, values: unknown[]) => { writes++; return tx.query(sql, values); }
      })) }
    };
    const exports: { persistAthleteProgress?: Persist } = {};
    runInNewContext(ts.transpileModule(readFileSync("src/lib/athlete-progress.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText, { exports, Date, require: (name: string) => { assert.ok(name in dependencies); return dependencies[name]; } });
    const persist = exports.persistAthleteProgress!;
    const blocks = [{ id: "block-a", exerciseIds: ["exercise-a"], diveIds: ["dive-a"] }] as Parameters<Persist>[2];
    const payload = playerPayload();
    assert.equal(payload.exercises.length, 2, "real player builder reproduces duplicate exercise IDs");
    await persist(payload, "athlete-a", blocks);
    const exercise = (await db.query<{ completed: boolean }>(`SELECT completed FROM "AthleteExerciseLog" WHERE "athleteId"='athlete-a'`)).rows;
    assert.deepEqual(exercise, [{ completed: true }]);
    assert.equal(writes, 2, "one batched exercise write and one completion write");

    await t.test("last snapshot wins; repetitions are not summed and clamps remain", async () => {
      const dive = { poolDiveId: "dive-a", repetitionsCompleted: 4, goldenRepetitions: 2, feedbackCompleted: false, rating: null, note: null };
      await persist({ sessionId: "session-a", exercises: [
        { exerciseId: "exercise-a", completed: true, rating: null, note: "old" },
        { exerciseId: "exercise-a", completed: false, rating: " bien ", note: " latest " }
      ], dives: [dive, { ...dive, repetitionsCompleted: 700, goldenRepetitions: 600, feedbackCompleted: true, note: " latest " }] }, "athlete-a", blocks);
      assert.deepEqual((await db.query(`SELECT completed,rating,note FROM "AthleteExerciseLog" WHERE "athleteId"='athlete-a'`)).rows,
        [{ completed: false, rating: "bien", note: "latest" }]);
      assert.deepEqual((await db.query(`SELECT "repetitionsCompleted","goldenRepetitions","feedbackCompleted",rating,note FROM "AthleteDiveLog" WHERE "athleteId"='athlete-a'`)).rows,
        [{ repetitionsCompleted: 500, goldenRepetitions: 500, feedbackCompleted: true, rating: "moyen", note: "latest" }]);
      assert.deepEqual((await db.query(`SELECT rating,note FROM "AthleteSessionCompletion" WHERE "athleteId"='athlete-a'`)).rows, [{ rating: "5", note: "Synthetic" }]);
    });

    await t.test("unassigned items are discarded; another athlete's rows are preserved", async () => {
      await persist({ sessionId: "session-a", exercises: [{ exerciseId: "unassigned", completed: true, rating: null, note: null }], dives: [] }, "athlete-a", blocks);
      assert.equal((await db.query(`SELECT * FROM "AthleteExerciseLog" WHERE "exerciseId"='unassigned'`)).rows.length, 0);
      assert.deepEqual((await db.query(`SELECT completed,note FROM "AthleteExerciseLog" WHERE "athleteId"='athlete-b'`)).rows, [{ completed: false, note: "untouched" }]);
      assert.deepEqual((await db.query(`SELECT "repetitionsCompleted",note FROM "AthleteDiveLog" WHERE "athleteId"='athlete-b'`)).rows, [{ repetitionsCompleted: 9, note: "untouched" }]);
    });

    await t.test("completion callback remains atomic with the deduplicated writes", async () => {
      await assert.rejects(persist({ ...payload, sessionFeedback: { rating: "1", note: "rolled back" } }, "athlete-a", blocks, async () => { throw new Error("synthetic callback failure"); }), /synthetic callback failure/);
      assert.deepEqual((await db.query(`SELECT completed,note FROM "AthleteExerciseLog" WHERE "athleteId"='athlete-a'`)).rows, [{ completed: false, note: "latest" }]);
      assert.deepEqual((await db.query(`SELECT rating,note FROM "AthleteSessionCompletion" WHERE "athleteId"='athlete-a'`)).rows, [{ rating: "5", note: "Synthetic" }]);
    });

    await t.test("replayed saves and finalization preserve one row and completed status", async () => {
      await persist(payload, "athlete-a", blocks);
      await persist(payload, "athlete-a", blocks);
      let callbacks = 0;
      const result = await persist(payload, "athlete-a", blocks, async (tx) => {
        callbacks++;
        await tx.query(`UPDATE "AthleteSessionCompletion" SET status='COMPLETED' WHERE "athleteId"=$1 AND "sessionId"=$2`, ["athlete-a", "session-a"]);
        return "completed";
      });
      assert.equal(result, "completed");
      assert.equal(callbacks, 1);
      await persist({ ...payload, sessionFeedback: undefined }, "athlete-a", blocks);
      assert.equal((await db.query(`SELECT * FROM "AthleteExerciseLog" WHERE "athleteId"='athlete-a'`)).rows.length, 1);
      assert.deepEqual((await db.query(`SELECT status,rating,note FROM "AthleteSessionCompletion" WHERE "athleteId"='athlete-a'`)).rows,
        [{ status: "COMPLETED", rating: "5", note: "Synthetic" }]);
    });
    t.diagnostic("Synthetic: two repeated exercise snapshots -> one stored row; 2 SQL writes, no added query. No production timing/transfer measurement.");
  } finally { await db.close(); }
});
