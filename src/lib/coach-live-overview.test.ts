import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { isValidElement, type ReactNode } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";
import { liveSessionForClient, type LiveProgress } from "./live-session";
import type { CoachSession } from "./coach-session";

test("real overview page consumes plan-only live data and preserves the separate progress snapshot", async () => {
  const plan = {
    id: "session-a", status: "IN_PROGRESS", date: new Date("2026-10-30T22:00:00Z"), notes: "Synthetic summary",
    week: { clubId: "club-a", group: { name: "Synthetic group" } },
    blocks: [{ id: "pool", type: "POOL", title: "Pool", position: 0, drylandExercises: [],
      assignments: [{ id: "assignment", sessionBlockId: "pool", athleteId: "athlete-a", athlete: { id: "athlete-a", user: { firstName: "Alpha", lastName: "Test" } } }],
      poolTraining: { sections: [{ id: "section", label: "1 m", height: "ONE_METER", dives: [{ id: "dive", diveCode: "101A", repetitions: 5 }] }] }
    }]
  };
  const progress: LiveProgress = { status: "IN_PROGRESS", planVersion: "synthetic-v1", absences: [{ athleteId: "athlete-a" }],
    diveLogs: [{ athleteId: "athlete-a", poolDiveId: "dive", repetitionsCompleted: 3 }], exerciseLogs: [] };
  const full = { ...plan, completions: [{ athleteId: "athlete-a", status: "COMPLETED", rating: "Bien", note: "Synthetic feedback" }],
    absences: progress.absences, diveLogs: progress.diveLogs, exerciseLogs: progress.exerciseLogs };
  const coachNotes = [{ athleteId: "athlete-a", note: "Synthetic coach note" }];
  let state = "IN_PROGRESS";
  let missing = false;
  let noteReads = 0;
  const CoachShell = () => null;
  const ActiveSessionOverview = () => null;
  const CompletedSessionOverview = () => null;
  const file = ts.createSourceFile("page.tsx", readFileSync("src/app/coach/sessions/[id]/page.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const pageNode = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "SessionDetailPage");
  assert.ok(pageNode);
  const exports: { default?: (props: { params: Promise<{ id: string }> }) => Promise<ReactNode> } = {};
  runInNewContext(ts.transpileModule(pageNode.getText(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText, {
    exports, Date, Map, require: (name: string) => { assert.equal(name, "react/jsx-runtime"); return jsxRuntime; },
    getCoachSession: async (id: string, options?: { includeResults: string }) => {
      assert.equal(id, plan.id); assert.equal(options?.includeResults, "unlessLive");
      return state === "IN_PROGRESS" ? plan : { ...full, status: state };
    },
    query: async () => { noteReads++; return { rows: coachNotes }; },
    getLiveSessionProgress: async (id: string, clubId: string) => {
      assert.equal(id, plan.id); assert.equal(clubId, "club-a"); return missing ? null : progress;
    },
    liveSessionForClient, CoachShell, ActiveSessionOverview, CompletedSessionOverview,
    notFound: () => { throw new Error("NOT_FOUND"); }
  });
  const page = exports.default!;
  const render = async () => {
    const root = await page({ params: Promise.resolve({ id: plan.id }) });
    assert.ok(isValidElement<{ children: ReactNode }>(root)); assert.equal(root.type, CoachShell);
    const child = root.props.children;
    assert.ok(isValidElement<Record<string, unknown>>(child)); return child;
  };
  const live = await render();
  assert.equal(live.type, ActiveSessionOverview);
  assert.equal(live.key, "session-a:synthetic-v1");
  assert.equal(JSON.stringify(live.props.session), JSON.stringify(liveSessionForClient(full as unknown as CoachSession)));
  assert.deepEqual(live.props.initialProgress, progress);
  assert.equal(JSON.stringify(live.props.athletes), JSON.stringify([{ id: "athlete-a", firstName: "Alpha", lastName: "Test" }]));
  assert.equal(noteReads, 0, "live overview never reads unused coach notes");
  missing = true;
  await assert.rejects(render(), /NOT_FOUND/, "a missing progress snapshot never becomes empty fabricated results");
  assert.equal(noteReads, 0);
  state = "COMPLETED";
  const completed = await render();
  assert.equal(completed.type, CompletedSessionOverview);
  const summary = completed.props.session as Record<string, unknown>;
  assert.deepEqual(summary.coachNotes, coachNotes);
  assert.deepEqual(JSON.parse(JSON.stringify(summary.completions)), full.completions);
  assert.equal(JSON.stringify(summary.diveLogs), JSON.stringify(progress.diveLogs));
  assert.equal(JSON.stringify(summary.absences), JSON.stringify(progress.absences));
  assert.equal(noteReads, 1, "completed overview retains its coach notes read");
});
