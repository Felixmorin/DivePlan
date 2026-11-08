import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";

test("live rating drafts survive polls, reset for a new turn and display the saved rating", () => {
  const states: unknown[] = [];
  let cursor = 0;
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": jsx,
    react: {
      useState: (initial: unknown) => {
        const index = cursor++;
        if (!(index in states)) states[index] = initial;
        return [states[index], (value: unknown) => { states[index] = value; }];
      },
      useCallback: (callback: unknown) => callback,
      useEffect: () => {},
    },
    "@/components/ui/app-link": { __esModule: true, default: () => null },
    "@/components/ui/button": { Button: () => null },
    "@/lib/visible-polling": {},
  };
  const exports: { CompetitionSimulationLive?: (props: { sessionId: string }) => ReactNode } = {};
  runInNewContext(ts.transpileModule(readFileSync("src/components/competition-simulation-live.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; } });
  const render = () => { cursor = 0; return exports.CompetitionSimulationLive!({ sessionId: "session" }); };
  const nodes = (value: ReactNode): ReactElement<Record<string, unknown>>[] => {
    if (Array.isArray(value)) return value.flatMap(nodes);
    if (!isValidElement<{ children?: ReactNode }>(value)) return [];
    return [value, ...nodes(value.props.children)];
  };
  const button = (label: ReactNode) => {
    const node = nodes(render()).find(node => node.type === "button" && node.props.children === label);
    assert.ok(node); return node;
  };
  const rating = () => nodes(render()).find(node => node.type === "output")!.props.children as string[];
  render();
  const snapshot = { status: "LIVE", turnIndex: 0, totalTurns: 3, turn: null, plannedTurns: [], completedTurns: [], role: "JUDGE", ownRating: null, receivedCount: 0, expectedCount: 2 };
  states[0] = snapshot;
  assert.equal(rating().join(""), "5 / 10");
  (button(8).props.onClick as () => void)();
  states[0] = { ...snapshot, receivedCount: 1 };
  assert.equal(rating().join(""), "8 / 10", "polling must not erase an unsent vote");
  (button("+0,5").props.onClick as () => void)();
  assert.equal(rating().join(""), "8,5 / 10");
  states[0] = { ...snapshot, turnIndex: 1 };
  assert.equal(rating().join(""), "5 / 10", "a new diver starts at the default");
  states[0] = { ...snapshot, turnIndex: 1, ownRating: 7.5 };
  assert.equal(rating().join(""), "7,5 / 10");
  assert.equal(button(8).props.disabled, true, "a saved vote cannot be edited");
});
