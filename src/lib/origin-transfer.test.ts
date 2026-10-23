import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { liveSessionForClient } from "./live-session";
import type { CoachSession } from "./coach-session";
import type { LiveProgress } from "./live-session";

// Execute the real route/query code with only auth and the database connection
// replaced. SQL runs against PostgreSQL, including JSON recordset/NOT NULL rules.
function load<T>(path: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}): T {
  const code = ts.transpileModule(readFileSync(resolve(path), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  const exports = {};
  runInNewContext(code, {
    exports, Request, Response, URL, ...globals,
    require(name: string) {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    }
  });
  return exports as T;
}

test("live payload excludes inline photos, user records and private notes at every depth", () => {
  const user = { id: "athlete", firstName: "A", lastName: "B", avatar: `data:image/png;base64,${"A".repeat(16_384)}`, passwordHash: "secret" };
  const session = {
    id: "session", date: new Date("2026-10-22T18:00:00Z"), notes: "private",
    week: { group: { name: "Provincial" } }, absences: [{ athleteId: "absent" }],
    blocks: [{ id: "block", type: "POOL", title: "Piscine", position: 0,
      assignments: [{ athleteId: user.id, athlete: { user } }],
      drylandExercises: [{ exerciseId: "exercise", sets: 2, reps: 5, duration: null, notes: "private", exercise: { name: "Gainage", description: "private" } }],
      poolTraining: { sections: [{ id: "section", height: "ONE_METER", label: null, dives: [{ id: "dive", diveCode: "101A", repetitions: 3, notes: "private" }] }] }
    }],
    diveLogs: Array.from({ length: 60 }, () => ({ athleteId: user.id, poolDiveId: "dive", repetitionsCompleted: 2, athlete: { user }, note: "private" })),
    exerciseLogs: [{ athleteId: user.id, exerciseId: "exercise", completed: true, athlete: { user }, note: "private" }],
    completions: [{ athlete: { user } }]
  } as unknown as CoachSession;
  const payload = liveSessionForClient(session);
  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, /avatar|base64|passwordHash|private|completions/);
  assert.equal(payload.diveLogs[0].repetitionsCompleted, 2);
  assert.equal(payload.blocks[0].poolTraining?.sections[0].dives[0].diveCode, "101A");
  assert.equal(payload.blocks[0].drylandExercises[0].exercise.name, "Gainage");
  assert.ok(serialized.length < JSON.stringify(session).length / 100);
});

test("live polling pauses when hidden, prevents overlap and refreshes only on plan changes", async () => {
  const timers = new Map<number, { callback: () => unknown; delay: number }>();
  let timerId = 0;
  let effect: () => () => void = () => () => {};
  let visibilityHandler = () => {};
  let requests = 0;
  let refreshes = 0;
  let resolveFetch: (response: Response) => void = () => {};
  const document = {
    visibilityState: "visible",
    addEventListener: (_name: string, callback: () => void) => { visibilityHandler = callback; },
    removeEventListener: () => { visibilityHandler = () => {}; }
  };
  const progress: LiveProgress = { status: "IN_PROGRESS", planVersion: "v1", absences: [], diveLogs: [], exerciseLogs: [] };
  const { ActiveSessionOverview } = load<{ ActiveSessionOverview: (props: unknown) => unknown }>("src/app/coach/sessions/[id]/active-session-overview.tsx", {
    react: {
      useState: (initial: unknown) => [typeof initial === "function" ? initial() : initial, () => {}],
      useEffect: (callback: typeof effect) => { effect = callback; }
    },
    "react/jsx-runtime": { jsx: () => null, jsxs: () => null },
    "next/navigation": { useRouter: () => ({ refresh: () => { refreshes += 1; } }) },
    "next/link": {}, "lucide-react": {},
    "@/app/coach/sessions/actions": {}, "@/lib/timezone": { formatMontrealDate: () => "" }
  }, {
    document, AbortController,
    setTimeout: (callback: () => unknown, delay: number) => { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout: (id: number) => { timers.delete(id); },
    fetch: (_url: string, { signal }: { signal: AbortSignal }) => {
      requests += 1;
      return new Promise<Response>((resolve, reject) => {
        resolveFetch = resolve;
        signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
      });
    }
  });
  ActiveSessionOverview({ session: { id: "session", date: "2026-10-22", week: { group: { name: "Group" } }, blocks: [], ...progress }, initialProgress: progress, athletes: [] });
  const cleanup = effect();
  const runPollTimer = () => {
    const entry = [...timers].find(([, timer]) => timer.delay === 15_000)!;
    assert.ok(entry, "poll is scheduled after 15 seconds");
    timers.delete(entry[0]);
    return entry[1].callback();
  };
  const pending = runPollTimer();
  visibilityHandler();
  visibilityHandler();
  assert.equal(requests, 1, "visibility changes cannot start concurrent fetches");
  resolveFetch(Response.json(progress));
  await pending;
  assert.equal(refreshes, 0, "unchanged plans do not refresh the full route");
  document.visibilityState = "hidden";
  visibilityHandler();
  assert.equal(timers.size, 0, "hidden tabs stop polling");
  document.visibilityState = "visible";
  visibilityHandler();
  assert.equal(requests, 2, "returning to a tab fetches immediately");
  resolveFetch(Response.json({ ...progress, planVersion: "v2" }));
  await new Promise(setImmediate);
  assert.equal(refreshes, 1, "plan edits refresh the route once");
  assert.equal(timers.size, 0, "polling stops while awaiting the new plan");
  cleanup();
});

test("PostgreSQL regressions: telemetry insertion and isolated live progress", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "Club" (id text PRIMARY KEY);
      INSERT INTO "Club" VALUES ('club-a'), ('club-b');`);
    for (const file of ["0002_transfer_telemetry.sql", "0003_performance_telemetry.sql", "0004_performance_ratings.sql"]) {
      await db.exec(readFileSync(resolve("db/migrations", file), "utf8"));
    }
    let user: { clubId: string; role: string; coach?: object } | null = { clubId: "club-a", role: "COACH", coach: {} };
    const dependencies = {
      "@/lib/current-user": { getCurrentUser: async () => user },
      "@/lib/db": { query: (sql: string, values: unknown[]) => db.query(sql, values) },
      "server-only": {}
    };
    const { POST } = load<{ POST: (request: Request) => Promise<Response> }>("src/app/api/monitoring/transfer/route.ts", dependencies);
    const request = (body: unknown, origin = "https://diveplan.test") => new Request("https://diveplan.test/api/monitoring/transfer", {
      method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body)
    });
    await t.test("browser name becomes SQL metric and repeated samples upsert", async () => {
      for (const value of [100, 300]) {
        assert.equal((await POST(request({ vitals: [{ route: "/coach/sessions", name: "INP", value }] }))).status, 200);
      }
      const { rows } = await db.query<{ metric: string; samples: number; goodSamples: number }>(`SELECT metric, samples, "goodSamples" FROM "PerformanceTelemetryHour"`);
      assert.equal(rows[0].metric, "INP");
      assert.equal(rows[0].samples, 2);
      assert.equal(rows[0].goodSamples, 1);
    });
    await t.test("mixed transfer and vitals batches persist without a metric constraint error", async () => {
      assert.equal((await POST(request({
        vitals: [{ route: "/coach", name: "CLS", value: 0.05 }],
        entries: [{ route: "/coach", resourceType: "fetch", requests: 2, transferBytes: 300, cacheHits: 0 }]
      }))).status, 200);
      const { rows } = await db.query<{ transferBytes: number }>(`SELECT "transferBytes" FROM "TransferTelemetryHour"`);
      assert.equal(Number(rows[0].transferBytes), 300);
    });
    await t.test("invalid origins, missing auth and unsupported metrics are rejected", async () => {
      assert.equal((await POST(request({}, "https://elsewhere.test"))).status, 403);
      user = null;
      assert.equal((await POST(request({}))).status, 401);
      user = { clubId: "club-a", role: "COACH", coach: {} };
      assert.equal((await POST(request({ vitals: [{ route: "/coach", name: "bogus", value: 5 }] }))).status, 400);
    });

    await db.exec(`
      CREATE TABLE "TrainingGroup" (id text PRIMARY KEY, name text);
      CREATE TABLE "TrainingWeek" (id text PRIMARY KEY, "clubId" text, "groupId" text);
      CREATE TABLE "TrainingSession" (id text PRIMARY KEY, "weekId" text, status text, title text);
      CREATE TABLE "SessionBlock" (id text PRIMARY KEY, "sessionId" text, title text);
      CREATE TABLE "SessionBlockAssignment" (id text PRIMARY KEY, "sessionBlockId" text, "athleteId" text);
      CREATE TABLE "DrylandExercise" (id text PRIMARY KEY, name text);
      CREATE TABLE "DrylandBlockExercise" ("blockId" text, "exerciseId" text, "order" integer);
      CREATE TABLE "PoolSection" (id text PRIMARY KEY, "poolTrainingId" text);
      CREATE TABLE "PoolDive" (id text PRIMARY KEY, "poolSectionId" text, repetitions integer);
      CREATE TABLE "AthleteSessionAbsence" ("sessionId" text, "athleteId" text);
      CREATE TABLE "AthleteDiveLog" ("sessionId" text, "athleteId" text, "poolDiveId" text, "repetitionsCompleted" integer);
      CREATE TABLE "AthleteExerciseLog" ("sessionId" text, "athleteId" text, "exerciseId" text, completed boolean);
      INSERT INTO "TrainingGroup" VALUES ('group', 'Provincial');
      INSERT INTO "TrainingWeek" VALUES ('week', 'club-a', 'group');
      INSERT INTO "TrainingSession" VALUES ('session', 'week', 'IN_PROGRESS', 'Piscine');
      INSERT INTO "SessionBlock" VALUES ('block', 'session', '1 m');
      INSERT INTO "PoolSection" VALUES ('section', 'block');
      INSERT INTO "PoolDive" VALUES ('dive', 'section', 3);
    `);
    const { getLiveSessionProgress } = load<{ getLiveSessionProgress: (id: string, club: string) => Promise<LiveProgress | null> }>("src/lib/live-session-progress.ts", dependencies);
    const { GET } = load<{ GET: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response> }>("src/app/api/coach/sessions/[id]/progress/route.ts", {
      ...dependencies, "@/lib/live-session-progress": { getLiveSessionProgress }
    });
    const get = () => GET(new Request("https://diveplan.test/api/coach/sessions/session/progress"), { params: Promise.resolve({ id: "session" }) });
    await t.test("progress-only changes preserve the plan version; edits invalidate it", async () => {
      const initial = (await getLiveSessionProgress("session", "club-a"))!;
      await db.exec(`INSERT INTO "AthleteDiveLog" VALUES ('session', 'athlete', 'dive', 2);
        INSERT INTO "AthleteExerciseLog" VALUES ('session', 'athlete', 'exercise', true);
        INSERT INTO "AthleteSessionAbsence" VALUES ('session', 'absent');`);
      const updated = (await getLiveSessionProgress("session", "club-a"))!;
      assert.equal(updated.planVersion, initial.planVersion);
      assert.equal(updated.diveLogs[0].repetitionsCompleted, 2);
      assert.equal(updated.exerciseLogs[0].completed, true);
      assert.equal(updated.absences[0].athleteId, "absent");
      await db.exec(`UPDATE "PoolDive" SET repetitions=4 WHERE id='dive'`);
      assert.notEqual((await getLiveSessionProgress("session", "club-a"))!.planVersion, initial.planVersion);
      assert.equal(await getLiveSessionProgress("session", "club-b"), null);
    });
    await t.test("endpoint enforces authentication, coach role and club isolation without public caching", async () => {
      user = null;
      assert.equal((await get()).status, 401);
      user = { clubId: "club-a", role: "ATHLETE" };
      assert.equal((await get()).status, 403);
      user = { clubId: "club-b", role: "COACH", coach: {} };
      assert.equal((await get()).status, 404);
      user = { clubId: "club-a", role: "COACH", coach: {} };
      const response = await get();
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.doesNotMatch(await response.text(), /avatar|base64|passwordHash/);
    });
  } finally {
    await db.close();
  }
});
