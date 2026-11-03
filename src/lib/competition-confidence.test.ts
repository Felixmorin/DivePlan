import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";

test("competition ratings load the latest athlete value for each current dive while history remains complete", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "CompetitionDive" (id text PRIMARY KEY,"athleteId" text,"listId" text);
      CREATE TABLE "AthleteCompetitionDiveEvaluation" (id text PRIMARY KEY,"athleteId" text,"sessionId" text,"competitionDiveId" text,
        "diveCode" text,height text,rating int,evaluator text,"evaluatedAt" timestamptz,
        UNIQUE ("athleteId","sessionId","competitionDiveId"));
      INSERT INTO "CompetitionDive" SELECT 'dive-'||n,'athlete-a',CASE WHEN n<=6 THEN 'active' ELSE 'secondary' END FROM generate_series(1,12) n;
      INSERT INTO "CompetitionDive" VALUES ('foreign','athlete-b','other-list'),('unrated','athlete-a','active');
      INSERT INTO "AthleteCompetitionDiveEvaluation"
        SELECT 'athlete-'||d||'-'||n,'athlete-a','session-'||n,'dive-'||d,'101A','ONE_METER',n%6,'ATHLETE','2026-01-01'::timestamptz+n*INTERVAL '1 day'
        FROM generate_series(1,12) d CROSS JOIN generate_series(1,100) n;
      INSERT INTO "AthleteCompetitionDiveEvaluation"
        SELECT 'coach-'||d||'-'||n,'athlete-a',NULL,'dive-'||d,'101A','ONE_METER',5,'COACH','2026-01-01'::timestamptz+n*INTERVAL '1 day'+INTERVAL '1 hour'
        FROM generate_series(1,12) d CROSS JOIN generate_series(1,100) n;
      INSERT INTO "AthleteCompetitionDiveEvaluation" VALUES
        ('deleted','athlete-a','old-session','deleted-dive','999A','THREE_METER',1,'ATHLETE','2026-05-01'),
        ('foreign-evaluation','athlete-b','session-100','foreign','401A','THREE_METER',1,'ATHLETE','2026-05-01'),
        ('wrong-owner','athlete-a','session-other','foreign','401A','THREE_METER',2,'ATHLETE','2026-05-01');`);
    let reads = 0; let bytes = 0;
    const query = async (sql: string, args: unknown[]) => {
      reads++; const result = await db.query(sql, args); bytes += Buffer.byteLength(JSON.stringify(result.rows)); return result;
    };
    const exports: Partial<typeof import("./competition-confidence")> = {};
    runInNewContext(ts.transpileModule(readFileSync("src/lib/competition-confidence.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText, { exports, require: (name: string) => {
      if (name === "server-only") return {};
      assert.equal(name, "@/lib/db"); return { query };
    } });
    const get = exports.getCompetitionConfidence!;
    const history = await get("athlete-a", "history"); const historyBytes = bytes;
    assert.equal(history.length, 2402); assert.equal(reads, 1);
    const legacy = await db.query(`SELECT "competitionDiveId","diveCode",height,rating,evaluator,"evaluatedAt" FROM "AthleteCompetitionDiveEvaluation" WHERE "athleteId"=$1 ORDER BY "evaluatedAt"`, ["athlete-a"]);
    assert.deepEqual(history, legacy.rows, "history query and ordering are preserved");
    reads = 0; bytes = 0;
    const latest = await get("athlete-a", "latest-athlete");
    assert.equal(reads, 1); assert.equal(latest.length, 12);
    for (const item of latest) {
      const previous = history.filter(row => row.competitionDiveId === item.competitionDiveId && row.evaluator === "ATHLETE")
        .sort((a,b) => b.evaluatedAt.getTime()-a.evaluatedAt.getTime())[0];
      assert.deepEqual(item, previous); assert.equal(item.rating, 4);
    }
    assert.ok(latest.some(item => item.competitionDiveId === "dive-12"), "secondary lists still receive their ratings");
    assert.ok(!latest.some(item => ["foreign", "deleted-dive", "unrated"].includes(item.competitionDiveId)));
    t.diagnostic(`Synthetic SQL rows: ${history.length} -> ${latest.length}; JSON result bytes ${historyBytes} -> ${bytes}; SELECTs 1 -> ${reads}. No HTTP/FOT measurement.`);
    await t.test("identities are isolated and unevaluated athletes have no fabricated ratings", async () => {
      const other = await get("athlete-b", "latest-athlete");
      assert.deepEqual(other.map(item => item.competitionDiveId), ["foreign"]);
      assert.equal((await get("missing", "latest-athlete")).length, 0);
      assert.equal((await get("missing", "history")).length, 0);
    });
    await t.test("equal timestamps use a stable tie break and missing schema errors still reach the caller", async () => {
      await db.exec(`INSERT INTO "AthleteCompetitionDiveEvaluation" VALUES ('zz-tie','athlete-a',NULL,'dive-1','101A','ONE_METER',2,'ATHLETE','2026-04-11')`);
      const first = await get("athlete-a", "latest-athlete");
      assert.equal(first.find(item => item.competitionDiveId === "dive-1")?.rating, 2);
      assert.deepEqual(await get("athlete-a", "latest-athlete"), first);
      await db.exec(`DROP TABLE "AthleteCompetitionDiveEvaluation"`);
      await assert.rejects(get("athlete-a", "latest-athlete"), (error: unknown) => (error as {code:string}).code === "42P01");
    });
  } finally { await db.close(); }
});

test("coach profile selects bounded ratings only for Competition and preserves chart and error paths", async () => {
  const { isValidElement } = await import("react");
  const jsx = await import("react/jsx-runtime");
  const timezone = await import("./timezone");
  const file = ts.createSourceFile("page.tsx", readFileSync("src/app/coach/athletes/[id]/page.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const node = file.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === "AthleteDetailPage");
  assert.ok(node);
  let clubId = "club-a"; let authorized = true;
  let mode: string | null = null;
  let failure: string | null = null;
  const latest = [{ competitionDiveId: "dive", diveCode: "101A", height: "ONE_METER", rating: 4, evaluator: "ATHLETE", evaluatedAt: new Date("2026-10-01T12:00:00Z") }];
  const history = [...latest, { ...latest[0], evaluator: "COACH", rating: 2 }];
  const query = async (sql: string, args: unknown[]) => ({ rows: sql.includes('WHERE a.id=$1 AND a."clubId"=$2') && args[0] === "athlete-a" && args[1] === "club-a"
    ? [{ id: "athlete-a", firstName: "Alpha", lastName: "Test", level: "Synthetic", active: true, avatar: null, groupId: null, groupName: null, birthDate: null }] : [] });
  const exports: { default?: (props: { params: Promise<{id:string}>; searchParams: Promise<{tab:string}> }) => Promise<unknown> } = {};
  runInNewContext(ts.transpileModule(node.getText(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText, {
    exports, Date, console: { error: () => {} }, require: (name: string) => { assert.equal(name, "react/jsx-runtime"); return jsx; },
    requireCoach: async () => { if (!authorized) throw new Error("FORBIDDEN"); return { clubId }; }, query,
    read: (enabled: boolean, sql: string, args: unknown[]) => enabled ? query(sql,args) : Promise.resolve({ rows: [] }),
    ...timezone, avatarUrlForPage: () => null, resolveAvatarUrls: async () => [null],
    getAthleteProgressTotals: async () => ({ chartData: [], sessionChartData: [], weeklyChartData: [], monthlyChartData: [], skillData: [], skillDives: [] }),
    getAthleteHistory: async () => ({ sessions: [], total: 0, page: 1, minutes: 0, filters: {} }),
    getCompetitionConfidence: async (athleteId: string, selected: string) => {
      assert.equal(athleteId, "athlete-a"); mode = selected;
      if (failure) throw Object.assign(new Error("Synthetic schema error"), { code: failure });
      return selected === "latest-athlete" ? latest : history;
    },
    AthleteDetail: () => null, notFound: () => { throw new Error("NOT_FOUND"); }
  });
  const render = async (tab: string) => {
    mode = null;
    const result = await exports.default!({ params: Promise.resolve({ id: "athlete-a" }), searchParams: Promise.resolve({ tab }) });
    assert.ok(isValidElement<{profile:{competitionConfidence:unknown[];confidenceSchemaUnavailable:boolean}}>(result));
    return result.props.profile;
  };
  for (const [tab, expectedMode, count] of [["competition", "latest-athlete", 1], ["overview", "history", 2], ["evaluations", "history", 2], ["history", null, 0]] as const) {
    const profile = await render(tab);
    assert.equal(mode, expectedMode); assert.equal(profile.competitionConfidence.length, count);
    assert.equal(profile.confidenceSchemaUnavailable, false);
  }
  for (const code of ["42P01", "42703"]) {
    failure = code; const profile = await render("competition");
    assert.equal(profile.confidenceSchemaUnavailable, true); assert.equal(profile.competitionConfidence.length, 0);
  }
  failure = "08006"; await assert.rejects(render("competition"), /Synthetic schema error/);
  failure = null; clubId = "club-b";
  await assert.rejects(render("competition"), /NOT_FOUND/); assert.equal(mode, null);
  clubId = "club-a"; authorized = false;
  await assert.rejects(render("competition"), /FORBIDDEN/); assert.equal(mode, null);
});
