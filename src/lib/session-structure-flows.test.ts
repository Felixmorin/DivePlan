import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { z } from "zod";
import type { SessionTemplatePayload } from "./session-template";
import { replaceSessionStructure } from "./session-structure";
import * as timezone from "./timezone";

test("form, draft and template flows share the transactional session-structure writer", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE "TrainingGroup" (id text PRIMARY KEY, "clubId" text NOT NULL);
      CREATE TABLE "Athlete" (id text PRIMARY KEY, "clubId" text NOT NULL, "groupId" text NOT NULL, active boolean NOT NULL);
      CREATE TABLE "DrylandExercise" (
        id text PRIMARY KEY,
        "defaultSets" integer,
        "defaultReps" integer,
        "defaultDuration" integer,
        "roundTrip" boolean NOT NULL,
        "archivedAt" timestamp
      );
      CREATE TABLE "TrainingWeek" (
        id text PRIMARY KEY,
        "clubId" text NOT NULL,
        "groupId" text NOT NULL,
        "startDate" timestamp NOT NULL,
        title text NOT NULL,
        status text NOT NULL
      );
      CREATE TABLE "TrainingSession" (
        id text PRIMARY KEY,
        date timestamp NOT NULL,
        title text NOT NULL,
        duration integer NOT NULL,
        notes text,
        "weekId" text NOT NULL REFERENCES "TrainingWeek"(id),
        "coachId" text NOT NULL,
        status text NOT NULL,
        "competitionEvaluationAtStart" boolean NOT NULL,
        "planningEventId" text
      );
      CREATE TABLE "SessionBlock" (
        id text PRIMARY KEY,
        "sessionId" text NOT NULL REFERENCES "TrainingSession"(id) ON DELETE CASCADE,
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
        "exerciseId" text NOT NULL REFERENCES "DrylandExercise"(id),
        sets integer,
        reps integer,
        duration integer,
        notes text,
        "order" integer NOT NULL,
        PRIMARY KEY ("blockId", "order")
      );
      CREATE TABLE "PoolTraining" ("blockId" text PRIMARY KEY REFERENCES "SessionBlock"(id) ON DELETE CASCADE);
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
      CREATE TABLE "CoachAthleteSessionNote" (
        "sessionId" text NOT NULL REFERENCES "TrainingSession"(id) ON DELETE CASCADE,
        "athleteId" text NOT NULL,
        note text NOT NULL,
        "updatedAt" timestamp NOT NULL,
        PRIMARY KEY ("sessionId", "athleteId")
      );
      CREATE TABLE "AthleteSessionCompletion" ("sessionId" text, "startedAt" timestamp, status text);
      CREATE TABLE "AthleteDiveLog" ("sessionId" text);
      CREATE TABLE "AthleteExerciseLog" ("sessionId" text);
      INSERT INTO "TrainingGroup" VALUES ('group-a', 'club-a');
      INSERT INTO "Athlete" VALUES ('athlete-a', 'club-a', 'group-a', true), ('athlete-b', 'club-a', 'group-a', true);
      INSERT INTO "DrylandExercise" VALUES ('exercise-a', 3, 8, NULL, false, NULL);
    `);

    let pendingQuery = Promise.resolve();
    const query = <T extends Record<string, unknown> = Record<string, unknown>>(sql: string, values?: unknown[]) => {
      const result = pendingQuery.then(() => db.query<T>(sql, values));
      pendingQuery = result.then(() => undefined, () => undefined);
      return result;
    };
    const transaction = async <T>(callback: (tx: { query: typeof query }) => Promise<T>) => {
      await db.exec("BEGIN");
      try {
        const value = await callback({ query });
        await db.exec("COMMIT");
        return value;
      } catch (error) {
        await db.exec("ROLLBACK");
        throw error;
      }
    };
    const sessionStructure = { replaceSessionStructure };
    const templateExports: Record<string, unknown> = {};
    runInNewContext(ts.transpileModule(readFileSync("src/lib/session-template.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText, {
      exports: templateExports,
      require: (name: string) => {
        const dependencies: Record<string, unknown> = {
          "node:crypto": { randomUUID },
          zod: { z },
          "@/lib/db": { query },
          "@/lib/timezone": timezone,
          "./session-structure": sessionStructure
        };
        assert.ok(name in dependencies, `Unexpected template dependency: ${name}`);
        return dependencies[name];
      }
    });

    const actionExports: Record<string, unknown> = {};
    const actionDependencies: Record<string, unknown> = {
      crypto: { randomInt, randomUUID },
      "node:crypto": { randomUUID },
      "next/cache": { revalidatePath: () => {} },
      "next/navigation": { redirect: () => {} },
      zod: { z },
      "@/lib/current-user": { requireCoach: async () => ({ user: { id: "coach-user" }, coach: { id: "coach-a" }, clubId: "club-a" }) },
      "@/lib/monitoring": { trackEvent: async () => {} },
      "@/lib/password": { hashPassword: async () => "unused" },
      "@/lib/db": { query, withTransaction: transaction },
      "@/lib/timezone": timezone,
      "@/lib/web-push": {
        dispatchSessionCancellation: async () => {}, dispatchSessionPublication: async () => {}, dispatchSessionUpdate: async () => {},
        isAutomaticSessionPushEnabled: () => false, saveSessionCancellationTargets: async () => {}, saveSessionPublicationTargets: async () => {}, saveSessionUpdateTargets: async () => {}
      },
      "@/lib/session-status": { completeSessionIfAllAthletesAreDone: async () => {} },
      "@/lib/pool-list": { countPoolContexts: () => 1, validatePoolListRow: () => true },
      "@/lib/session-template": { ...templateExports, getSessionSnapshot: async (id: string) => ({ id, status: "DRAFT" }) },
      "@/lib/session-structure": sessionStructure
    };
    runInNewContext(ts.transpileModule(readFileSync("src/app/coach/sessions/actions.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText, {
      exports: actionExports,
      require: (name: string) => {
        assert.ok(name in actionDependencies, `Unexpected action dependency: ${name}`);
        return actionDependencies[name];
      }
    });

    const builderInput = (title: string, hasWarmup: boolean, hasPool: boolean) => ({
      title,
      date: "2026-10-29",
      time: "10:00",
      groupId: "group-a",
      duration: 45,
      notes: "Session notes",
      coachAthleteNotes: {},
      evaluationPlacement: "none",
      status: "DRAFT",
      warmup: { enabled: hasWarmup, competitionEvaluation: false, title: "Activation", duration: 5, description: "  warmup  " },
      cooldown: { enabled: true, competitionEvaluation: false, title: "Reset", duration: 5, description: "  cooldown  " },
      drylandBlocks: [{
        competitionEvaluation: false,
        title: "Strength",
        duration: 15,
        exerciseIds: ["exercise-a"],
        athleteIds: ["athlete-a"],
        exerciseOverrides: { "exercise-a": { sets: 2, reps: 4, duration: null, notes: "controlled" } }
      }],
      poolBlocks: hasPool ? [{
        competitionEvaluation: false,
        title: "Entries",
        duration: 20,
        athleteIds: ["athlete-b"],
        sections: [{ height: "ONE_METER", label: null, dives: [{ diveCode: "101A", diveName: "Forward dive", position: "straight", repetitions: 5, notes: null, order: 0 }] }]
      }] : []
    });

    await (actionExports.createTrainingSession as (input: unknown) => Promise<void>)(builderInput("Form session", true, true));
    const created = (await query<{ id: string }>(`SELECT id FROM "TrainingSession" WHERE title = 'Form session'`)).rows[0];
    assert.ok(created);
    assert.deepEqual((await query(`SELECT type, title, position, description FROM "SessionBlock" WHERE "sessionId" = $1 ORDER BY position`, [created.id])).rows, [
      { type: "WARMUP", title: "Activation", position: 1, description: "warmup" },
      { type: "DRYLAND", title: "Strength", position: 2, description: null },
      { type: "POOL", title: "Entries", position: 3, description: null },
      { type: "COOLDOWN", title: "Reset", position: 99, description: "cooldown" }
    ]);
    assert.deepEqual((await query(`SELECT sets, reps, notes FROM "DrylandBlockExercise"`)).rows, [{ sets: 2, reps: 4, notes: "controlled" }]);
    assert.equal((await query(`SELECT 1 FROM "PoolDive" WHERE "diveCode" = '101A'`)).rows.length, 1);

    await (actionExports.updateDraftSessionFromBuilder as (id: string, input: unknown) => Promise<void>)(created.id, builderInput("Updated draft", false, false));
    assert.deepEqual((await query(`SELECT type, title, position FROM "SessionBlock" WHERE "sessionId" = $1 ORDER BY position`, [created.id])).rows, [
      { type: "DRYLAND", title: "Strength", position: 2 },
      { type: "COOLDOWN", title: "Reset", position: 99 }
    ]);
    assert.equal((await query(`SELECT 1 FROM "PoolDive"`)).rows.length, 0);
    assert.equal((await query(`SELECT title FROM "TrainingSession" WHERE id = $1`, [created.id])).rows[0].title, "Updated draft");

    const payload: SessionTemplatePayload = {
      version: 1, competitionEvaluationAtStart: false, title: "Template session", duration: 40, notes: null,
      blocks: [
        {
          type: "DRYLAND", title: "Template strength", description: null, duration: 10, position: 1,
          estimatedVolume: 8, competitionEvaluation: false, athleteIds: ["athlete-a", "outside-club"],
          drylandExercises: [
            { exerciseId: "exercise-a", sets: 1, reps: 8, duration: null, notes: null, order: 0 },
            { exerciseId: "missing-exercise", sets: 1, reps: 1, duration: null, notes: null, order: 1 }
          ],
          poolTraining: null
        },
        {
          type: "POOL", title: "Template pool", description: null, duration: 20, position: 2,
          estimatedVolume: 3, competitionEvaluation: false, athleteIds: ["athlete-b"], drylandExercises: [],
          poolTraining: { sections: [{ height: "THREE_METER", label: null, dives: [{ diveCode: "301A", diveName: "Reverse dive", position: "straight", repetitions: 3, notes: null, order: 0 }] }] }
        }
      ]
    };
    const templateSession = await transaction((tx) => (templateExports.createSessionFromPayload as (tx: typeof query, data: unknown) => Promise<{ id: string }>)({ ...tx } as never, {
      clubId: "club-a", coachId: "coach-a", groupId: "group-a", date: new Date("2026-10-29T10:00:00Z"),
      title: payload.title, duration: payload.duration, notes: payload.notes, payload, status: "DRAFT"
    }));
    assert.deepEqual((await query(`SELECT type, title FROM "SessionBlock" WHERE "sessionId" = $1 ORDER BY position`, [templateSession.id])).rows, [
      { type: "DRYLAND", title: "Template strength" },
      { type: "POOL", title: "Template pool" }
    ]);
    assert.deepEqual((await query(`SELECT "athleteId" FROM "SessionBlockAssignment" a JOIN "SessionBlock" b ON b.id=a."sessionBlockId" WHERE b."sessionId"=$1 ORDER BY "athleteId"`, [templateSession.id])).rows, [
      { athleteId: "athlete-a" }, { athleteId: "athlete-b" }
    ]);
    assert.deepEqual((await query(`SELECT "exerciseId" FROM "DrylandBlockExercise" d JOIN "SessionBlock" b ON b.id=d."blockId" WHERE b."sessionId"=$1`, [templateSession.id])).rows, [
      { exerciseId: "exercise-a" }
    ]);
    assert.equal((await query(`SELECT 1 FROM "PoolDive" WHERE "diveCode" = '301A'`)).rows.length, 1);
  } finally {
    await db.close();
  }
});
