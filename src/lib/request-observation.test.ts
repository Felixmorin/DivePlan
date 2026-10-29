import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { parseObservations, resourcePath, resourceType, observationTrigger, observationWindow, type RequestObservation } from "./request-observation";
import { normalizeTelemetryRoute } from "./telemetry-route";

function load<T>(path: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}): T {
  const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  runInNewContext(code, { exports, Request, Response, URL, URLSearchParams, Date, ...globals, require(name: string) {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name];
  } });
  return exports as T;
}
function observation(patch: Partial<RequestObservation> = {}): RequestObservation {
  return { id: randomUUID(), pageId: randomUUID(), route: "/coach", resourcePath: "/api/coach/sessions/short-id/progress", resourceType: "fetch", trigger: "unknown", startedAt: new Date().toISOString(), durationMs: 120, transferBytes: 1234, cacheHit: false, status: 200, ...patch };
}

test("observation validation redacts short IDs, rejects secrets, bounds batches and never invents a trigger", () => {
  const sample = observation();
  const parsed = parseObservations([sample, sample])!;
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].resourcePath, "/api/coach/sessions/:id/progress");
  for (const patch of [{ resourcePath: "/api/data?token=secret" }, { route: "/coach#private" }, { id: "not-a-uuid" }, { durationMs: Infinity }, { transferBytes: -1 }, { status: 0 }, { trigger: "polling" }, { serverRequestId: "invalid" }, { startedAt: "2000-01-01" }, { resourceType: "constructor" }, { trigger: "__proto__" }]) {
    assert.equal(parseObservations([{ ...sample, ...patch }]), null, JSON.stringify(patch));
  }
  assert.equal(parseObservations(Array.from({ length: 41 }, () => sample)), null);
  assert.equal(resourcePath("/coach/groups/alice"), "/coach/groups/:id");
  assert.equal(resourcePath("/avatars/alice.png"), "/avatars/:asset");
  assert.equal(resourceType({ entryType: "resource", initiatorType: "css", name: "https://app.test/font.woff2" }), "font");
  assert.equal(observationTrigger({ entryType: "resource" }, new URL("https://app.test/coach?_rsc=xyz"), "fetch"), "rsc");
  assert.equal(observationTrigger({ entryType: "resource" }, new URL("https://app.test/api/data"), "fetch"), "unknown");
});

test("hour filters are absolute and bounded, including repeated DST hours", () => {
  const now = new Date("2026-11-01T12:35:00Z");
  for (const hour of ["2026-11-01T05:00:00Z", "2026-11-01T06:00:00Z"]) {
    const range = observationWindow({ hour }, now)!;
    assert.equal(range.to.getTime() - range.from.getTime(), 3_600_000);
  }
  assert.equal(observationWindow({ hour: "2026-11-01T05:30:00Z" }, now), null);
  assert.equal(observationWindow({ hour: "2026-10-01T05:00:00Z" }, now), null);
  assert.equal(observationWindow({ hour: "invalid" }, now), null);
  const range = observationWindow({ period: "6h" }, now)!;
  assert.equal(range.from.toISOString(), "2026-11-01T07:00:00.000Z");
  assert.equal(range.to.toISOString(), "2026-11-01T13:00:00.000Z");
});

