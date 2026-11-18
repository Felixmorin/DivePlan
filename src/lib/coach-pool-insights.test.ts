import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AthleteWellnessTrends } from "../components/coach/athlete-wellness-trends";
import type { AthletePoolInsight } from "./coach-pool-insights";

test("wellness chart handles empty, single and latest seven valid ratings", () => {
  const render = (sessions: Parameters<typeof AthleteWellnessTrends>[0]["sessions"]) => renderToStaticMarkup(createElement(AthleteWellnessTrends, { sessions }));
  assert.match(render([]), /Aucune évaluation/);
  const single = render([{ id: "one", date: "2026-11-01", rating: " Très bien " }]);
  assert.match(single, /5\.0/);
  assert.match(single, /cx="54"/);
  assert.doesNotMatch(single, /NaN/);
  const sessions = Array.from({ length: 8 }, (_, index) => ({ id: String(index), date: `2026-11-0${index + 1}`, rating: index ? "bien" : "pas bien" }));
  const chart = render([...sessions.reverse(), { id: "invalid", date: "2026-11-09", rating: "unknown" }]);
  assert.match(chart, /4\.0/);
  assert.equal((chart.match(/<circle/g) ?? []).length, 7);
});

test("pool insights load seven ratings per athlete within the coach club", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "Athlete" (id text, "clubId" text);
      CREATE TABLE "TrainingWeek" (id text, "clubId" text);
      CREATE TABLE "TrainingSession" (id text, date timestamptz, "weekId" text);
      CREATE TABLE "AthleteSessionCompletion" ("athleteId" text, "sessionId" text, rating text);
      INSERT INTO "Athlete" VALUES ('a','club'),('b','club'),('foreign','other');
      INSERT INTO "TrainingWeek" VALUES ('week','club'),('other-week','other');
      INSERT INTO "TrainingSession" SELECT 's'||n, '2026-11-01'::timestamptz + n * interval '1 day', 'week' FROM generate_series(1,9) n;
      INSERT INTO "TrainingSession" VALUES ('foreign-session','2026-12-01','other-week');
      INSERT INTO "AthleteSessionCompletion" SELECT 'a','s'||n, CASE WHEN n=9 THEN 'unknown' ELSE 'bien' END FROM generate_series(1,9) n;
      INSERT INTO "AthleteSessionCompletion" VALUES ('b','s1','difficile'),('foreign','s8','très bien'),('a','foreign-session','pas bien');`);
    const exports: Record<string, unknown> = {};
    runInNewContext(ts.transpileModule(readFileSync("src/lib/coach-pool-insights.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText, { exports, require: () => ({ query: (sql: string, args: unknown[]) => sql.includes("CROSS JOIN LATERAL") ? db.query(sql, args) : Promise.resolve({ rows: [] }) }) });
    const load = exports.getCoachPoolInsights as (ids: string[], club: string) => Promise<Record<string, AthletePoolInsight>>;
    const result = await load(["a", "b", "foreign"], "club");
    assert.deepEqual(Array.from(result.a.wellnessSessions, (point) => point.id), ["s8", "s7", "s6", "s5", "s4", "s3", "s2"]);
    assert.equal(result.b.wellnessSessions[0].rating, "difficile");
    assert.equal(result.foreign.wellnessSessions.length, 0);
    assert.equal(Object.keys(await load([], "club")).length, 0);
  } finally { await db.close(); }
});
