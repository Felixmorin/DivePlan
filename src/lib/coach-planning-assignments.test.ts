import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { createElement, type ReactElement, type ReactNode } from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";
import * as timezone from "./timezone";
import * as demoData from "./data";

type Session = {
  id: string; status: string; planningEventId: string | null;
  blocks: Array<{ type: string; estimatedVolume: number; assignments: Array<{ athleteId: string }> }>;
  completions: Array<{ sessionId: string; status: string }>;
};
type View = ReactElement<{ sessions: Session[]; events: Array<{id:string}> }>;

test("coach planning loads assignments through session blocks instead of comparing different identifier types", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "TrainingWeek" (id text PRIMARY KEY,"clubId" text);
      CREATE TABLE "TrainingSession" (id text PRIMARY KEY,"weekId" text,title text,date timestamptz,duration int,status text,"planningEventId" text,"calendarHiddenAt" timestamptz);
      CREATE TABLE "SessionBlock" (id text PRIMARY KEY,"sessionId" text,type text,"estimatedVolume" int,position int);
      CREATE TABLE "SessionBlockAssignment" ("sessionBlockId" text,"athleteId" text,PRIMARY KEY("sessionBlockId","athleteId"));
      CREATE TABLE "AthleteSessionCompletion" ("sessionId" text,status text);
      CREATE TABLE "TrainingGroup" (id text PRIMARY KEY,name text,"clubId" text);
      CREATE TABLE "User" (id text PRIMARY KEY,"firstName" text,"lastName" text);
      CREATE TABLE "Athlete" (id text PRIMARY KEY,"userId" text,"clubId" text,active boolean);
      CREATE TABLE "PlanningEvent" (id text PRIMARY KEY,type text,title text,"startsAt" timestamptz,"endsAt" timestamptz,duration int,location text,notes text,"cancelledAt" timestamptz,"groupId" text,"athleteId" text,"clubId" text,"coachCalendarHiddenAt" timestamptz);
      INSERT INTO "TrainingWeek" VALUES ('week-a','club-a'),('week-b','club-b');
      INSERT INTO "TrainingSession" VALUES
        ('session-a','week-a','Synthetic assigned session','2026-11-03T22:00Z',90,'READY','linked-event',NULL),
        ('unassigned','week-a','Synthetic unassigned','2026-11-04T22:00Z',60,'DRAFT',NULL,NULL),
        ('no-blocks','week-a','Synthetic no blocks','2026-11-05T22:00Z',60,'COMPLETED',NULL,NULL),
        ('hidden','week-a','Hidden session','2026-11-03T22:00Z',60,'READY',NULL,'2026-11-01'),
        ('outside','week-a','Outside period','2027-01-03T22:00Z',60,'READY',NULL,NULL),
        ('foreign','week-b','Foreign session','2026-11-03T22:00Z',60,'READY',NULL,NULL);
      INSERT INTO "SessionBlock" VALUES ('pool-a','session-a','POOL',40,2),('warmup-a','session-a','WARMUP',0,1),
        ('empty-block','unassigned','DRYLAND',12,1),('hidden-block','hidden','POOL',50,1),
        ('outside-block','outside','POOL',50,1),('foreign-block','foreign','POOL',50,1);
      INSERT INTO "SessionBlockAssignment" VALUES ('pool-a','athlete-1'),('pool-a','athlete-2'),('warmup-a','athlete-1'),
        ('hidden-block','hidden-athlete'),('outside-block','outside-athlete'),('foreign-block','foreign-athlete');
      INSERT INTO "AthleteSessionCompletion" VALUES ('session-a','IN_PROGRESS'),('session-a','COMPLETED'),('foreign','IN_PROGRESS');
      INSERT INTO "PlanningEvent" VALUES ('linked-event','TRAINING_SCHEDULE','Linked event','2026-11-03T22:00Z',NULL,90,NULL,NULL,NULL,NULL,NULL,'club-a',NULL),
        ('standalone','CAMP','Synthetic camp','2026-11-06T22:00Z',NULL,90,'Pool','Synthetic note',NULL,NULL,NULL,'club-a',NULL);
      INSERT INTO "TrainingGroup" VALUES ('group-a','Synthetic group','club-a'),('group-b','Foreign group','club-b');
      INSERT INTO "User" VALUES ('user-a','Synthetic','Athlete'),('user-b','Foreign','Athlete');
      INSERT INTO "Athlete" VALUES ('athlete-1','user-a','club-a',true),('foreign-athlete','user-b','club-b',true);`);
    let clubId = "club-a"; let authorized = true; let legacy = false;
    let calls: Array<{sql:string;args:unknown[];rows:unknown[]}> = [];
    const query = async (sql: string, args: unknown[]) => {
      if (legacy && sql.includes('FROM "SessionBlockAssignment"')) {
        sql = `SELECT "sessionBlockId","athleteId" FROM "SessionBlockAssignment" WHERE "sessionBlockId"=ANY($1::text[])`;
      }
      const response = await db.query(sql, args); calls.push({sql,args,rows:response.rows}); return response;
    };
    const wrap = ({children}: {children?:ReactNode}) => createElement("div",null,children);
    const noop = () => null;
    const dependencies: Record<string, unknown> = {
      "react/jsx-runtime": jsx, "lucide-react": {...icons, Users: () => createElement("i",{"data-icon":"users"})},
      "@/lib/current-user": {requireCoach: async () => { if (!authorized) throw new Error("FORBIDDEN"); return {clubId,coach:{weekStartsOn:1,planningDefaultView:"week"}}; }},
      "@/lib/db": {query}, "@/lib/timezone": timezone, "@/lib/data": demoData,
      "@/components/ui/app-link": {default: ({children,href}: {children?:ReactNode;href:string}) => createElement("a",{href},children)},
      "@/components/coach/coach-shell": {CoachShell:wrap},
      "@/components/coach/planning-event-form": {PlanningEventForm:noop},
      "@/components/coach/planning-event-editor": {PlanningEventEditor:noop},
      "@/components/coach/cancel-planned-training-button": {CancelPlannedTrainingButton:noop},
      "@/components/coach/dismiss-cancelled-training-button": {DismissCancelledTrainingButton:noop},
      "@/components/training/block-type-badge": {BlockTypeBadge: ({type}:{type:string}) => createElement("b",null,type)},
      "@/components/training/status-pill": {StatusPill: ({status}:{status:string}) => createElement("b",null,status)},
      "@/components/ui/button": {Button:wrap}
    };
    const exports: {default?:(props:{searchParams:Promise<Record<string,string>>})=>Promise<View>} = {};
    runInNewContext(ts.transpileModule(readFileSync("src/app/coach/planning/page.tsx","utf8"), {
      compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}
    }).outputText, {exports,Date,require:(name:string)=>{assert.ok(name in dependencies,name);return dependencies[name];}});
    const page = async (params: Record<string,string> = {view:"week",week:"2026-11-02"}) => {
      calls=[]; return exports.default!({searchParams:Promise.resolve(params)});
    };
    const assignments = (view: View) => view.props.sessions.find(s=>s.id==="session-a")!.blocks.flatMap(b=>b.assignments);
    const assignmentCalls = () => calls.filter(c=>c.sql.includes('FROM "SessionBlockAssignment"'));
    const plain = <T,>(value:T):T => JSON.parse(JSON.stringify(value));

    await t.test("same synthetic week changes assigned athlete count from zero to two without an extra read", async () => {
      legacy=true; const before=await page(); const oldCalls=calls.length;
      assert.equal(assignments(before).length,0);
      const beforeMarkup=renderToStaticMarkup(before); assert.match(beforeMarkup, /data-icon="users"><\/i> 0/);
      legacy=false; const after=await page(); const markup=renderToStaticMarkup(after);
      assert.deepEqual(plain(assignments(after)),[{athleteId:"athlete-1"},{athleteId:"athlete-1"},{athleteId:"athlete-2"}]);
      assert.match(markup,/data-icon="users"><\/i> 2/); assert.equal(calls.length,oldCalls); assert.equal(calls.length,7);
      assert.equal(assignmentCalls().length,1); assert.equal(assignmentCalls()[0].rows.length,3);
      assert.equal(beforeMarkup.replace('data-icon="users"></i> 0','data-icon="users"></i> 2'),markup,"only the incorrect displayed count changes");
      t.diagnostic("Synthetic week, one session / two athletes across two blocks: displayed count 0 -> 2; assignment rows 0 -> 3; seven SQL reads before and after. No transfer or latency savings asserted.");
    });
    await t.test("status, volume, linked-event suppression and genuinely empty assignments are retained", async () => {
      const view=await page(); const session=view.props.sessions.find(s=>s.id==="session-a")!;
      assert.deepEqual(plain(session.blocks.map(b=>[b.type,b.estimatedVolume])),[["WARMUP",0],["POOL",40]]);
      assert.deepEqual(plain(session.completions),[{sessionId:"session-a",status:"IN_PROGRESS"},{sessionId:"session-a",status:"COMPLETED"}]);
      assert.deepEqual(plain(view.props.events.map(e=>e.id)),["standalone"]);
      assert.equal(view.props.sessions.find(s=>s.id==="unassigned")!.blocks[0].assignments.length,0);
      assert.equal(view.props.sessions.find(s=>s.id==="no-blocks")!.blocks.length,0);
      const markup=renderToStaticMarkup(view); assert.match(markup,/IN_PROGRESS/); assert.match(markup,/Synthetic camp/);
      assert.match(markup,/\/coach\/sessions\/session-a\/print/); assert.match(markup,/data-icon="users"><\/i> 0/);
    });
    await t.test("month and week use only sessions in the authorized club and period", async () => {
      const view=await page({view:"month",month:"2026-11"});
      assert.deepEqual(plain(view.props.sessions.map(s=>s.id)),["session-a","unassigned","no-blocks"]);
      assert.equal(assignments(view).length,3); assert.equal(assignmentCalls()[0].rows.length,3);
      assert.doesNotMatch(JSON.stringify(view.props),/foreign-athlete|hidden-athlete|outside-athlete/);
      assert.match(renderToStaticMarkup(view),/Synthetic assigned session/);
      clubId="club-b"; const foreign=await page();
      assert.deepEqual(plain(foreign.props.sessions.map(s=>s.id)),["foreign"]);
      assert.deepEqual(plain(foreign.props.sessions[0].blocks[0].assignments),[{athleteId:"foreign-athlete"}]);
      assert.doesNotMatch(JSON.stringify(foreign.props),/athlete-1|athlete-2/); clubId="club-a";
    });
    await t.test("empty periods and denied coach access do not expose assignments", async () => {
      const empty=await page({view:"week",week:"2026-08-03"});
      assert.equal(empty.props.sessions.length,0); assert.equal(assignmentCalls()[0].rows.length,0);
      assert.match(renderToStaticMarkup(empty),/Jour libre/);
      authorized=false; await assert.rejects(page(),/FORBIDDEN/); assert.equal(calls.length,0); authorized=true;
    });
    await t.test("demo planning continues to render without querying the database", async () => {
      clubId="dev-club"; const view=await page(); assert.equal(calls.length,0);
      assert.match(renderToStaticMarkup(view),/Calendrier/); clubId="club-a";
    });
    await t.test("a failed assignment query remains an error instead of an empty success", async () => {
      await db.exec('DROP TABLE "SessionBlockAssignment"');
      await assert.rejects(page(),(error:unknown)=>(error as {code:string}).code==="42P01");
    });
  } finally { await db.close(); }
});
