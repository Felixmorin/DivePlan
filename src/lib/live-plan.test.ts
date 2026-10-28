import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";
import ts from "typescript";
import { liveSessionForClient, type LiveProgress } from "./live-session";
import type { CoachSession } from "./coach-session";
import { formatMontrealDate } from "./timezone";

function fixture() {
  return {
    id: "session", date: new Date("2026-10-24T18:00:00Z"),
    week: { group: { name: "Synthetic group" } },
    absences: [], diveLogs: [], exerciseLogs: [],
    blocks: [{ id: "pool", type: "POOL", title: "Piscine", position: 0,
      assignments: [{ athleteId: "athlete-a" }, { athleteId: "athlete-b" }], drylandExercises: [],
      poolTraining: { sections: [{ id: "section", height: "ONE_METER", label: "1 m",
        dives: [{ id: "dive", diveCode: "101A", repetitions: 5 }] }] }
    }, { id: "dryland", type: "DRYLAND", title: "Dryland", position: 1,
      assignments: [{ athleteId: "athlete-a" }], poolTraining: null,
      drylandExercises: [{ exerciseId: "exercise", sets: 2, reps: 3, duration: null, exercise: { name: "Gainage" } }]
    }]
  } as unknown as CoachSession;
}

function overview(openPresence: boolean, expanded: string | null) {
  const exports: Record<string, React.ComponentType<Record<string, unknown>>> = {};
  const dependencies: Record<string, unknown> = {
    react: { ...React, useState: (initial: unknown) => React.useState(initial === false && openPresence ? true : initial === null ? expanded : initial === "POOL" && expanded === "dryland" ? "DRYLAND" : initial) },
    "react/jsx-runtime": jsx,
    "next/navigation": { useRouter: () => ({ refresh() {} }) },
    "@/components/ui/app-link": { default: ({ children, ...props }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", props, children) },
    "lucide-react": icons,
    "@/app/coach/sessions/actions": { saveSessionAttendance: async () => {} },
    "@/lib/timezone": { formatMontrealDate }
  };
  const code = ts.transpileModule(readFileSync("src/app/coach/sessions/[id]/active-session-overview.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText.replace("jsx: true", "jsx: undefined");
  runInNewContext(code, { exports, require: (name: string) => {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`);
    return dependencies[name];
  } });
  return exports.ActiveSessionOverview;
}

test("plan-only props preserve initial totals, expanded details and attendance controls", () => {
  const source = fixture();
  const plan = liveSessionForClient(source);
  const athletes = [
    { id: "athlete-a", firstName: "Alpha", lastName: "Test" },
    { id: "athlete-b", firstName: "Beta", lastName: "Test" }
  ];
  const progress: LiveProgress = { status: "IN_PROGRESS", planVersion: "v1",
    absences: [{ athleteId: "athlete-b" }],
    diveLogs: [{ athleteId: "athlete-a", poolDiveId: "dive", repetitionsCompleted: 3 }],
    exerciseLogs: [{ athleteId: "athlete-a", exerciseId: "exercise", completed: true }]
  };
  const legacy = { ...plan, absences: source.absences, diveLogs: source.diveLogs, exerciseLogs: source.exerciseLogs };
  for (const [presence, expanded] of [[false, "pool"], [true, "dryland"]] as const) {
    const Component = overview(presence, expanded);
    const render = (session: unknown) => renderToStaticMarkup(React.createElement(Component, { session, initialProgress: progress, athletes }));
    const html = render(plan);
    assert.equal(html, render(legacy), "rendered controls and results match the previous props");
    assert.match(html, expanded === "pool" ? /3 \/ 5/ : /6 \/ 6/);
    assert.match(html, expanded === "pool" ? /60%/ : /100%/);
    if (presence) {
      assert.match(html, /name="absentAthleteIds" value="athlete-b"/);
      assert.match(html, /name="sessionId" value="session"/);
      assert.match(html, /Gainage/);
    } else assert.match(html, /101A/);
  }
  assert.deepEqual(source.absences, [], "the serializer does not mutate the source");
});

test("synthetic initial props benchmark removes a second copy of all progress arrays", (t) => {
  const source = fixture();
  const plan = liveSessionForClient(source);
  const assignments = Array.from({ length: 60 }, (_, i) => ({ athleteId: `athlete-${i}` }));
  plan.blocks[0].assignments = assignments;
  plan.blocks[1].assignments = assignments;
  plan.blocks[0].poolTraining!.sections[0].dives = Array.from({ length: 20 }, (_, i) => ({ id: `dive-${i}`, diveCode: "101A", repetitions: 5 }));
  plan.blocks[1].drylandExercises = Array.from({ length: 5 }, (_, i) => ({ exerciseId: `exercise-${i}`, sets: 2, reps: 3, duration: null, exercise: { name: "Gainage" } }));
  const progress: LiveProgress = {
    status: "IN_PROGRESS", planVersion: "synthetic", absences: [{ athleteId: "athlete-59" }],
    diveLogs: Array.from({ length: 1200 }, (_, i) => ({ athleteId: `athlete-${Math.floor(i / 20)}`, poolDiveId: `dive-${i % 20}`, repetitionsCompleted: 3 })),
    exerciseLogs: Array.from({ length: 300 }, (_, i) => ({ athleteId: `athlete-${Math.floor(i / 5)}`, exerciseId: `exercise-${i % 5}`, completed: i % 2 === 0 }))
  };
  const { absences, diveLogs, exerciseLogs } = progress;
  const before = Buffer.byteLength(JSON.stringify({ session: { ...plan, absences, diveLogs, exerciseLogs }, initialProgress: progress }));
  const after = Buffer.byteLength(JSON.stringify({ session: plan, initialProgress: progress }));
  assert.ok(after < before * 0.55);
  assert.equal("diveLogs" in plan, false);
  assert.equal(progress.diveLogs.length, 1200);
  t.diagnostic(`Synthetic serialized props JSON: ${before} -> ${after} bytes. Not compressed HTTP, measured RSC, PostgreSQL, JS or billed FOT.`);
});
