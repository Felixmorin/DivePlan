import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as zod from "zod";

function harness() {
  let actor: { kind: "coach"; id: string } | { kind: "athlete"; id: string } = { kind: "coach", id: "coach-a" };
  let sessionStatus = "IN_PROGRESS";
  let athleteStarted = true;
  let simulationStatus = "LIVE";
  let turnIndex = 0;
  const turns = ["a", "b", "c"].map((athleteId) => ({ athleteId, athleteName: athleteId, diveCode: "101C", diveName: "Forward", height: "ONE_METER", position: 0 }));
  const scores: { turnIndex: number; judgeAthleteId: string | null; judgeCoachId: string | null; rating: number }[] = [];
  const statements: string[] = [];
  const simulation = () => ({ id: "sim-a", sessionId: "session-a", status: simulationStatus, currentTurnIndex: turnIndex, turns, coachId: "coach-a", clubId: "club-a", sessionStatus });
  const tx = { query: async (sql: string, values: unknown[] = []) => {
    statements.push(sql);
    if (sql.includes("FOR UPDATE")) return { rows: [{ status: simulationStatus, currentTurnIndex: turnIndex, sessionStatus }] };
    if (sql.includes("count(*)")) {
      const turnScores = scores.filter((score) => score.turnIndex === values[1]);
      return { rows: [{ received: turnScores.length, coachVotes: turnScores.filter((score) => score.judgeCoachId).length }] };
    }
    if (sql.startsWith("INSERT INTO \"CompetitionSimulationScore\"")) {
      scores.push({ turnIndex: Number(values[2]), judgeAthleteId: values[3] as string | null, judgeCoachId: values[4] as string | null, rating: Number(values[5]) });
    } else if (sql.includes("SET status='LIVE'")) simulationStatus = "LIVE";
    else if (sql.includes("SET status='COMPLETED'")) simulationStatus = "COMPLETED";
    else if (sql.includes('SET "currentTurnIndex"')) turnIndex++;
    return { rows: [], rowCount: 1 };
  } };
  const dependencies: Record<string, unknown> = {
    "node:crypto": { randomUUID: () => "score-a" },
    zod,
    "@/lib/current-user": { requireCoach: async () => ({ coach: { id: actor.id }, clubId: "club-a" }) },
    "@/lib/athlete-session": { getCurrentAthleteIdentity: async () => actor.kind === "athlete" ? { id: actor.id } : null },
    "@/lib/db": {
      query: async (sql: string, values: unknown[] = []) => {
        statements.push(sql);
        if (sql.includes("FROM \"CompetitionSimulation\" cs")) return { rows: [simulation()] };
        if (sql.includes("AthleteSessionCompletion")) return { rows: athleteStarted ? [{ "?column?": 1 }] : [], rowCount: athleteStarted ? 1 : 0 };
        if (sql.includes("CompetitionSimulationScore")) return { rows: scores.filter((score) => score.turnIndex === values[1]), rowCount: scores.length };
        if (sql.includes("FROM \"Athlete\" a")) return { rows: [{ id: "c", name: "Athlete c" }] };
        return { rows: [], rowCount: 0 };
      },
      withTransaction: async (work: (client: typeof tx) => unknown) => work(tx)
    },
    "@/lib/competition-simulation": { eligibleSimulationJudges: (_turns: unknown[], index: number) => index === 0 ? ["c"] : ["a", "c"] }
  };
  const exports: { GET?: (request: Request, context: { params: Promise<{ sessionId: string }> }) => Promise<Response>; POST?: (request: Request, context: { params: Promise<{ sessionId: string }> }) => Promise<Response> } = {};
  runInNewContext(ts.transpileModule(readFileSync("src/app/api/competition-simulation/[sessionId]/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; }, Response });
  const context = { params: Promise.resolve({ sessionId: "session-a" }) };
  return {
    scores, statements,
    setActor: (value: typeof actor) => { actor = value; },
    setSessionStatus: (value: string) => { sessionStatus = value; },
    setAthleteStarted: (value: boolean) => { athleteStarted = value; },
    setSimulationStatus: (value: string) => { simulationStatus = value; },
    post: (body: unknown) => exports.POST!(new Request("https://example.test", { method: "POST", body: JSON.stringify(body) }), context),
    get: () => exports.GET!(new Request("https://example.test"), context)
  };
}

test("athletes cannot read or submit simulation scores before starting their session", async () => {
  const h = harness();
  h.setActor({ kind: "athlete", id: "c" });
  h.setAthleteStarted(false);
  assert.equal((await h.get()).status, 403);
  assert.equal((await h.post({ action: "vote", turnIndex: 0, rating: 8 })).status, 403);
  assert.equal(h.scores.length, 0);
});

test("only the assigned coach can vote or control the simulation", async () => {
  const h = harness();
  h.setActor({ kind: "coach", id: "coach-b" });
  assert.equal((await h.get()).status, 403);
  assert.equal((await h.post({ action: "vote", turnIndex: 0, rating: 8 })).status, 403);
  assert.equal((await h.post({ action: "advance", force: true })).status, 403);
  assert.equal(h.scores.length, 0);
});

test("a simulation cannot start while its training session is still a draft", async () => {
  const h = harness();
  h.setSimulationStatus("READY");
  h.setSessionStatus("DRAFT");
  const response = await h.post({ action: "start" });
  assert.equal(response.status, 409);
  assert.equal(h.statements.some((sql) => sql.includes("SET status='LIVE'")), false);
});

test("force advance still requires the coach vote", async () => {
  const h = harness();
  h.scores.push({ turnIndex: 0, judgeAthleteId: "c", judgeCoachId: null, rating: 8 });
  const response = await h.post({ action: "advance", force: true });
  assert.equal(response.status, 409);
  assert.equal(h.scores.length, 1);
  assert.ok(h.statements.some((sql) => sql.includes("FOR UPDATE")));
  assert.equal(h.statements.some((sql) => sql.includes('SET "currentTurnIndex"')), false);
});

test("votes lock the simulation turn before saving", async () => {
  const h = harness();
  h.setActor({ kind: "athlete", id: "c" });
  assert.equal((await h.post({ action: "vote", turnIndex: 0, rating: 8 })).status, 200);
  assert.ok(h.statements.findIndex((sql) => sql.includes("FOR UPDATE")) < h.statements.findIndex((sql) => sql.startsWith("INSERT INTO \"CompetitionSimulationScore\"")));
  assert.equal(h.scores.length, 1);
});
