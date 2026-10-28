import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import type { LiveProgressReply } from "./live-session-progress";
import { normalizeTelemetryRoute } from "./telemetry-route";
import { parseObservations } from "./request-observation";
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
  for (const key of ["absences", "diveLogs", "exerciseLogs"]) assert.equal(key in payload, false);
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
  const requestHeaders: Array<Record<string, string> | undefined> = [];
  const syncStates: unknown[] = [];
  let progressUpdates = 0;
  let resolveFetch: (response: Response) => void = () => {};
  const document = {
    visibilityState: "visible",
    addEventListener: (_name: string, callback: () => void) => { visibilityHandler = callback; },
    removeEventListener: () => { visibilityHandler = () => {}; }
  };
  const progress: LiveProgress = { status: "IN_PROGRESS", planVersion: "v1", absences: [], diveLogs: [], exerciseLogs: [] };
  const { ActiveSessionOverview } = load<{ ActiveSessionOverview: (props: unknown) => unknown }>("src/app/coach/sessions/[id]/active-session-overview.tsx", {
    react: {
      useState: (initial: unknown) => [typeof initial === "function" ? initial() : initial, (next: unknown) => {
        if (initial === "synced") syncStates.push(next);
        if (initial === progress) progressUpdates += 1;
      }],
      useEffect: (callback: typeof effect) => { effect = callback; }
    },
    "react/jsx-runtime": { jsx: () => null, jsxs: () => null },
    "next/navigation": { useRouter: () => ({ refresh: () => { refreshes += 1; } }) },
    "@/components/ui/app-link": {}, "lucide-react": {},
    "@/app/coach/sessions/actions": {}, "@/lib/timezone": { formatMontrealDate: () => "" }
  }, {
    document, AbortController,
    setTimeout: (callback: () => unknown, delay: number) => { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout: (id: number) => { timers.delete(id); },
    fetch: (_url: string, { signal, headers }: { signal: AbortSignal; headers?: Record<string, string> }) => {
      requests += 1;
      requestHeaders.push(headers);
      return new Promise<Response>((resolve, reject) => {
        resolveFetch = resolve;
        signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
      });
    }
  });
  ActiveSessionOverview({ session: { id: "session", date: "2026-10-22", week: { group: { name: "Group" } }, blocks: [] }, initialProgress: progress, athletes: [] });
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
  assert.equal(requestHeaders[0], undefined);
  resolveFetch(Response.json(progress, { headers: { etag: 'W/"progress-v1"' } }));
  await pending;
  assert.equal(refreshes, 0, "unchanged plans do not refresh the full route");
  assert.equal(progressUpdates, 1);
  const unchangedPoll = runPollTimer();
  assert.equal(requestHeaders[1]?.["If-None-Match"], 'W/"progress-v1"');
  resolveFetch(new Response(null, { status: 304 }));
  await unchangedPoll;
  assert.equal(progressUpdates, 1, "304 does not parse JSON or replace the current progress");
  assert.equal(syncStates.at(-1), "synced");
  assert.equal(refreshes, 0);
  const failedPoll = runPollTimer();
  resolveFetch(new Response(null, { status: 500 }));
  await failedPoll;
  assert.equal(syncStates.at(-1), "failed");
  const retry = [...timers].find(([, timer]) => timer.delay === 30_000)!;
  assert.ok(retry, "errors back off to 30 seconds");
  timers.delete(retry[0]);
  const recovering = retry[1].callback();
  assert.equal(requestHeaders[3]?.["If-None-Match"], 'W/"progress-v1"');
  resolveFetch(new Response(null, { status: 304 }));
  await recovering;
  assert.equal(syncStates.at(-1), "synced", "304 recovers after a network failure");
  assert.ok([...timers.values()].some((timer) => timer.delay === 15_000), "success restores normal polling");
  document.visibilityState = "hidden";
  visibilityHandler();
  assert.equal(timers.size, 0, "hidden tabs stop polling");
  document.visibilityState = "visible";
  visibilityHandler();
  assert.equal(requests, 5, "returning to a tab fetches immediately");
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
      "@/lib/current-user": { getCurrentUser: async () => user, getCurrentUserAccess: async () => user },
      "@/lib/db": { query: (sql: string, values: unknown[]) => db.query(sql, values) },
      "server-only": {},
      "@/lib/telemetry-route": { normalizeTelemetryRoute },
      "@/lib/request-observation": { parseObservations }
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
    await t.test("colliding normalized batch keys preserve every transfer and vital sample", async () => {
      const batch = {
        entries: [
          { route: "/coach/sessions/101", resourceType: "fetch", requests: 2, transferBytes: 300, cacheHits: 1 },
          { route: "/coach/sessions/102", resourceType: "fetch", requests: 3, transferBytes: 500, cacheHits: 2 }
        ],
        vitals: [100, 300, 700].map(value => ({ route: "/coach/sessions/101", name: "INP", value }))
      };
      // Two batches per club exercise both INSERT and conflict UPDATE, without sharing totals.
      for (const clubId of ["club-a", "club-b"]) {
        user = { clubId, role: "COACH", coach: {} };
        for (let i = 0; i < 2; i++) assert.equal((await POST(request(batch))).status, 200);
        const transfer = (await db.query(`SELECT requests, "transferBytes", "cacheHits" FROM "TransferTelemetryHour" WHERE "clubId" = $1 AND route = '/coach/sessions/:id'`, [clubId])).rows[0];
        assert.deepEqual(transfer, { requests: 10, transferBytes: 1600, cacheHits: 6 });
        const vital = (await db.query(`SELECT samples, "totalValue", "maxValue", "ratedSamples", "ratedTotalValue", "ratedMaxValue", "goodSamples", "needsImprovementSamples" FROM "PerformanceTelemetryHour" WHERE "clubId" = $1 AND route = '/coach/sessions/:id'`, [clubId])).rows[0];
        assert.deepEqual(vital, { samples: 6, totalValue: 2200, maxValue: 700, ratedSamples: 6, ratedTotalValue: 2200, ratedMaxValue: 700, goodSamples: 2, needsImprovementSamples: 2 });
      }
      user = { clubId: "club-a", role: "COACH", coach: {} };
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
    const { getLiveSessionProgress, getLiveSessionProgressReply } = load<{ getLiveSessionProgress: (id: string, club: string) => Promise<LiveProgress | null>; getLiveSessionProgressReply: (id: string, club: string, validators?: string[]) => Promise<LiveProgressReply | null> }>("src/lib/live-session-progress.ts", dependencies);
    const { GET } = load<{ GET: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response> }>("src/app/api/coach/sessions/[id]/progress/route.ts", {
      ...dependencies, "@/lib/live-session-progress": { getLiveSessionProgressReply }
    });
    const get = (etag?: string) => GET(new Request("https://diveplan.test/api/coach/sessions/session/progress", { headers: etag ? { "if-none-match": etag } : {} }), { params: Promise.resolve({ id: "session" }) });
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
    await t.test("row insertion order does not change the validator", async () => {
      await db.exec(`INSERT INTO "AthleteDiveLog" VALUES ('session', 'second', 'dive', 1);
        INSERT INTO "AthleteExerciseLog" VALUES ('session', 'second', 'exercise', false);
        INSERT INTO "AthleteSessionAbsence" VALUES ('session', 'second');`);
      const etag = (await get()).headers.get("etag")!;
      for (const table of ["AthleteDiveLog", "AthleteExerciseLog", "AthleteSessionAbsence"]) {
        await db.exec(`CREATE TEMP TABLE reordered AS SELECT * FROM "${table}" ORDER BY "athleteId" DESC;
          DELETE FROM "${table}"; INSERT INTO "${table}" SELECT * FROM reordered; DROP TABLE reordered;`);
      }
      assert.equal((await get(etag)).status, 304);
    });
    await t.test("unchanged progress has no body; every displayed change invalidates the validator", async () => {
      const first = await get();
      const etag = first.headers.get("etag")!;
      assert.ok(etag);
      const unchanged = await get(etag);
      assert.equal(unchanged.status, 304);
      assert.equal(await unchanged.text(), "");
      assert.equal(unchanged.headers.get("cache-control"), "private, no-store");
      assert.equal(unchanged.headers.get("etag"), etag);
      assert.equal((await get(`"old", ${etag.replace(/^W\//, "")}`)).status, 304);
      for (const sql of [
        `UPDATE "AthleteDiveLog" SET "repetitionsCompleted"=3`,
        `UPDATE "AthleteExerciseLog" SET completed=false`,
        `DELETE FROM "AthleteSessionAbsence"`,
        `UPDATE "PoolDive" SET repetitions=5`,
        `UPDATE "TrainingSession" SET status='COMPLETED'`
      ]) {
        const previous = (await get()).headers.get("etag")!;
        await db.exec(sql);
        const changed = await get(previous);
        assert.equal(changed.status, 200, sql);
        assert.notEqual(changed.headers.get("etag"), previous);
        assert.ok((await changed.text()).length > 0);
      }
      // Even a current validator cannot bypass revoked access or a different club.
      const currentEtag = (await get()).headers.get("etag")!;
      user = null;
      assert.equal((await get(currentEtag)).status, 401);
      user = { clubId: "club-a", role: "ATHLETE" };
      assert.equal((await get(currentEtag)).status, 403);
      user = { clubId: "club-b", role: "COACH", coach: {} };
      const forbidden = await get(currentEtag);
      assert.equal(forbidden.status, 404);
      assert.equal(forbidden.headers.get("etag"), null);
      user = { clubId: "club-a", role: "COACH", coach: {} };
    });
    await t.test("an unchanged SQL reply omits progress before it reaches the application", async () => {
      const first = (await getLiveSessionProgressReply("session", "club-a"))!;
      assert.ok(first.progress);
      const unchanged = (await getLiveSessionProgressReply("session", "club-a", [first.etag]))!;
      assert.equal(unchanged.etag, first.etag);
      assert.equal(unchanged.progress, null);
      assert.doesNotMatch(JSON.stringify(unchanged), /athleteId|diveLogs|exerciseLogs|absences/);
      assert.equal(await getLiveSessionProgressReply("session", "club-b", [first.etag]), null);
      assert.equal(await getLiveSessionProgressReply("missing", "club-a", [first.etag]), null);
      // Old validators or malformed values safely force a complete response.
      assert.ok((await getLiveSessionProgressReply("session", "club-a", ['"old-node-validator"']))?.progress);
      assert.ok((await getLiveSessionProgressReply("session", "club-a", ["' OR true --"]))?.progress);
      // Identical rows under another club/session never reuse this validator.
      await db.exec(`INSERT INTO "TrainingWeek" VALUES ('week-b','club-b','group');
        INSERT INTO "TrainingSession" VALUES ('session-b','week-b','COMPLETED','Piscine');`);
      const other = await getLiveSessionProgressReply("session-b", "club-b", [first.etag]);
      assert.ok(other?.progress);
      assert.notEqual(other.etag, first.etag);
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
    await t.test("synthetic benchmark measures parsed SQL result bytes for twenty unchanged polls", async (t) => {
      await db.exec(`UPDATE "TrainingSession" SET status='IN_PROGRESS' WHERE id='session';
        DELETE FROM "AthleteDiveLog"; DELETE FROM "AthleteExerciseLog"; DELETE FROM "AthleteSessionAbsence";
        INSERT INTO "SessionBlockAssignment" SELECT 'assignment-'||i,'block','athlete-'||i FROM generate_series(0,59) AS i;
        INSERT INTO "PoolDive" SELECT 'dive-'||i,'section',5 FROM generate_series(0,19) AS i;
        INSERT INTO "DrylandExercise" SELECT 'exercise-'||i,'Synthetic' FROM generate_series(0,4) AS i;
        INSERT INTO "DrylandBlockExercise" SELECT 'block','exercise-'||i,i FROM generate_series(0,4) AS i;
        INSERT INTO "AthleteDiveLog" SELECT 'session','athlete-'||a,'dive-'||d,3 FROM generate_series(0,59) AS a CROSS JOIN generate_series(0,19) AS d;
        INSERT INTO "AthleteExerciseLog" SELECT 'session','athlete-'||a,'exercise-'||e,true FROM generate_series(0,59) AS a CROSS JOIN generate_series(0,4) AS e;
        INSERT INTO "AthleteSessionAbsence" VALUES ('session','athlete-59');`);
      const first = (await getLiveSessionProgressReply("session", "club-a"))!;
      const calls = 20;
      const before = calls * Buffer.byteLength(JSON.stringify([first.progress]));
      let after = Buffer.byteLength(JSON.stringify([first]));
      for (let i = 1; i < calls; i += 1) {
        const reply = (await getLiveSessionProgressReply("session", "club-a", [first.etag]))!;
        assert.equal(reply.progress, null);
        after += Buffer.byteLength(JSON.stringify([reply]));
      }
      assert.ok(after < before * 0.06);
      t.diagnostic(`Synthetic parsed PostgreSQL rows JSON, ${calls} identical polls: ${before} -> ${after} bytes. Excludes protocol/TLS, auth queries, HTTP/RSC/JS and billed Supabase/Vercel egress. SQL computation and invocation count remain.`);
    });
  } finally {
    await db.close();
  }
});

test("synthetic unchanged polling benchmark counts JSON body bytes only", async (t) => {
  const progress: LiveProgress = {
    status: "IN_PROGRESS", planVersion: "synthetic-plan", absences: [], exerciseLogs: [],
    diveLogs: Array.from({ length: 1200 }, (_, i) => ({
      athleteId: `athlete-${Math.floor(i / 20)}`, poolDiveId: `dive-${i % 20}`, repetitionsCompleted: 3
    }))
  };
  const { GET } = load<{ GET: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response> }>("src/app/api/coach/sessions/[id]/progress/route.ts", {
    "@/lib/current-user": { getCurrentUserAccess: async () => ({ clubId: "synthetic-club", role: "COACH", coach: {} }) },
    "@/lib/live-session-progress": { getLiveSessionProgressReply: async (_id: string, _club: string, validators: string[]) => {
      const etag = '"synthetic-validator"';
      return { etag, progress: validators.includes(etag) ? null : progress };
    } }
  });
  let etag: string | null = null;
  let bytes = 0;
  const calls = 20;
  for (let i = 0; i < calls; i += 1) {
    const response = await GET(new Request("https://diveplan.test/progress", { headers: etag ? { "if-none-match": etag } : {} }), { params: Promise.resolve({ id: "synthetic-session" }) });
    assert.equal(response.status, i === 0 ? 200 : 304);
    etag = response.headers.get("etag");
    bytes += Buffer.byteLength(await response.text());
  }
  const before = calls * Buffer.byteLength(JSON.stringify(progress));
  assert.equal(bytes, before / calls);
  t.diagnostic(`Synthetic: ${calls} unchanged polls, JSON body bytes ${before} -> ${bytes} (-95%). Excludes headers, compression, SQL, RSC/HTML, JS and platform billing.`);
});

