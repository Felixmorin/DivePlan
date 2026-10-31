import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import type { persistAthleteProgress } from "./athlete-progress";

test("starting and saving a session preserve its first recorded start time", async (t) => {
  const db = new PGlite();
  let now = Date.parse("2026-10-30T17:00:00Z");
  class Clock extends Date { constructor() { super(now); } }
  try {
    await db.exec(`CREATE TABLE "TrainingSession" (id text PRIMARY KEY, date timestamptz, status text);
      CREATE TABLE "SessionBlock" (id text PRIMARY KEY, "sessionId" text);
      CREATE TABLE "SessionBlockAssignment" ("sessionBlockId" text, "athleteId" text);
      CREATE TABLE "AthleteSessionCompletion" ("athleteId" text, "sessionId" text, "startedAt" timestamptz,
        "completedAt" timestamptz, status text, rating text, note text, PRIMARY KEY ("athleteId","sessionId"));
      INSERT INTO "TrainingSession" VALUES ('session-a','2026-10-30T17:00:00Z','READY');
      INSERT INTO "SessionBlock" VALUES ('block-a','session-a');
      INSERT INTO "SessionBlockAssignment" VALUES ('block-a','athlete-a');
      INSERT INTO "AthleteSessionCompletion" VALUES ('athlete-b','session-a','2026-10-30T16:00:00Z',NULL,'IN_PROGRESS','3','other');`);
    let denied = false;
    let saveWrites = 0;
    const dependencies: Record<string, unknown> = {
      "node:crypto": { randomUUID },
      "@/lib/db": { query: db.query.bind(db), withTransaction: (callback: (tx: unknown) => Promise<unknown>) => db.transaction((tx) => callback({
        query: (sql: string, args: unknown[]) => { saveWrites++; return tx.query(sql, args); }
      })) }
    };
    function load(source: string, extra: Record<string, unknown> = {}) {
      const exports: Record<string, unknown> = {};
      const modules = { ...dependencies, ...extra };
      runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
        { exports, Date: Clock, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; } });
      return exports;
    }
    const persist = load(readFileSync("src/lib/athlete-progress.ts", "utf8")).persistAthleteProgress as typeof persistAthleteProgress;
    // Execute the actual Server Action with real SQL and controlled identity,
    // clock, cache invalidation and event sink; no application session required.
    const file = ts.createSourceFile("actions.ts", readFileSync("src/app/athlete/session/[id]/actions.ts", "utf8"), ts.ScriptTarget.Latest, true);
    const startNode = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "startAthleteSession");
    assert.ok(startNode);
    // Bind only the dependencies referenced by this extracted action.
    // Its assignment/date checks and INSERT remain the production implementation.
    const actionExports: { startAthleteSession?: (id: string) => Promise<void> } = {};
    runInNewContext(ts.transpileModule(startNode.getText(file), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
      exports: actionExports, Date: Clock, query: db.query.bind(db),
      getCurrentAthlete: async () => denied ? null : { id: "athlete-a", clubId: "club-a", userId: "user-a", user: { firstName: "Synthetic", lastName: "Athlete" } },
      isSessionStartAvailable: () => true, SESSION_NOT_STARTED_MESSAGE: "Unavailable", trackEvent: async () => {}, revalidatePath: () => {}
    });
    const startSession = actionExports.startAthleteSession!;
    const row = async (id = "athlete-a") => (await db.query<{ startedAt: Date; completedAt: Date | null; status: string; rating: string | null; note: string | null }>(
      `SELECT "startedAt","completedAt",status,rating,note FROM "AthleteSessionCompletion" WHERE "athleteId"=$1 AND "sessionId"='session-a'`, [id])).rows[0];
    const payload = { sessionId: "session-a", exercises: [], dives: [] };
    const blocks = [{ id: "block-a", exerciseIds: [], diveIds: [] }];
    await startSession("session-a");
    assert.equal((await row()).startedAt.toISOString(), "2026-10-30T17:00:00.000Z");
    now += 60 * 60_000;

    await t.test("repeated saves and start retries retain the first start", async () => {
      await persist({ ...payload, sessionFeedback: { rating: "5", note: "Synthetic" } }, "athlete-a", blocks);
      assert.equal((await row()).startedAt.toISOString(), "2026-10-30T17:00:00.000Z");
      await startSession("session-a");
      await persist(payload, "athlete-a", blocks);
      assert.equal((await row()).startedAt.toISOString(), "2026-10-30T17:00:00.000Z");
      assert.equal((await row()).rating, "5");
      assert.equal(saveWrites, 2, "one completion upsert per empty/feedback save; no added SQL");
    });
    await t.test("finalization and late saves retain both timestamps and completed status", async () => {
      await persist(payload, "athlete-a", blocks, async tx => {
        await tx.query(`UPDATE "AthleteSessionCompletion" SET status='COMPLETED',"completedAt"=$1 WHERE "athleteId"=$2`, [new Clock(), "athlete-a"]);
      });
      now += 60_000;
      await persist(payload, "athlete-a", blocks);
      const saved = await row();
      assert.equal(saved.startedAt.toISOString(), "2026-10-30T17:00:00.000Z");
      assert.equal(saved.completedAt?.toISOString(), "2026-10-30T18:00:00.000Z");
      assert.equal(saved.status, "COMPLETED");
      assert.equal(saved.note, "Synthetic");
    });
    await t.test("missing start times are initialized by saves and by starts", async () => {
      await persist(payload, "new-athlete", blocks);
      assert.equal((await row("new-athlete")).startedAt.toISOString(), new Clock().toISOString());
      await db.exec(`UPDATE "AthleteSessionCompletion" SET "startedAt"=NULL WHERE "athleteId"='athlete-a'`);
      await startSession("session-a");
      assert.equal((await row()).startedAt.toISOString(), new Clock().toISOString());
      await db.exec(`UPDATE "AthleteSessionCompletion" SET "startedAt"=NULL WHERE "athleteId"='athlete-a'`);
      await persist(payload, "athlete-a", blocks);
      assert.equal((await row()).startedAt.toISOString(), new Clock().toISOString());
    });
    await t.test("unauthorized starts and another athlete remain unchanged", async () => {
      const before = await row();
      await assert.rejects(startSession("unassigned-session"), /assignee/);
      denied = true;
      await assert.rejects(startSession("session-a"), /actif/);
      assert.deepEqual(await row(), before);
      const other = await row("athlete-b");
      assert.equal(other.startedAt.toISOString(), "2026-10-30T16:00:00.000Z");
      assert.equal(other.note, "other");
    });
  } finally { await db.close(); }
});
