import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import * as pagination from "./pagination";
import { parseMontrealSessionDate } from "./timezone";
function load<T>(path:string, dependencies:Record<string,unknown>):T {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,URLSearchParams,Date,require:(name:string)=>{assert.ok(name in dependencies,`Unexpected dependency ${name}`);return dependencies[name];}});
  return exports as T;
}
test("bounded SQL pagination filters the whole dataset and isolates clubs and athletes",async()=>{
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE "TrainingGroup" (id text PRIMARY KEY,name text,"clubId" text);
      CREATE TABLE "TrainingWeek" (id text PRIMARY KEY,"clubId" text,"groupId" text);
      CREATE TABLE "TrainingSession" (id text PRIMARY KEY,title text,date timestamp,duration int,status text,"weekId" text,"planningEventId" text);
      CREATE TABLE "PlanningEvent" (id text PRIMARY KEY,duration int,location text);
      CREATE TABLE "SessionBlock" (id text PRIMARY KEY,"sessionId" text,"estimatedVolume" int);
      CREATE TABLE "SessionBlockAssignment" ("sessionBlockId" text,"athleteId" text);
      CREATE TABLE "AthleteSessionCompletion" ("athleteId" text,"sessionId" text,status text,rating text);
      CREATE TABLE "AthleteDiveLog" ("athleteId" text,"sessionId" text,"repetitionsCompleted" int);
      CREATE TABLE "CoachAthleteSessionNote" ("athleteId" text,"sessionId" text,note text);
      INSERT INTO "TrainingGroup" VALUES ('ga','Groupe A','a'),('gb','Groupe B','b');
      INSERT INTO "TrainingWeek" VALUES ('wa','a','ga'),('wb','b','gb');
      INSERT INTO "TrainingSession" SELECT 's'||lpad(i::text,3,'0'),'Séance '||i,'2026-10-20',60,CASE WHEN i<=30 THEN 'COMPLETED' ELSE 'DRAFT' END,'wa',NULL FROM generate_series(1,60) i;
      INSERT INTO "TrainingSession" VALUES ('foreign','Secret','2026-10-20',60,'COMPLETED','wb',NULL),('percent','100% exact','2026-10-20',60,'COMPLETED','wa',NULL);
      INSERT INTO "AthleteSessionCompletion" SELECT 'athlete-a',id,'COMPLETED','Bien' FROM "TrainingSession";
      INSERT INTO "AthleteDiveLog" VALUES ('athlete-a','s001',12),('other-athlete','s001',9999);
    `);
    await db.exec(readFileSync("db/migrations/0028_session_read_indexes.sql","utf8"));
    const query=(sql:string,args:unknown[])=>db.query(sql,args);
    const lists=load<typeof import("./coach-sessions-list")>("src/lib/coach-sessions-list.ts",{"server-only":{},"./db":{query},"./pagination":pagination});
    const first=await lists.getCoachSessionsPage("a",{});
    const second=await lists.getCoachSessionsPage("a",{page:"2"});
    assert.equal(first.total,61);assert.equal(first.sessions.length,25);assert.equal(second.sessions.length,25);
    assert.equal(new Set([...first.sessions,...second.sessions].map(s=>s.id)).size,50,"ties have stable nonoverlapping ordering");
    assert.ok(!first.sessions.some(s=>s.id==="foreign"));
    const drafts=await lists.getCoachSessionsPage("a",{tab:"drafts",page:"999999"});
    assert.equal(drafts.total,30);assert.equal(drafts.page,2);assert.equal(drafts.sessions.length,5);
    assert.equal((await lists.getCoachSessionsPage("a",{q:"100%"})).total,1,"wildcards are literal");
    assert.equal((await lists.getCoachSessionsPage("a",{group:"gb"})).total,0);
    const currentMonth = new Intl.DateTimeFormat("en-CA",{timeZone:"America/Toronto",year:"numeric",month:"2-digit"}).format(new Date());
    assert.equal((await lists.getCoachSessionsPage("a",{period:"month"})).total,currentMonth === "2026-10" ? 61 : 0);
    const history=load<typeof import("./athlete-history")>("src/lib/athlete-history.ts",{"server-only":{},"@/lib/db":{query},"./pagination":pagination,"./timezone":{parseMontrealSessionDate}});
    const start=new Date("2026-09-01T04:00:00Z");
    const h1=await history.getAthleteHistory("athlete-a","a",{},start);
    const h3=await history.getAthleteHistory("athlete-a","a",{page:"3"},start);
    assert.equal(h1.total,61);assert.equal(h1.minutes,61*60);assert.equal(h3.sessions.length,11);assert.equal(h3.minutes,h1.minutes,"summary spans all pages");
    assert.equal(h3.sessions.find(s=>s.id==="s001")?.volume,12,"volume is scoped to the athlete");
    assert.equal((await history.getAthleteHistory("athlete-a","a",{month:"2026-09"},start)).total,0);
    assert.equal((await history.getAthleteHistory("athlete-a","a",{q:"100%",status:"COMPLETED"},start)).total,1);
    assert.equal((await history.getAthleteHistory("missing","a",{},start)).total,0);
    assert.equal((await history.getAthleteHistory("athlete-a","a",{q:["bad"] as unknown as string,month:"2026-99"},start)).total,61);
  } finally {await db.close();}
});
