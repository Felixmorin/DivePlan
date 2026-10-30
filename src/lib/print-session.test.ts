import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { createElement, type ReactNode } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { formatMontrealDate } from "./timezone";
import { countPoolContexts } from "./pool-list";

// Render the real print page with both loader shapes. Results never belong to
// the printed plan; preferences, pool lists and exercise notes must stay intact.
test("print markup is identical with the plan-only loader for every print preference combination", async () => {
  const plan = {
    id: "session", title: "Synthetic print plan", date: new Date("2026-10-30T18:00:00Z"), duration: 90,
    notes: "Synthetic coach note", week: { group: { name: "Synthetic group" } },
    blocks: ["DRYLAND", "POOL"].map((type, i) => ({
      id: `block-${i}`, type, description: "Synthetic block note", estimatedVolume: 6,
      assignments: ["Alpha", "Beta"].map(name => ({ athleteId: name, athlete: { id: name, user: { firstName: name, lastName: "Test" } } })),
      drylandExercises: type === "DRYLAND" ? [{ exerciseId: "exercise", order: 0, sets: 2, reps: 5, notes: "Synthetic exercise note", exercise: { name: "Gainage" } }] : [],
      poolTraining: type === "POOL" ? { sections: [{ id: "section", height: "ONE_METER", label: "1 m", dives: [{ id: "dive", diveCode: "101A", repetitions: 6 }] }] } : null
    }))
  };
  const full = { ...plan, diveLogs: [{ repetitionsCompleted: 3, goldenRepetitions: 1 }], exerciseLogs: [{ completed: true }], absences: [{ athleteId: "Beta" }], completions: [{ athleteId: "Alpha", status: "COMPLETED" }] };
  let usePlan = false;
  let preferences = { printShowCoachNotes: true, printShowAthleteNames: true, printRepetitionChecks: true };
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": jsxRuntime,
    "@/components/coach/print-button": { PrintButton: () => createElement("button", { type: "button" }, "Imprimer") },
    "@/lib/current-user": { requireCoach: async () => ({ coach: preferences }) },
    "@/lib/coach-session": { getCoachSession: async (id: string, options: { includeResults: boolean }) => {
      assert.equal(id, plan.id); assert.equal(options.includeResults, false);
      return usePlan ? plan : full;
    } },
    "@/lib/timezone": { formatMontrealDate }, "@/lib/pool-list": { countPoolContexts }
  };
  const exports: { default?: (props: { params: Promise<{ id: string }> }) => Promise<ReactNode> } = {};
  const code = ts.transpileModule(readFileSync("src/app/coach/sessions/[id]/print/page.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  runInNewContext(code, { exports, require: (name: string) => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name];
  } });
  const render = async () => renderToStaticMarkup(await exports.default!({ params: Promise.resolve({ id: plan.id }) }));
  for (let mask = 0; mask < 8; mask++) {
    preferences = { printShowCoachNotes: Boolean(mask & 1), printShowAthleteNames: Boolean(mask & 2), printRepetitionChecks: Boolean(mask & 4) };
    usePlan = false; const before = await render();
    usePlan = true; const after = await render();
    assert.equal(after, before);
    assert.match(after, /101A/); assert.match(after, /Gainage/);
    assert.equal(after.includes("Synthetic coach note"), preferences.printShowCoachNotes);
    assert.equal(after.includes("Alpha Test"), preferences.printShowAthleteNames);
    assert.equal(after.includes("Fait"), preferences.printRepetitionChecks);
  }
});
