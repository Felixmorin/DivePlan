import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function harness() {
  let athlete: { id: string } | null = { id: "athlete-a" };
  let assigned = true;
  let available = true;
  let reads = 0;
  const saved: unknown[][] = [];
  const dependencies: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (value: unknown, init?: ResponseInit) => Response.json(value, init) } },
    "@/lib/athlete-session": { getCurrentAthleteIdentity: async () => athlete },
    "@/lib/athlete-progress": {
      getAssignedSessionBlocks: async (sessionId: string, athleteId: string) => {
        reads++;
        return assigned && sessionId === "session-a" && athleteId === "athlete-a"
          ? [{ id: "block-a", exerciseIds: ["exercise-a"], diveIds: ["dive-a"] }] : [];
      },
      persistAthleteProgress: async (...args: unknown[]) => { saved.push(args); }
    },
    "@/lib/db": { query: async () => { reads++; return { rows: [{ date: new Date(), status: "READY", athleteStatus: null }] }; } },
    "@/lib/session-availability": { isSessionStartAvailable: () => available, SESSION_NOT_STARTED_MESSAGE: "not started" }
  };
  const exports: { POST?: (request: Request) => Promise<Response> } = {};
  runInNewContext(ts.transpileModule(readFileSync("src/app/api/athlete/session-progress/route.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, { exports, require: (name: string) => { assert.ok(name in dependencies); return dependencies[name]; } });
  const send = (body: unknown) => exports.POST!(new Request("https://example.test/api/athlete/session-progress", {
    method: "POST", body: JSON.stringify(body)
  }));
  return { send, saved, reads: () => reads,
    identity: (value: typeof athlete) => { athlete = value; },
    assignment: (value: boolean) => { assigned = value; },
    availability: (value: boolean) => { available = value; } };
}

const payload = {
  sessionId: "session-a",
  exercises: [{ exerciseId: "exercise-a", completed: true, rating: null, note: null }],
  dives: [{ poolDiveId: "dive-a", repetitionsCompleted: 8, goldenRepetitions: 2, feedbackCompleted: true, rating: "bien", note: "Synthetic" }],
  sessionFeedback: { rating: "5", note: "Synthetic" }
};

test("malformed progress returns 400 without session reads or persistence", async (t) => {
  const invalid = [null, [], 12, "text", {},
    { ...payload, sessionId: 42 }, { ...payload, sessionId: "" },
    { ...payload, sessionFeedback: null }, { ...payload, sessionFeedback: { rating: 5, note: null } },
    { ...payload, exercises: [null] }, { ...payload, exercises: [12] },
    { ...payload, exercises: [{ ...payload.exercises[0], completed: "false" }] },
    { ...payload, exercises: [{ ...payload.exercises[0], note: {} }] },
    { ...payload, dives: [null] },
    ...["8", null, 1.5, Number.MAX_SAFE_INTEGER + 1].map((value) => ({ ...payload, dives: [{ ...payload.dives[0], repetitionsCompleted: value }] })),
    { ...payload, dives: [{ ...payload.dives[0], goldenRepetitions: "2" }] },
    { ...payload, dives: [{ ...payload.dives[0], feedbackCompleted: 1 }] },
    { ...payload, dives: [{ ...payload.dives[0], poolDiveId: "" }] }
  ];
  const h = harness();
  for (const body of invalid) {
    const response = await h.send(body);
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.deepEqual(await response.json(), { error: "Invalid progress payload" });
  }
  assert.equal(h.reads(), 0);
  assert.equal(h.saved.length, 0);
  t.diagnostic(`Synthetic: ${invalid.length} malformed bodies rejected; zero assignment/status reads and zero persistence calls after authentication. No production incident or transfer measurement.`);
});

test("valid partial and full progress is passed unchanged, including repeated items and extra reps", async () => {
  const h = harness();
  for (const body of [payload, { sessionId: "session-a", exercises: [], dives: [] },
    { ...payload, sessionFeedback: { rating: null, note: null } },
    { ...payload, exercises: [...payload.exercises, ...payload.exercises], dives: [{ ...payload.dives[0], repetitionsCompleted: 700, goldenRepetitions: 600 }] }]) {
    assert.equal((await h.send(body)).status, 200);
    assert.deepEqual(JSON.parse(JSON.stringify(h.saved.at(-1)?.[0])), body);
    assert.equal(h.saved.at(-1)?.[1], "athlete-a");
  }
});

test("authentication, assignment and scheduling still gate valid saves", async () => {
  const h = harness();
  h.identity(null);
  assert.equal((await h.send(null)).status, 401);
  assert.equal(h.reads(), 0);
  h.identity({ id: "athlete-b" });
  assert.equal((await h.send(payload)).status, 403);
  h.identity({ id: "athlete-a" });
  h.assignment(false);
  assert.equal((await h.send(payload)).status, 403);
  h.assignment(true);
  h.availability(false);
  assert.equal((await h.send(payload)).status, 409);
  assert.equal(h.saved.length, 0);
});

// pagehide/sendBeacon serializes the full player snapshot. Exercise the actual
// builder so stricter validation cannot silently break mobile navigation saves.
test("the real player pagehide payload is accepted with repetitions and golden reps intact", async () => {
  const file = ts.createSourceFile("player.tsx", readFileSync("src/components/athlete/session-player.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const builder = file.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "buildSessionProgressPayload");
  assert.ok(builder);
  const exports: { buildSessionProgressPayload?: (...args: unknown[]) => unknown } = {};
  runInNewContext(ts.transpileModule(`export ${builder.getText(file)}`, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports });
  const body = exports.buildSessionProgressPayload!("session-a", [
    { exercises: [{ id: "exercise-a" }], poolSections: [] },
    { exercises: [], poolSections: [{ dives: [{ id: "dive-a" }] }] }
  ], { "exercise-a": true }, { "dive-a": [1, 2, 0, 2] });
  const h = harness();
  assert.equal((await h.send(body)).status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(h.saved[0][0])), {
    sessionId: "session-a", exercises: payload.exercises,
    dives: [{ poolDiveId: "dive-a", repetitionsCompleted: 3, goldenRepetitions: 2, feedbackCompleted: false, rating: null, note: null }]
  });
});
