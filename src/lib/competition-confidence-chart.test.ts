import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

test("confidence chart joins the same dive and height across changed IDs", () => {
  const lines: Array<{ dataKey: string; stroke: string }> = [];
  let rows: Array<Record<string, unknown>> = [];
  const container = ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children);
  const charts = {
    ResponsiveContainer: container,
    LineChart: ({ data, children }: { data: typeof rows; children?: React.ReactNode }) => { rows = data; return React.createElement(React.Fragment, null, children); },
    Line: (props: { dataKey: string; stroke: string }) => { lines.push(props); return null; },
    CartesianGrid: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null
  };
  const exports: { CompetitionConfidenceChart?: React.ComponentType<{ data: unknown[]; initialDiveId?: string }> } = {};
  runInNewContext(ts.transpileModule(readFileSync("src/components/athlete/competition-confidence-chart.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
  }).outputText, { exports, Intl, Date, Map, require: (name: string) => {
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return jsx;
    if (name === "recharts") return charts;
    if (name === "@/components/ui/card") return { Card: container, CardContent: container, CardHeader: container, CardTitle: container };
    throw new Error(name);
  } });
  const point = { code: "5231D", height: "THREE_METER", evaluator: "ATHLETE" };
  const data = [
    { ...point, competitionDiveId: "old", rating: 2, evaluatedAt: "2026-09-28T12:00:00Z" },
    { ...point, competitionDiveId: "new", rating: 4, evaluatedAt: "2026-11-10T12:00:00Z" },
    { ...point, competitionDiveId: "other-height", height: "ONE_METER", rating: 3, evaluatedAt: "2026-11-10T12:00:00Z" },
    { ...point, competitionDiveId: "new", evaluator: "COACH", rating: 5, evaluatedAt: "2026-11-10T12:00:00Z" }
  ];
  const Chart = exports.CompetitionConfidenceChart!;
  const html = renderToStaticMarkup(React.createElement(Chart, { data }));
  assert.equal(lines.length, 3);
  assert.deepEqual(Array.from(rows, (row) => row[lines[0].dataKey]), [2, 4]);
  assert.equal(lines[0].stroke, lines[2].stroke);
  assert.notEqual(lines[0].stroke, lines[1].stroke);
  assert.equal((html.match(/5231D · Athlète/g) ?? []).length, 2);
  lines.length = 0;
  renderToStaticMarkup(React.createElement(Chart, { data, initialDiveId: "new" }));
  assert.equal(lines.length, 2);
  assert.deepEqual(Array.from(rows, (row) => row[lines[0].dataKey]), [2, 4]);
});
