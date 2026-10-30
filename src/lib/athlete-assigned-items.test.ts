import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { PGlite } from "@electric-sql/pglite";
import ts from "typescript";
import type * as Progress from "./athlete-progress";

test("save authorization loads only assigned item IDs and preserves the session status rules", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE "TrainingSession" (id text PRIMARY KEY, "clubId" text, status text);
      CREATE TABLE "SessionBlock" (id text PRIMARY KEY, "sessionId" text, type text, title text, description text,
        duration int, position int, "estimatedVolume" int, "competitionEvaluation" boolean);
      CREATE TABLE "SessionBlockAssignment" ("sessionBlockId" text, "athleteId" text, PRIMARY KEY ("sessionBlockId","athleteId"));
      CREATE TABLE "DrylandBlockExercise" ("blockId" text, "exerciseId" text, sets int, reps int, duration int, notes text, "order" int, PRIMARY KEY ("blockId","order"));
      CREATE TABLE "PoolTraining" ("blockId" text PRIMARY KEY);
      CREATE TABLE "PoolSection" (id text PRIMARY KEY, "poolTrainingId" text, height text, label text, "order" int);
      CREATE INDEX ON "PoolSection" ("poolTrainingId","order");
      CREATE TABLE "PoolDive" (id text PRIMARY KEY, "poolSectionId" text, "diveCode" text, "diveName" text, position text, repetitions int, notes text, "order" int);
      CREATE TABLE "AthleteExerciseLog" (id text PRIMARY KEY, "athleteId" text, "sessionId" text, "exerciseId" text,
        completed boolean, rating text, note text, UNIQUE ("athleteId","sessionId","exerciseId"));
      CREATE TABLE "AthleteDiveLog" (id text PRIMARY KEY, "athleteId" text, "sessionId" text, "poolDiveId" text,
        "repetitionsCompleted" int, "goldenRepetitions" int, "feedbackCompleted" boolean, rating text, note text,
        timestamp timestamptz, UNIQUE ("athleteId","sessionId","poolDiveId"));
      CREATE TABLE "AthleteSessionCompletion" ("sessionId" text, "athleteId" text, status text, "startedAt" timestamptz,
        rating text, note text, UNIQUE ("athleteId","sessionId"));
      INSERT INTO "TrainingSession" VALUES ('session-a','club-a','READY'),('session-b','club-b','READY');
      INSERT INTO "SessionBlock" VALUES
        ('mixed','session-a','DRYLAND','Synthetic mixed',repeat('Description ',100),15,0,10,false),
        ('empty','session-a','CUSTOM','Synthetic empty',NULL,5,1,0,false),
        ('other','session-a','POOL','Unassigned',NULL,10,2,3,false),
        ('foreign','session-b','POOL','Other club',NULL,10,0,3,false);
      INSERT INTO "SessionBlockAssignment" VALUES ('mixed','athlete-a'),('empty','athlete-a'),('mixed','peer-a'),
        ('other','peer-a'),('foreign','athlete-b');
      INSERT INTO "DrylandBlockExercise" VALUES ('mixed','exercise-a',3,10,NULL,repeat('Note ',100),0),
        ('mixed','exercise-b',3,10,NULL,NULL,1),('other','exercise-private',3,10,NULL,NULL,0);
      INSERT INTO "PoolTraining" VALUES ('mixed'),('other'),('foreign');
      INSERT INTO "PoolSection" VALUES ('section-a','mixed','ONE_METER','1 m',0),('section-2','mixed','THREE_METER','3 m',1),
        ('section-private','other','ONE_METER',NULL,0),('section-b','foreign','ONE_METER',NULL,0);
      INSERT INTO "PoolDive" VALUES ('dive-a','section-a','101A','Forward dive','A',5,repeat('Dive note ',100),0),
        ('dive-2','section-2','201A','Back dive','A',5,NULL,0),
        ('dive-private','section-private','301A','Reverse dive','A',5,NULL,0),
        ('dive-b','section-b','401A','Inward dive','A',5,NULL,0);
    `);
    let reads = 0;
    let bytes = 0;
    const query = async (sql: string, values: unknown[]) => {
      reads++;
      const result = await db.query(sql, values);
      bytes += Buffer.byteLength(JSON.stringify(result.rows));
      return result;
    };
    const dependencies: Record<string, unknown> = {
      "node:crypto": { randomUUID }, "@/lib/db": { query,
        withTransaction: (callback: (tx: unknown) => Promise<unknown>) => db.transaction((tx) => callback(tx)) }
    };
    const exports: Partial<typeof Progress> = {};
    runInNewContext(ts.transpileModule(readFileSync("src/lib/athlete-progress.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText, { exports, Date, require: (name: string) => { assert.ok(name in dependencies); return dependencies[name]; } });
    const get = exports.getAssignedSessionBlocks!;
    const blocks = await get("session-a", "athlete-a");
    assert.equal(reads, 1, "one SQL statement regardless of block count");
    const actual = JSON.parse(JSON.stringify(blocks));
    actual.sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id));
    for (const block of actual) { block.exerciseIds.sort(); block.diveIds.sort(); }
    assert.deepEqual(actual, [
      { id: "empty", exerciseIds: [], diveIds: [] },
      { id: "mixed", exerciseIds: ["exercise-a", "exercise-b"], diveIds: ["dive-2", "dive-a"] }
    ]);
    t.diagnostic(`Synthetic authorization: ${reads} SQL read, ${bytes} bytes of result rows represented as JSON; no browser/FOT measurement.`);

    await t.test("notes and parameters do not affect the authorization payload", async () => {
      const before = bytes;
      await db.exec(`UPDATE "SessionBlock" SET description=repeat('D',100000);
        UPDATE "DrylandBlockExercise" SET notes=repeat('N',100000), reps=99;
        UPDATE "PoolDive" SET notes=repeat('N',100000), repetitions=99;`);
      assert.deepEqual(await get("session-a", "athlete-a"), blocks);
      assert.equal(bytes - before, before);
    });

    await t.test("users and clubs remain isolated without a shared cache", async () => {
      assert.equal((await get("session-a", "peer-a")).length, 2);
      assert.equal((await get("session-a", "athlete-b")).length, 0);
      assert.equal((await get("session-b", "athlete-a")).length, 0);
      assert.equal((await get("session-a", "unknown")).length, 0);
      assert.equal((await get("missing", "athlete-a")).length, 0);
      assert.equal((await get("session-b", "athlete-b"))[0].diveIds[0], "dive-b");
      await db.exec(`DELETE FROM "SessionBlockAssignment" WHERE "athleteId"='athlete-a' AND "sessionBlockId"='empty'`);
      assert.equal((await get("session-a", "athlete-a")).length, 1, "assignment revocation is observed on the next save");
    });

    await t.test("schedule closure permits only athletes who already started or completed", async () => {
      for (const status of ["DRAFT", "ARCHIVED", "COMPLETED"]) {
        await db.query(`UPDATE "TrainingSession" SET status=$1 WHERE id='session-a'`, [status]);
        assert.equal((await get("session-a", "athlete-a")).length, 0);
      }
      for (const status of ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"]) {
        await db.query(`INSERT INTO "AthleteSessionCompletion" ("sessionId","athleteId",status) VALUES ('session-a','athlete-a',$1)
          ON CONFLICT ("sessionId","athleteId") DO UPDATE SET status=EXCLUDED.status`, [status]);
        assert.equal((await get("session-a", "athlete-a")).length, status === "NOT_STARTED" ? 0 : 1);
        assert.equal((await get("session-a", "peer-a")).length, 0, "another athlete's completion cannot grant access");
      }
      await db.exec(`UPDATE "TrainingSession" SET status='IN_PROGRESS' WHERE id='session-a'`);
      assert.equal((await get("session-a", "peer-a")).length, 2);
    });

    await t.test("personal note action uses the reduced IDs and blocks another athlete's dives", async () => {
      await db.exec(`CREATE TABLE "AthleteDiveNote" ("athleteId" text, "poolDiveId" text, note text,
        "createdAt" timestamptz, "updatedAt" timestamptz, UNIQUE ("athleteId","poolDiveId"));`);
      // Execute the real action without its unrelated module dependencies.
      const file = ts.createSourceFile("actions.ts", readFileSync("src/app/athlete/session/[id]/actions.ts", "utf8"), ts.ScriptTarget.Latest, true);
      const action = file.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "saveAthleteDiveNote");
      assert.ok(action);
      let athlete: { id: string } | null = { id: "athlete-a" };
      const actions: { saveAthleteDiveNote?: (sessionId: string, diveId: string, note: string) => Promise<void> } = {};
      runInNewContext(ts.transpileModule(action.getText(file), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
        exports: actions, getCurrentAthlete: async () => athlete, getAssignedSessionBlocks: get, query,
        diveNoteSchema: { parse: (value: unknown) => value }, revalidatePath() {}
      });
      const save = actions.saveAthleteDiveNote!;
      await save("session-a", "dive-a", "Synthetic note");
      assert.deepEqual((await db.query(`SELECT "athleteId","poolDiveId",note FROM "AthleteDiveNote"`)).rows,
        [{ athleteId: "athlete-a", poolDiveId: "dive-a", note: "Synthetic note" }]);
      await assert.rejects(save("session-a", "dive-private", "denied"), /accessible/);
      await assert.rejects(save("session-b", "dive-b", "denied"), /accessible/);
      await save("session-a", "dive-a", "");
      assert.equal((await db.query(`SELECT * FROM "AthleteDiveNote"`)).rows.length, 0);
      athlete = null;
      await assert.rejects(save("session-a", "dive-a", "denied"), /Aucun athlete/);
    });

    await t.test("real persistence retains reps, golden reps and feedback and rejects unassigned items", async () => {
      await exports.persistAthleteProgress!({ sessionId: "session-a", exercises: [
        { exerciseId: "exercise-a", completed: true, rating: null, note: null },
        { exerciseId: "exercise-private", completed: true, rating: null, note: null }
      ], dives: ["dive-a", "dive-private", "dive-b"].map((id) => ({ poolDiveId: id,
        repetitionsCompleted: 8, goldenRepetitions: 2, feedbackCompleted: true, rating: "bien", note: "Synthetic" })),
      sessionFeedback: { rating: "5", note: "Synthetic final" } }, "athlete-a", await get("session-a", "athlete-a"));
      assert.deepEqual((await db.query(`SELECT "exerciseId",completed FROM "AthleteExerciseLog"`)).rows,
        [{ exerciseId: "exercise-a", completed: true }]);
      assert.deepEqual((await db.query(`SELECT "poolDiveId","repetitionsCompleted","goldenRepetitions","feedbackCompleted",rating,note FROM "AthleteDiveLog"`)).rows,
        [{ poolDiveId: "dive-a", repetitionsCompleted: 8, goldenRepetitions: 2, feedbackCompleted: true, rating: "bien", note: "Synthetic" }]);
      assert.deepEqual((await db.query(`SELECT status,rating,note FROM "AthleteSessionCompletion" WHERE "athleteId"='athlete-a'`)).rows,
        [{ status: "COMPLETED", rating: "5", note: "Synthetic final" }]);
    });
  } finally { await db.close(); }
});
