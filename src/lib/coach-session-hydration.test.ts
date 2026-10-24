import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import type { CoachSession } from "./coach-session";

// Run the actual getCoachSession SQL with synthetic rows. Auth, the snapshot
// loader and due-session mutations are controlled at their module boundaries.
test("batched session hydration preserves rows and isolation with two detail queries", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE "SyntheticSession" (id text, "clubId" text);
      CREATE TABLE "TrainingGroup" (id text, name text, "clubId" text, "coachId" text);
      CREATE TABLE "TrainingWeek" (id text, "groupId" text);
      CREATE TABLE "User" (id text, "firstName" text, "lastName" text, avatar text);
      CREATE TABLE "Athlete" (id text, "userId" text);
      CREATE TABLE "SessionBlockAssignment" (id text, "sessionBlockId" text, "athleteId" text);
      CREATE TABLE "DrylandExercise" (id text, name text, category text, description text, equipment text,
        "defaultSets" integer, "defaultReps" integer, "defaultDuration" integer, "roundTrip" boolean, tags text[]);
      CREATE TABLE "DrylandBlockExercise" ("blockId" text, "exerciseId" text, sets integer, reps integer, duration integer, notes text, "order" integer);
      CREATE TABLE "AthleteSessionCompletion" ("athleteId" text, "sessionId" text, status text, "startedAt" timestamp, "completedAt" timestamp, rating text, note text);
      CREATE TABLE "AthleteSessionAbsence" ("sessionId" text, "athleteId" text);
      CREATE TABLE "PoolDive" (id text, "diveCode" text, "diveName" text);
      CREATE TABLE "AthleteDiveLog" (id text, "athleteId" text, "sessionId" text, "poolDiveId" text, "familyOverride" text,
        "actualDiveCode" text, "repetitionsCompleted" integer, "goldenRepetitions" integer, rating text, note text, timestamp timestamp);
      CREATE TABLE "AthleteExerciseLog" (id text, "athleteId" text, "sessionId" text, "exerciseId" text, completed boolean, rating text, note text);
      INSERT INTO "SyntheticSession" VALUES ('session', 'club-a'), ('empty', 'club-a');
      INSERT INTO "TrainingGroup" VALUES ('group', 'Synthetic', 'club-a', 'coach');
      INSERT INTO "TrainingWeek" VALUES ('week', 'group');
      INSERT INTO "User" VALUES ('user-a', 'Alpha', 'Test', 'data:image/png;base64,SYNTHETIC'), ('user-b', 'Beta', 'Test', 'storage:synthetic-avatar');
      INSERT INTO "Athlete" VALUES ('athlete-a', 'user-a'), ('athlete-b', 'user-b');
      INSERT INTO "DrylandExercise" VALUES ('exercise-a', 'Gainage', 'Tronc', 'Synthetic description', NULL, 2, 5, NULL, false, ARRAY['test']),
        ('exercise-b', 'Sauts', 'Jambes', 'Synthetic description', NULL, 3, 4, NULL, true, ARRAY['test']);
      INSERT INTO "PoolDive" VALUES ('dive', '101A', 'Synthetic dive');
      INSERT INTO "AthleteSessionCompletion" VALUES ('athlete-a', 'session', 'COMPLETED', NOW(), NOW(), 'GOOD', 'Synthetic message');
      INSERT INTO "AthleteSessionAbsence" VALUES ('session', 'athlete-b');
      INSERT INTO "AthleteDiveLog" VALUES ('log', 'athlete-a', 'session', 'dive', NULL, '101B', 4, 2, 'GOOD', 'Synthetic note', NOW());
      INSERT INTO "AthleteExerciseLog" VALUES ('exercise-log', 'athlete-a', 'session', 'exercise-a', true, 'GOOD', 'Synthetic feedback');
      INSERT INTO "SessionBlockAssignment" VALUES ('foreign', 'foreign-block', 'athlete-b');
      INSERT INTO "DrylandBlockExercise" VALUES ('foreign-block', 'exercise-a', 99, 99, NULL, 'foreign', 0);
    `);
    const blocks = Array.from({ length: 12 }, (_, i) => ({ id: `block-${i}`, position: i, title: `Block ${i}`, assignments: [], drylandExercises: [], poolTraining: null }));
    for (const block of blocks) {
      await db.query(`INSERT INTO "SessionBlockAssignment" VALUES ($1,$2,'athlete-a'),($3,$2,'athlete-b')`, [`${block.id}-a`, block.id, `${block.id}-b`]);
      // Insert out of order; the returned exercise order must remain explicit.
      await db.query(`INSERT INTO "DrylandBlockExercise" VALUES ($1,'exercise-b',3,4,NULL,'second',1),($1,'exercise-a',2,5,NULL,'first',0)`, [block.id]);
    }
    let clubId = "club-a";
    let authorized = true;
    const queries: Array<{ sql: string; values: unknown[] }> = [];
    const snapshot = { id: "session", weekId: "week", notes: "Synthetic summary", status: "COMPLETED", week: {}, blocks };
    const dependencies: Record<string, unknown> = {
      "next/navigation": { notFound: () => { throw new Error("NOT_FOUND"); } },
      "@/lib/current-user": { requireCoach: async () => {
        if (!authorized) throw new Error("FORBIDDEN");
        return { clubId };
      } },
      "@/lib/session-status": { startDueTrainingSessions: async () => {} },
      "@/lib/session-template": { getSessionSnapshot: async (id: string, club: string) => {
        const { rows } = await db.query(`SELECT id FROM "SyntheticSession" WHERE id=$1 AND "clubId"=$2`, [id, club]);
        return rows.length ? { ...snapshot, id, blocks: id === "empty" ? [] : blocks } : null;
      } },
      "@/lib/db": { query: async (sql: string, values: unknown[]) => {
        queries.push({ sql, values });
        return db.query(sql, values);
      } }
    };
    const exports: { getCoachSession?: (id: string) => Promise<CoachSession> } = {};
    runInNewContext(ts.transpileModule(readFileSync("src/lib/coach-session.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText, { exports, require: (name: string) => {
      assert.ok(name in dependencies, `Unexpected dependency ${name}`);
      return dependencies[name];
    } });
    const get = exports.getCoachSession!;
    const result = await get("session");
    const detailQueries = queries.filter(({ sql }) => /FROM "SessionBlockAssignment"|FROM "DrylandBlockExercise"/.test(sql));
    assert.equal(detailQueries.length, 2, "detail reads do not grow with the number of blocks");
    assert.equal(result.blocks.length, 12);
    for (const block of result.blocks) {
      assert.deepEqual(Array.from(block.assignments, (item) => item.athleteId), ["athlete-a", "athlete-b"]);
      assert.deepEqual(Array.from(block.drylandExercises, (item) => item.exerciseId), ["exercise-a", "exercise-b"]);
      assert.equal(block.assignments[0].athlete.user.avatar, null, "inline avatars remain filtered");
      assert.equal(block.assignments[1].athlete.user.avatar, "storage:synthetic-avatar");
      // Recreate the previous two single-block reads with the same SQL and rows.
      for (const { sql } of detailQueries) {
        const legacySql = sql.replace("=ANY($1::text[])", "=$1");
        const { rows } = await db.query<Record<string, Record<string, unknown>>>(legacySql, [block.id]);
        const expected = rows.map((r) => r.assignment
          ? { ...r.assignment, athlete: { ...r.athlete, user: r.user } }
          : { ...r.item, exercise: r.exercise });
        const actual = sql.includes('FROM "SessionBlockAssignment"') ? block.assignments : block.drylandExercises;
        assert.equal(JSON.stringify(actual), JSON.stringify(expected), "hydrated rows match single-block reads");
      }
    }
    assert.equal(result.diveLogs[0].repetitionsCompleted, 4);
    assert.equal(result.diveLogs[0].goldenRepetitions, 2);
    assert.equal(result.diveLogs[0].actualDiveCode, "101B");
    assert.equal(result.diveLogs[0].note, "Synthetic note");
    assert.equal(result.completions[0].note, "Synthetic message");
    assert.equal(result.exerciseLogs[0].completed, true);
    assert.equal(result.absences[0].athleteId, "athlete-b");
    assert.doesNotMatch(JSON.stringify(result), /foreign/);
    t.diagnostic(`Synthetic: ${blocks.length} blocks, identical detail rows; hydration SELECTs ${blocks.length * 2} -> ${detailQueries.length}. Snapshot and other queries excluded; no measured latency, egress or FOT gain.`);

    queries.length = 0;
    assert.equal((await get("empty")).blocks.length, 0);
    assert.equal(queries.filter(({ sql }) => /FROM "SessionBlockAssignment"|FROM "DrylandBlockExercise"/.test(sql)).length, 0);
    queries.length = 0;
    clubId = "club-b";
    await assert.rejects(get("session"), /NOT_FOUND/);
    assert.equal(queries.length, 0, "no detail reads for a session outside the club");
    clubId = "club-a";
    authorized = false;
    await assert.rejects(get("session"), /FORBIDDEN/);
    assert.equal(queries.length, 0);
  } finally { await db.close(); }
});
