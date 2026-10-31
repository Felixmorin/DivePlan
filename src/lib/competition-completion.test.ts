import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { z } from "zod";
import type { CompleteSessionPayload } from "@/app/athlete/session/[id]/actions";

test("completion requires the actual active-list evaluations, not every stored list", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "TrainingSession" (id text PRIMARY KEY, status text, "competitionEvaluationAtStart" boolean);
      CREATE TABLE "SessionBlock" (id text PRIMARY KEY, "sessionId" text, "competitionEvaluation" boolean);
      CREATE TABLE "SessionBlockAssignment" ("sessionBlockId" text, "athleteId" text);
      CREATE TABLE "AthleteSessionCompletion" ("sessionId" text, "athleteId" text, status text);
      CREATE TABLE "CompetitionDiveList" (id text PRIMARY KEY, "athleteId" text, position int);
      CREATE TABLE "CompetitionDive" (id text PRIMARY KEY, "listId" text REFERENCES "CompetitionDiveList"(id), "athleteId" text, "diveCode" text, height text);
      CREATE TABLE "AthleteCompetitionDiveEvaluation" (id text PRIMARY KEY, "athleteId" text, "sessionId" text, "competitionDiveId" text,
        "diveCode" text, height text, rating int, evaluator text, "evaluatedAt" timestamptz,
        UNIQUE ("athleteId","sessionId","competitionDiveId"));
      INSERT INTO "TrainingSession" VALUES ('session-a','IN_PROGRESS',true);
      INSERT INTO "SessionBlock" VALUES ('block-a','session-a',true);
      INSERT INTO "SessionBlockAssignment" VALUES ('block-a','athlete-a');
      INSERT INTO "AthleteSessionCompletion" VALUES ('session-a','athlete-a','IN_PROGRESS');
      INSERT INTO "CompetitionDiveList" VALUES ('active','athlete-a',0),('secondary','athlete-a',1),('foreign','athlete-b',0);
      INSERT INTO "CompetitionDive" VALUES ('active-1','active','athlete-a','101A','ONE_METER'),
        ('active-2','active','athlete-a','201A','ONE_METER'),('secondary-1','secondary','athlete-a','301A','THREE_METER'),
        ('foreign-1','foreign','athlete-b','401A','ONE_METER');`);
    const file = ts.createSourceFile("actions.ts", readFileSync("src/app/athlete/session/[id]/actions.ts", "utf8"), ts.ScriptTarget.Latest, true);
    const nodes = file.statements.filter(node => (ts.isFunctionDeclaration(node) && ["saveCompetitionDiveEvaluation", "completeAthleteSession"].includes(node.name?.text ?? ""))
      || (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText(file) === "competitionEvaluationSchema")));
    assert.equal(nodes.length, 3);
    let authenticated = true;
    let assigned = true;
    let forwarded: { payload: CompleteSessionPayload; athleteId: string } | null = null;
    let validationReads = 0;
    const payload: CompleteSessionPayload = { sessionId: "session-a", exercises: [{ exerciseId: "exercise-a", completed: true, rating: null, note: "Synthetic exercise" }],
      dives: [{ poolDiveId: "pool-a", repetitionsCompleted: 7, goldenRepetitions: 2, feedbackCompleted: true, rating: "bien", note: "Synthetic dive" }],
      sessionFeedback: { rating: "Bien", note: "Synthetic feedback" } };
    const exports: { saveCompetitionDiveEvaluation?: (input: unknown) => Promise<void>; completeAthleteSession?: (input: CompleteSessionPayload) => Promise<unknown> } = {};
    runInNewContext(ts.transpileModule(nodes.map(n => n.getText(file)).join("\n"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText, {
      exports, z, Date, randomUUID,
      getCurrentAthlete: async () => authenticated ? { id: "athlete-a", clubId: "club-a", userId: "user-a", user: { firstName: "Synthetic", lastName: "Athlete" } } : null,
      getAssignedSessionBlocks: async () => assigned ? [{ id: "block-a", exerciseIds: ["exercise-a"], diveIds: ["pool-a"] }] : [],
      query: (sql: string, args: unknown[]) => { validationReads++; return db.query(sql, args); },
      withTransaction: (callback: (tx: unknown) => Promise<unknown>) => db.transaction(tx => callback(tx)),
      assertSessionStartAvailable: async () => {},
      persistAthleteProgress: async (input: CompleteSessionPayload, athleteId: string, _blocks: unknown, callback: unknown) => {
        assert.equal(typeof callback, "function"); forwarded = { payload: input, athleteId }; return [];
      },
      revalidatePath: () => {}, trackEvent: async () => {}, getClubMilestones: async () => []
    });
    const complete = () => { forwarded = null; return exports.completeAthleteSession!(payload); };
    const reject = async () => { await assert.rejects(complete(), /Réponds à tous/); assert.equal(forwarded, null); };
    const original = JSON.stringify(payload);
    await t.test("saving both displayed dives allows completion despite the secondary list", async () => {
      await exports.saveCompetitionDiveEvaluation!({ sessionId: "session-a", ratings: [
        { competitionDiveId: "active-1", rating: 4 }, { competitionDiveId: "active-2", rating: 5 }
      ] });
      validationReads = 0;
      try { await complete(); } finally { t.diagnostic(`Synthetic completion validation reads: ${validationReads}; no production measurement.`); }
      assert.deepEqual(forwarded, { payload, athleteId: "athlete-a" });
      assert.equal(validationReads, 2, "one activation check and one active-list completeness query");
      assert.equal((await db.query(`SELECT * FROM "AthleteCompetitionDiveEvaluation"`)).rows.length, 2);
      assert.equal(JSON.stringify(payload), original, "repetitions, golden reps, feedback and notes are forwarded unchanged");
    });
    await t.test("another list, athlete, session or evaluator cannot replace a missing active dive", async () => {
      await db.exec(`DELETE FROM "AthleteCompetitionDiveEvaluation" WHERE "competitionDiveId"='active-2';
        INSERT INTO "AthleteCompetitionDiveEvaluation" VALUES ('extra','athlete-a','session-a','secondary-1','301A','THREE_METER',5,'ATHLETE',NOW());`);
      await reject(); // Same number of evaluations as active dives is insufficient.
      await db.exec(`INSERT INTO "AthleteCompetitionDiveEvaluation" VALUES ('retired','athlete-a','session-a','deleted-dive','999A','ONE_METER',5,'ATHLETE',NOW())`);
      await reject(); // Even matching the old all-list count cannot cover a missing active dive.
      await db.exec(`INSERT INTO "AthleteCompetitionDiveEvaluation" VALUES ('other-athlete','athlete-b','session-a','active-2','201A','ONE_METER',5,'ATHLETE',NOW()),
        ('other-session','athlete-a','session-b','active-2','201A','ONE_METER',5,'ATHLETE',NOW()),
        ('coach','athlete-a','session-a','active-2','201A','ONE_METER',5,'COACH',NOW());`);
      await reject();
      await db.exec(`UPDATE "AthleteCompetitionDiveEvaluation" SET evaluator='ATHLETE' WHERE id='coach'`);
      await complete();
      assert.ok(forwarded);
    });
    await t.test("block-triggered evaluations use the same guard; disabled evaluation and empty active list do not block", async () => {
      await db.exec(`UPDATE "TrainingSession" SET "competitionEvaluationAtStart"=false;
        DELETE FROM "AthleteCompetitionDiveEvaluation" WHERE "athleteId"='athlete-a' AND "sessionId"='session-a' AND "competitionDiveId"='active-2'`);
      await reject();
      await db.exec(`UPDATE "SessionBlock" SET "competitionEvaluation"=false`);
      await complete(); assert.ok(forwarded);
      await db.exec(`UPDATE "TrainingSession" SET "competitionEvaluationAtStart"=true;
        UPDATE "CompetitionDiveList" SET position=2 WHERE id='active'`);
      await complete(); assert.ok(forwarded);
    });
    await t.test("identity and assignment refusals happen before the evaluation reads or persistence", async () => {
      validationReads = 0; authenticated = false;
      await assert.rejects(complete(), /actif/); assert.equal(forwarded, null);
      authenticated = true; assigned = false;
      await assert.rejects(complete(), /assignee/); assert.equal(forwarded, null);
      assert.equal(validationReads, 0);
    });
  } finally { await db.close(); }
});