test("real ingestion and explorer SQL: auth, idempotency, attribution, pagination and retention", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "Club" (id text PRIMARY KEY); INSERT INTO "Club" VALUES ('a'),('b');`);
    for (const file of ["0002_transfer_telemetry.sql", "0003_performance_telemetry.sql", "0004_performance_ratings.sql", "0026_request_observations.sql", "0027_server_request_metrics.sql"]) await db.exec(readFileSync(`db/migrations/${file}`, "utf8"));
    let user: { clubId: string; role: string } | null = { clubId: "a", role: "COACH" };
    const query = (sql: string, args: unknown[]) => db.query(sql, args);
    const { POST } = load<{ POST: (r: Request) => Promise<Response> }>("src/app/api/monitoring/transfer/route.ts", {
      "@/lib/current-user": { getCurrentUserAccess: async () => user }, "@/lib/db": { query },
      "@/lib/telemetry-route": { normalizeTelemetryRoute }, "@/lib/request-observation": { parseObservations }
    });
    const request = (body: unknown, origin = "https://app.test") => new Request("https://app.test/api/monitoring/transfer", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
    const previousHour = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000 - 3_600_000);
    const sample = observation({ startedAt: new Date(previousHour.getTime() + 59 * 60_000).toISOString() });
    await t.test("server assigns the authenticated club and increments the observed hour once", async () => {
      assert.equal((await POST(request({ observations: [sample, sample] }))).status, 200);
      assert.equal((await POST(request({ observations: [sample] }))).status, 200);
      const { rows } = await db.query<{ clubId: string; requests: number; hour: Date }>(`SELECT "clubId", requests, hour FROM "TransferTelemetryHour"`);
      assert.equal(rows.length, 1); assert.equal(rows[0].clubId, "a"); assert.equal(rows[0].requests, 1);
      assert.equal(new Date(rows[0].hour).toISOString(), previousHour.toISOString());
      const detail = await db.query<{ resourcePath: string }>(`SELECT "resourcePath" FROM "RequestObservation"`);
      assert.equal(detail.rows[0].resourcePath, "/api/coach/sessions/:id/progress");
    });
    await t.test("authentication, cross-origin and malformed input cannot write", async () => {
      assert.equal((await POST(request({ observations: [observation()] }, "https://evil.test"))).status, 403);
      user = null; assert.equal((await POST(request({ observations: [observation()] }))).status, 204);
      user = { clubId: "a", role: "COACH" };
      assert.equal((await POST(request({ observations: [observation({ resourcePath: "/api/data?token=secret" })] }))).status, 400);
      assert.equal((await POST(request({ observations: Array.from({ length: 41 }, () => observation()) }))).status, 400);
      assert.equal((await POST(new Request("https://app.test/api/monitoring/transfer", { method: "POST", body: "x".repeat(20_001) }))).status, 413);
    });
    await t.test("explorer SQL reconciles details and aggregates and paginates identical timestamps", async () => {
      const observations = Array.from({ length: 55 }, () => observation({ startedAt: sample.startedAt, pageId: sample.pageId }));
      for (let i = 0; i < observations.length; i += 20) assert.equal((await POST(request({ observations: observations.slice(i, i + 20) }))).status, 200);
      // Legacy clients remain compatible and their lack of details stays measurable.
      assert.equal((await POST(request({ entries: [{ route: "/coach", resourceType: "script", requests: 3, transferBytes: 100, cacheHits: 0 }] }))).status, 200);
      const explorer = load<{ getRequestExplorer: (filters: object) => Promise<{ list: RequestObservation[]; hasMore: boolean; summary: { count: string }; total: { count: string } }> }>("src/lib/request-explorer.ts", { "server-only": {}, "@/lib/db": { query } });
      const filters = { from: previousHour, to: new Date(previousHour.getTime() + 2 * 3_600_000), route: "/coach", type: null, trigger: null, pageId: null, before: null, beforeId: null };
      const first = await explorer.getRequestExplorer(filters);
      assert.equal(first.summary.count, "56"); assert.equal(first.total.count, "59"); assert.equal(first.list.length, 50); assert.equal(first.hasMore, true);
      const last = first.list.at(-1)!;
      const second = await explorer.getRequestExplorer({ ...filters, before: last.startedAt, beforeId: last.id });
      assert.equal(second.list.length, 6); assert.equal(second.hasMore, false);
      assert.equal(new Set([...first.list, ...second.list].map(item => item.id)).size, 56);
      const empty = await explorer.getRequestExplorer({ ...filters, route: "/athlete" }); assert.equal(empty.summary.count, "0");
    });
    await t.test("SQL correlation requires matching club and destination; unknown never becomes zero", async () => {
      const traceId = randomUUID();
      await db.query(`UPDATE "RequestObservation" SET "serverRequestId"=$1,"startedAt"=$3 WHERE id=$2`,[traceId,sample.id,new Date(previousHour.getTime()+59*60_000+1000)]);
      await db.query(`INSERT INTO "ServerRequestMetric" VALUES ($1,'b','/api/coach/sessions/:id/progress','prefetch',NOW(),3,2400,45,0)`,[traceId]);
      const explorer = load<typeof import("./request-explorer")>("src/lib/request-explorer.ts", { "server-only": {}, "@/lib/db": { query } });
      const filters = { from:previousHour,to:new Date(previousHour.getTime()+2*3_600_000),route:"/coach",type:null,trigger:null,pageId:null,before:null,beforeId:null };
      const observed = async () => (await explorer.getRequestExplorer(filters)).list.find(row=>row.id===sample.id)!;
      assert.equal((await observed()).sqlQueries,null,"another club cannot be correlated by a supplied UUID");
      await db.query(`UPDATE "ServerRequestMetric" SET "clubId"='a',route='/wrong' WHERE id=$1`,[traceId]);
      assert.equal((await observed()).sqlQueries,null,"the destination must match");
      await db.query(`UPDATE "ServerRequestMetric" SET route='/api/coach/sessions/:id/progress' WHERE id=$1`,[traceId]);
      const matched = await observed();assert.equal(matched.sqlQueries,3);assert.equal(matched.serverTrigger,"prefetch");assert.equal(matched.sqlBytes,"2400");
    });
    await t.test("daily cleanup requires the cron secret, deletes old detail and keeps aggregates", async () => {
      await db.exec(`UPDATE "RequestObservation" SET "startedAt" = NOW() - INTERVAL '8 days' WHERE id = '${sample.id}';`);
      await db.query(`INSERT INTO "ServerRequestMetric" VALUES ($1,'a','/coach','navigation',NOW()-INTERVAL '8 days',1,100,20,0)`,[randomUUID()]);
      const { GET } = load<{ GET: (r: Request) => Promise<Response> }>("src/app/api/cron/request-observations/route.ts", { "@/lib/db": { query } }, { process: { env: { CRON_SECRET: "test-secret" } } });
      assert.equal((await GET(new Request("https://app.test/api/cron/request-observations"))).status, 401);
      const response = await GET(new Request("https://app.test/api/cron/request-observations", { headers: { authorization: "Bearer test-secret" } }));
      const purged = await response.json();
      assert.equal(purged.deleted,1);assert.equal(purged.serverDeleted,1);
      assert.equal((await db.query(`SELECT * FROM "ServerRequestMetric"`)).rows.length,1);
      const totals = await db.query<{ count: number }>(`SELECT sum(requests)::int AS count FROM "TransferTelemetryHour"`);
      assert.equal(totals.rows[0].count, 59);
    });
  } finally { await db.close(); }
});

test("collector attributes a delayed resource to its start page, splits payloads and excludes itself", () => {
  const sent: string[] = [];
  let tick = 50;
  let observerCallback: (list: { getEntries: () => unknown[] }) => void = () => {};
  let flush: () => void = () => {};
  class Resource {
    entryType = "resource"; initiatorType = "fetch"; name = "https://app.test/api/data?token=private";
    startTime = 20; transferSize = 100; encodedBodySize = 50; duration = 15; responseStatus = 200;
  }
  class Observer {
    callback: typeof observerCallback;
    constructor(callback: typeof observerCallback) { this.callback = callback; }
    observe({ type }: { type: string }) {
      if (type === "resource") observerCallback = this.callback;
      else throw new Error("Navigation Timing unsupported");
    }
  }
  const { onRouterTransitionStart } = load<{ onRouterTransitionStart: (url: string) => void }>("src/instrumentation-client.ts", {
    "@sentry/nextjs": { init: () => {}, captureRouterTransitionStart: () => {} },
    "@/lib/client-errors": { isExternalWebVitalsError: () => false },
    "@/lib/request-observation": { observationTrigger, resourcePath, resourceType },
    "@/lib/sentry-privacy": { sanitizeErrorEvent: (event: unknown) => event, sanitizeTransactionEvent: (event: unknown) => event }
  }, {
    process: { env: { NODE_ENV: "production" } },
    window: { location: { pathname: "/coach", href: "https://app.test/coach", origin: "https://app.test" }, addEventListener: () => {}, setInterval: (callback: () => void) => { flush = callback; } },
    document: { addEventListener: () => {} }, crypto: { randomUUID },
    performance: { now: () => tick, timeOrigin: Date.now() - 1000 },
    navigator: { sendBeacon: (_url: string, body: { text: string }) => { sent.push(body.text); return true; } },
    Blob: class { text: string; constructor(parts: string[]) { this.text = parts.join(""); } },
    PerformanceObserver: Observer, PerformanceResourceTiming: Resource
  });
  onRouterTransitionStart("/coach/athletes");
  const delayed = new Resource();
  observerCallback({ getEntries: () => [delayed] });
  tick = 100;
  const next = new Resource(); next.startTime = 60;
  const self = new Resource(); self.name = "https://app.test/api/monitoring/transfer";
  observerCallback({ getEntries: () => [next, self, ...Array.from({ length: 80 }, () => next)] });
  flush();
  assert.ok(sent.every(body => body.length < 20_000));
  const bodies = sent.map(body => JSON.parse(body));
  const details = bodies.flatMap(body => body.observations ?? []);
  assert.equal(details[0].route, "/coach");
  assert.equal(details[1].route, "/coach/athletes");
  assert.equal(details[0].resourcePath, "/api/data");
  assert.equal(details.length, 60, "bounded buffer keeps overflow in aggregate counters");
  assert.equal(bodies.flatMap(body => body.entries ?? []).reduce((sum, item) => sum + item.requests, 0), 22);
  assert.ok(!JSON.stringify(bodies).includes("private"));
  flush(); assert.equal(sent.length, bodies.length, "empty flush does not resend");
});

test("admin explorer checks authorization before queries, handles missing schema and repeated parameters", async () => {
  let authorized = false;
  let reads = 0;
  let missing = false;
  const denied = new Error("admin required");
  const Page = load<{ default: (props: { searchParams: Promise<object> }) => Promise<unknown> }>("src/app/admin/observability/requests/page.tsx", {
    "lucide-react": new Proxy({}, { get: () => function Icon() {} }),
    "react/jsx-runtime": { jsx: (type: unknown, props: unknown) => ({ type, props }), jsxs: (type: unknown, props: unknown) => ({ type, props }) },
    "@/components/ui/app-link": {}, "@/components/admin/admin-shell": {},
    "@/lib/current-user": { requireAdmin: async () => { if (!authorized) throw denied; } },
    "@/lib/request-explorer": { getRequestExplorer: async () => { reads++; if (missing) throw Object.assign(new Error("missing"), { code: "42P01" }); throw new Error("unexpected read"); } },
    "@/lib/request-observation": { observationWindow, resourcePath, resourceLabels: {}, requestTriggers: {} },
    "@/lib/timezone": { formatMontrealDate: () => "" }
  }).default;
  await assert.rejects(Page({ searchParams: Promise.resolve({}) }), error => error === denied);
  assert.equal(reads, 0);
  authorized = true;
  const repeated = await Page({ searchParams: Promise.resolve({ route: ["/coach", "/athlete"] }) });
  assert.match(JSON.stringify(repeated), /Filtres invalides/); assert.equal(reads, 0);
  missing = true;
  const unavailable = await Page({ searchParams: Promise.resolve({}) });
  assert.match(JSON.stringify(unavailable), /migrations 0026 et 0027/); assert.equal(reads, 1);
});
