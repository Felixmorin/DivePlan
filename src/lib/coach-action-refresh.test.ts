import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import * as jsxRuntime from "react/jsx-runtime";

function compile(source: string, globals: Record<string, unknown> = {}) {
  const exports: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText, { exports, Date, ...globals });
  return exports;
}
function functions(path: string, names: string[]) {
  const file = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  const nodes = file.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? ""));
  assert.equal(nodes.length, names.length); return nodes.map(node => node.getText(file)).join("\n");
}

test("coach toast forms rely on each action's page revalidation without a second refresh", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "TrainingWeek" (id text PRIMARY KEY,"clubId" text);
      CREATE TABLE "TrainingSession" (id text PRIMARY KEY,"weekId" text,title text,status text);
      CREATE TABLE "SessionBlock" (id text PRIMARY KEY,"sessionId" text);
      CREATE TABLE "SessionBlockAssignment" ("sessionBlockId" text,"athleteId" text);
      CREATE TABLE "AthleteSessionCompletion" ("athleteId" text,"sessionId" text,"startedAt" timestamptz,"completedAt" timestamptz,status text,rating text,note text,PRIMARY KEY("athleteId","sessionId"));
      CREATE TABLE "AthleteSessionAbsence" ("athleteId" text,"sessionId" text);
      CREATE TABLE "AthleteDiveLog" ("athleteId" text,"repetitionsCompleted" int,"goldenRepetitions" int);
      CREATE TABLE "AthleteExerciseLog" ("athleteId" text,completed boolean);
      INSERT INTO "TrainingWeek" VALUES ('week-a','club-a'),('week-b','club-b');
      INSERT INTO "TrainingSession" VALUES ('session-a','week-a','Synthetic session','DRAFT'),('session-b','week-b','Other club','READY');
      INSERT INTO "SessionBlock" VALUES ('block-a','session-a');
      INSERT INTO "SessionBlockAssignment" VALUES ('block-a','athlete-a'),('block-a','absent');
      INSERT INTO "AthleteSessionAbsence" VALUES ('absent','session-a');
      INSERT INTO "AthleteSessionCompletion" VALUES ('athlete-a','session-a','2026-11-02T12:00:00Z',NULL,'IN_PROGRESS','Bien','Synthetic feedback');
      INSERT INTO "AthleteDiveLog" VALUES ('athlete-a',7,2);
      INSERT INTO "AthleteExerciseLog" VALUES ('athlete-a',true);`);
    let denied = false;
    let pending = false;
    let refreshes = 0;
    let notifications: unknown[][] = [];
    let invalidations: string[] = [];
    let pendingChanges: boolean[] = [];
    const completeSessionIfAllAthletesAreDone = compile(functions("src/lib/session-status.ts", ["completeSessionIfAllAthletesAreDone"])).completeSessionIfAllAthletesAreDone;
    const names = ["publishTrainingSession", "startTrainingSession", "markAthleteSessionCompleted"];
    const pgQuery = async (executor: { query: typeof db.query }, sql: string, args: unknown[]) => {
      const result = await executor.query(sql, args);
      return { ...result, rowCount: result.affectedRows ?? result.rows.length };
    };
    const actions = compile(functions("src/app/coach/sessions/actions.ts", names), {
      requireCoach: async () => { if (denied) throw new Error("Forbidden"); return { clubId: "club-a", user: { id: "coach-a" } }; },
      query: (sql: string, args: unknown[]) => pgQuery(db, sql, args),
      withTransaction: (callback: (tx: unknown) => Promise<unknown>) => db.transaction(tx => callback({ query: (sql: string, args: unknown[]) => pgQuery(tx, sql, args) })),
      SessionStatus: { DRAFT: "DRAFT", READY: "READY" }, isAutomaticSessionPushEnabled: () => false,
      dispatchSessionPublication: async () => {}, trackEvent: async () => {}, completeSessionIfAllAthletesAreDone,
      revalidatePath: (path: string) => invalidations.push(path)
    }) as Record<string, (form: FormData) => Promise<void>>;
    const dependencies: Record<string, unknown> = {
      "react/jsx-runtime": jsxRuntime,
      react: { useState: () => [pending, (value: boolean) => { pending = value; pendingChanges.push(value); }] },
      "next/navigation": { useRouter: () => ({ refresh: () => refreshes++ }) },
      "@/components/ui/toast-provider": { useToast: () => ({ notify: (...args: unknown[]) => notifications.push(args) }) }
    };
    type Form = { props: { action: (data: FormData) => Promise<void>; "aria-busy": boolean } };
    const component = compile(readFileSync("src/components/ui/toast-action-form.tsx", "utf8"), {
      require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; }
    }).ToastActionForm as (props: { action: (data: FormData) => Promise<void>; successMessage: string; children: null }) => Form;
    const form = (sessionId = "session-a", athleteId = "athlete-a") => {
      const data = new FormData(); data.set("sessionId", sessionId); data.set("athleteId", athleteId); return data;
    };
    const reset = () => { refreshes = 0; notifications = []; invalidations = []; pendingChanges = []; };
    const submit = (action: (data: FormData) => Promise<void>, data = form()) => component({ action, successMessage: "Synthetic success", children: null }).props.action(data);
    for (const [name, expected] of [[names[0], "READY"], [names[1], "IN_PROGRESS"], [names[2], "COMPLETED"]]) {
      await t.test(`${name} persists and revalidates the current page once without router.refresh`, async () => {
        reset(); await submit(actions[name]);
        assert.equal((await db.query<{status:string}>(`SELECT status FROM "TrainingSession" WHERE id='session-a'`)).rows[0].status, expected);
        assert.equal(invalidations.filter(path => path === "/coach/sessions/session-a").length, 1);
        assert.deepEqual(notifications, [["Synthetic success"]]);
        assert.deepEqual(pendingChanges, [true, false]);
        assert.equal(refreshes, 0, "revalidation already includes the updated page in the action response");
      });
    }
    await t.test("completion retains work, start time, feedback and absences", async () => {
      const row = (await db.query<{startedAt:Date;status:string;rating:string;note:string}>(`SELECT "startedAt",status,rating,note FROM "AthleteSessionCompletion"`)).rows[0];
      assert.equal(row.status, "COMPLETED"); assert.equal(row.startedAt.toISOString(), "2026-11-02T12:00:00.000Z");
      assert.equal(row.rating, "Bien"); assert.equal(row.note, "Synthetic feedback");
      assert.deepEqual((await db.query(`SELECT * FROM "AthleteDiveLog"`)).rows, [{ athleteId: "athlete-a", repetitionsCompleted: 7, goldenRepetitions: 2 }]);
      assert.deepEqual((await db.query(`SELECT * FROM "AthleteExerciseLog"`)).rows, [{ athleteId: "athlete-a", completed: true }]);
      assert.deepEqual((await db.query(`SELECT * FROM "AthleteSessionAbsence"`)).rows, [{ athleteId: "absent", sessionId: "session-a" }]);
    });
    await t.test("foreign club, unassigned athlete and denied coach surface errors without invalidation or refresh", async () => {
      for (const [name, data, deny] of [[names[1], form("session-b"), false], [names[2], form("session-a", "unassigned"), false], [names[0], form(), true]] as const) {
        reset(); denied = deny; await submit(actions[name], data);
        assert.deepEqual(notifications, [["L’action n’a pas abouti. Réessayez.", "error"]]);
        assert.equal(refreshes, 0); assert.equal(invalidations.length, 0);
        assert.deepEqual(pendingChanges, [true, false]);
      }
      denied = false;
      assert.equal((await db.query<{status:string}>(`SELECT status FROM "TrainingSession" WHERE id='session-b'`)).rows[0].status, "READY");
    });
    await t.test("a form rendered pending does not invoke its action again", async () => {
      reset(); pending = true; let calls = 0;
      const node = component({ action: async () => { calls++; }, successMessage: "Synthetic success", children: null });
      assert.equal(node.props["aria-busy"], true); await node.props.action(form());
      assert.equal(calls, 0); assert.equal(refreshes, 0); pending = false;
    });
  } finally { await db.close(); }
});
