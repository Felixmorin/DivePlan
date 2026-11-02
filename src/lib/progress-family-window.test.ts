import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import * as timezone from "./timezone";

// Previous production query: a reference for the same synthetic scenario.
const legacyFamilySql = `SELECT MIN(l.timestamp) AS date,COALESCE(l."familyOverride",CASE left(d."diveCode",1) WHEN '1' THEN 'Avant' WHEN '2' THEN 'Arriere' WHEN '3' THEN 'Renverse' WHEN '4' THEN 'Retourne' WHEN '5' THEN 'Vrille' ELSE 'Equilibre' END) AS category,SUM(l."repetitionsCompleted")::int AS volume FROM "AthleteDiveLog" l JOIN "PoolDive" d ON d.id=l."poolDiveId" WHERE l."athleteId"=$1 GROUP BY (l.timestamp AT TIME ZONE 'America/Toronto')::date,category ORDER BY (l.timestamp AT TIME ZONE 'America/Toronto')::date`;

test("progress family breakdown transfers only the six displayed activity days and preserves all charts", async (t) => {
  const db = new PGlite();
  let pending = Promise.resolve();
  try {
    await db.exec(`CREATE TABLE "PlanningEvent" (id text,duration int);
      CREATE TABLE "TrainingSession" (id text,"planningEventId" text,duration int,date timestamptz,status text);
      CREATE TABLE "SessionBlock" (id text,"sessionId" text);
      CREATE TABLE "SessionBlockAssignment" ("sessionBlockId" text,"athleteId" text);
      CREATE TABLE "AthleteSessionAbsence" ("sessionId" text,"athleteId" text);
      CREATE TABLE "AthleteSessionCompletion" ("sessionId" text,"athleteId" text,"completedAt" timestamptz,status text,rating text);
      CREATE TABLE "PoolSection" (id text,height text,label text);
      CREATE TABLE "PoolDive" (id text PRIMARY KEY,"diveCode" text,"diveName" text,"poolSectionId" text);
      CREATE TABLE "AthleteDiveLog" ("athleteId" text,"poolDiveId" text REFERENCES "PoolDive", "sessionId" text,timestamp timestamptz,"repetitionsCompleted" int,"familyOverride" text,"actualDiveName" text);
      CREATE TABLE "AthleteExerciseLog" ("athleteId" text,completed boolean);
      CREATE TABLE "AthleteSkill" ("athleteId" text,"skillId" text);
      CREATE TABLE "Skill" (id text,category text);
      INSERT INTO "PoolSection" VALUES ('section','ONE_METER','1 m');
      INSERT INTO "PoolDive" SELECT 'dive-'||n,n||'01A','Synthetic dive','section' FROM generate_series(1,6) n;
      INSERT INTO "AthleteDiveLog" SELECT 'athlete-a','dive-'||f,'session',
        '2025-01-01 17:00Z'::timestamptz+n*INTERVAL '2 days', f,NULL,NULL
        FROM generate_series(1,300) n CROSS JOIN generate_series(1,6) f;
      INSERT INTO "AthleteDiveLog" VALUES
        ('athlete-a','dive-1','session','2026-11-01 03:30Z',7,'Personnalisée',NULL),
        ('athlete-a','dive-2','session','2026-11-01 04:30Z',8,NULL,NULL),
        ('athlete-a','dive-3','session','2026-11-01 06:30Z',9,NULL,NULL),
        ('athlete-b','dive-1','other','2027-01-01',999,NULL,NULL);
      INSERT INTO "TrainingSession" VALUES ('session',NULL,60,'2026-01-01','COMPLETED');
      INSERT INTO "SessionBlock" VALUES ('block','session');
      INSERT INTO "SessionBlockAssignment" VALUES ('block','athlete-a');
      INSERT INTO "AthleteSessionCompletion" VALUES ('session','athlete-a','2026-01-01','COMPLETED','GOOD');
      INSERT INTO "AthleteExerciseLog" VALUES ('athlete-a',true);`);
    const source = readFileSync("src/lib/athlete-session.ts", "utf8");
    const load = (legacy: boolean) => {
      let reads = 0; let familyRows: Array<{date:Date;category:string;volume:number}> = []; let familyBytes = 0;
      const exports: Partial<typeof import("./athlete-session")> = {};
      const query = async (sql: string, args: unknown[]) => {
        reads++;
        const family = sql.includes("MIN(l.timestamp)") && sql.includes("AS category");
        const next = pending.then(()=>db.query(family && legacy ? legacyFamilySql : sql,args));
        pending = next.then(()=>undefined,()=>undefined);
        const result = await next;
        if (family) {
          familyRows = result.rows as typeof familyRows;
          familyBytes = Buffer.byteLength(JSON.stringify(result.rows));
        }
        return result;
      };
      const dependencies: Record<string, unknown> = {
        "./pagination": {PAGE_SIZE:20}, "next/navigation": {}, "@/lib/current-user": {},
        "@/lib/db": {query}, "@/lib/pool-list": {}, "@/lib/timezone": timezone
      };
      runInNewContext(ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, {
        exports,Date,Intl,Map,Set,require:(name:string)=>{assert.ok(name in dependencies,name);return dependencies[name];}
      });
      return {get:exports.getAthleteProgressTotals!, stats:()=>({reads, familyRows,familyBytes})};
    };
    const baseline = load(true); const current = load(false);
    const expected = await baseline.get("athlete-a"); const actual = await current.get("athlete-a");
    assert.deepEqual(JSON.parse(JSON.stringify(actual)),JSON.parse(JSON.stringify(expected)),"all returned totals, families, sessions, weekly and monthly charts stay identical");
    const before = baseline.stats(); const after = current.stats();
    assert.equal(after.reads,before.reads,"no extra SQL request or waterfall");
    // Select days, not six rows: every family on each displayed day must survive.
    const recentDays = [...new Set(before.familyRows.map(row=>timezone.toMontrealDateInputValue(row.date)))].sort().slice(-6);
    const expectedRows = before.familyRows.filter(row=>recentDays.includes(timezone.toMontrealDateInputValue(row.date)));
    const stable = (rows:typeof expectedRows) => rows.map(row=>({...row,date:row.date.toISOString()})).sort((a,b)=>a.date.localeCompare(b.date)||a.category.localeCompare(b.category));
    assert.deepEqual(stable(after.familyRows),stable(expectedRows));
    assert.equal(new Set(after.familyRows.map(row=>timezone.toMontrealDateInputValue(row.date))).size,6);
    assert.ok(after.familyBytes < before.familyBytes/10);
    assert.equal(actual.totalDiveRepetitions,6324);
    assert.equal(actual.completedSessions,1); assert.equal(actual.completedExercises,1);
    assert.ok(actual.weeklyChartData.length>6 && actual.monthlyChartData.length>6,"history remains unbounded where the UI needs it");
    t.diagnostic(`Synthetic family SQL result: ${before.familyRows.length} -> ${after.familyRows.length} rows; JSON bytes ${before.familyBytes} -> ${after.familyBytes}; full-loader SELECTs ${before.reads} -> ${after.reads}. Not HTTP/FOT or wire-protocol bytes.`);
    await t.test("charts-only coach mode preserves charts and skips the same summary reads",async()=>{
      const old = load(true); const updated = load(false);
      assert.deepEqual(JSON.parse(JSON.stringify(await updated.get("athlete-a",true))),JSON.parse(JSON.stringify(await old.get("athlete-a",true))));
      assert.equal(updated.stats().reads,old.stats().reads);
    });
    await t.test("other identities, short histories and missing athletes remain isolated",async()=>{
      for(const id of ["athlete-b","missing"]) {
        const old = load(true); const updated = load(false);
        assert.deepEqual(JSON.parse(JSON.stringify(await updated.get(id))),JSON.parse(JSON.stringify(await old.get(id))));
        assert.ok(updated.stats().familyRows.length<=1);
      }
    });
    await t.test("database errors are still propagated without fabricated empty charts",async()=>{
      await db.exec('DROP TABLE "AthleteDiveLog"');
      await assert.rejects(load(false).get("athlete-a"),(error:unknown)=>(error as {code:string}).code==="42P01");
    });
  } finally {await pending; await db.close();}
});
