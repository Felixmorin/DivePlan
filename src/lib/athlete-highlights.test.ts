import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import * as timezone from "./timezone";

const now = new Date("2026-11-02T17:00:00Z");
class FixedDate extends Date {
  constructor(value?: string | number | Date) { super(value === undefined ? now.getTime() : value instanceof Date ? value.getTime() : value); }
  static now() { return now.getTime(); }
}
const identity = {athleteId:"athlete-a",clubId:"club-a",groupId:"group-a"};
const json = (value:unknown) => JSON.parse(JSON.stringify(value));

test("home highlights bound the real SQL response and preserve calendar visibility",async(t)=>{
  const db = new PGlite();
  try {
    const end = timezone.addMontrealDays(timezone.startOfMontrealDay(now),183);
    await db.exec(`CREATE TABLE "TrainingGroup" (id text PRIMARY KEY,name text);
      CREATE TABLE "PlanningEvent" (id text PRIMARY KEY,title text,type text,"startsAt" timestamptz,"endsAt" timestamptz,
        duration int,location text,"cancelledAt" timestamptz,"athleteId" text,"groupId" text,"clubId" text);
      INSERT INTO "TrainingGroup" VALUES ('group-a','Synthetic group'),('group-b','Other group');
      INSERT INTO "PlanningEvent" SELECT 'training-'||n,'Synthetic training','TRAINING_SCHEDULE',
        '2026-11-03 17:00Z'::timestamptz+n*INTERVAL '1 day',NULL,90,'Pool',NULL,NULL,NULL,'club-a' FROM generate_series(1,120) n;
      INSERT INTO "PlanningEvent" SELECT 'camp-'||n,'Synthetic camp','CAMP',
        '2026-11-06 17:00Z'::timestamptz+n*INTERVAL '1 day',NULL,120,'Pool',NULL,NULL,'group-a','club-a' FROM generate_series(1,30) n;
      INSERT INTO "PlanningEvent" VALUES
        ('club','Club competition','COMPETITION','2026-11-04 17:00Z',NULL,60,'Club pool',NULL,NULL,NULL,'club-a'),
        ('athlete','Personal camp','CAMP','2026-11-03 17:00Z',NULL,60,'Camp pool',NULL,'athlete-a',NULL,'club-a'),
        ('cancelled','Cancelled','COMPETITION','2026-11-02 18:00Z',NULL,60,NULL,NOW(),NULL,NULL,'club-a'),
        ('earlier','Earlier today','COMPETITION','2026-11-02 16:59Z',NULL,60,NULL,NULL,NULL,NULL,'club-a'),
        ('foreign-club','Foreign club','CAMP','2026-11-02 17:01Z',NULL,60,NULL,NULL,'athlete-a','group-a','club-b'),
        ('foreign-athlete','Foreign athlete','CAMP','2026-11-02 17:02Z',NULL,60,NULL,NULL,'athlete-b',NULL,'club-a'),
        ('foreign-group','Foreign group','CAMP','2026-11-02 17:03Z',NULL,60,NULL,NULL,NULL,'group-b','club-a'),
        ('overlapping','Ongoing camp','CAMP','2026-10-31','2026-11-05',60,NULL,NULL,NULL,NULL,'club-a');`);
    await db.query(`INSERT INTO "PlanningEvent" VALUES ('range-end','Excluded boundary','CAMP',$1,NULL,60,NULL,NULL,NULL,NULL,'club-a')`,[end]);
    let reads=0; let bytes=0; let rowCount=0;
    const query = async(sql:string,args:unknown[])=>{
      reads++; const result=await db.query(sql,args);
      bytes+=Buffer.byteLength(JSON.stringify(result.rows)); rowCount+=result.rows.length; return result;
    };
    const exports:Partial<typeof import("./athlete-planning")>={};
    const dependencies:Record<string,unknown>={"@/lib/db":{query},"@/lib/timezone":{...timezone,startOfMontrealWeek:()=>timezone.startOfMontrealWeek(now)}};
    runInNewContext(ts.transpileModule(readFileSync("src/lib/athlete-planning.ts","utf8"),{
      compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
    }).outputText,{exports,Date:FixedDate,require:(name:string)=>{assert.ok(name in dependencies,name);return dependencies[name];}});
    const calendar=()=>exports.getAthletePlanningEvents!({...identity,rangeStart:timezone.startOfMontrealDay(now),rangeEnd:end});
    const all=await calendar(); const before={reads,bytes,rowCount};
    const expected=all.filter(event=>["COMPETITION","CAMP"].includes(event.type)&&!event.cancelledAt&&event.startsAt>=now).slice(0,2);
    reads=0;bytes=0;rowCount=0;
    const highlights=await exports.getAthleteUpcomingHighlights!(identity);
    assert.deepEqual(json(highlights),json(expected));
    assert.deepEqual(json(highlights.map(event=>event.id)),["athlete","club"]);
    assert.equal(reads,1);assert.equal(rowCount,2);assert.ok(bytes<before.bytes/20);
    t.diagnostic(`Synthetic home planning SQL: ${before.rowCount} -> ${rowCount} rows; JSON result bytes ${before.bytes} -> ${bytes}; SELECTs ${before.reads} -> ${reads}. Not HTTP/FOT or wire-protocol bytes.`);
    await t.test("full calendar and overlapping week still retain training, cancellations and ongoing camps",async()=>{
      assert.deepEqual(json(await calendar()),json(all));
      const week=await exports.getAthleteWeekPlanningEvents!({...identity,includeOverlapping:true});
      const overlap=await exports.getAthletePlanningEvents!({...identity,rangeStart:timezone.startOfMontrealWeek(now),rangeEnd:timezone.addMontrealDays(timezone.startOfMontrealWeek(now),7),includeOverlapping:true});
      assert.deepEqual(json(week),json(overlap));
      for(const id of ["cancelled","overlapping","training-1"])assert.ok(overlap.some(event=>event.id===id));
      assert.ok(!all.some(event=>event.id==="range-end"));
    });
    await t.test("club, personal and group audiences keep the same isolation, including no group",async()=>{
      const other=await exports.getAthleteUpcomingHighlights!({athleteId:"athlete-b",clubId:"club-a",groupId:"group-b"});
      assert.deepEqual(json(other.map(event=>event.id)),["foreign-athlete","foreign-group"]);
      const noGroup=await exports.getAthleteUpcomingHighlights!({...identity,groupId:null});
      assert.deepEqual(json(noGroup.map(event=>event.id)),["athlete","club"]);
      assert.deepEqual(json((await exports.getAthleteUpcomingHighlights!({...identity,clubId:"club-b"})).map(event=>event.id)),["foreign-club"]);
      assert.deepEqual(json(await exports.getAthleteUpcomingHighlights!({...identity,clubId:"missing"})),[]);
    });
    await t.test("equal start times use stable IDs; inclusive now and exclusive horizon remain correct",async()=>{
      for(const id of ["tie-b","tie-a"])await db.query(`INSERT INTO "PlanningEvent" VALUES ($1,'Tie','CAMP',$2,NULL,60,NULL,NULL,NULL,NULL,'club-a')`,[id,now]);
      assert.deepEqual(json((await exports.getAthleteUpcomingHighlights!(identity)).map(event=>event.id)),["tie-a","tie-b"]);
    });
    await t.test("SQL failures reach the caller rather than fabricating an empty schedule",async()=>{
      await db.exec('DROP TABLE "PlanningEvent"');
      await assert.rejects(exports.getAthleteUpcomingHighlights!(identity),(error:unknown)=>(error as {code:string}).code==="42P01");
    });
  }finally{await db.close();}
});

test("real home page uses bounded highlights, keeps week and session data, and authenticates first",async()=>{
  let exists=true;let calls=0;let weekCalls=0;let fail=false;let empty=false;
  const source=readFileSync("src/app/athlete/page.tsx","utf8");
  const jsx=(type:unknown,props:unknown)=>({type,props});
  const dependencies:Record<string,unknown>={
    "react/jsx-runtime":{jsx,jsxs:jsx},"next/navigation":{redirect:()=>{throw new Error("LOGIN");}},
    "@/lib/athlete-session":{
      getCurrentAthlete:async()=>exists?{id:"athlete-a",clubId:"club-a",groupId:"group-a",user:{firstName:"Synthetic"}}:null,
      getAssignedReadySession:async()=>({id:"session",title:"Synthetic ready session",date:now,duration:90,sessionStatus:"READY",completions:[],blocks:[{type:"POOL"}]}),getAthleteCurrentWeekSummary:async()=>({completed:0,total:0,plannedMinutes:0,completedMinutes:0,volume:0})
    },
    "@/lib/athlete-planning":{
      getAthletePlanningEvents:()=>{throw new Error("Full calendar must not load on home");},
      getAthleteWeekPlanningEvents:async(args:unknown)=>{weekCalls++;assert.deepEqual(json(args),{...identity,includeOverlapping:true});return [];},
      getAthleteUpcomingHighlights:async(args:unknown)=>{calls++;assert.deepEqual(json(args),identity);if(fail)throw new Error("Synthetic SQL failure");return empty?[]:[{id:"camp",title:"Upcoming synthetic camp",type:"CAMP",startsAt:new Date("2026-11-03"),location:"Pool"}];}
    },
    "@/lib/db":{withDatabaseEgressComponent:(_component:string,work:()=>unknown)=>work()},
    "@/lib/timezone":timezone,"@/lib/session-availability":{isSessionStartAvailable:()=>true}
  };
  for(const match of source.matchAll(/from "([^"]+)"/g))if(!(match[1] in dependencies))dependencies[match[1]]={};
  const exports:{default?:()=>Promise<unknown>}={};
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,
    {exports,Date:FixedDate,Set,require:(name:string)=>dependencies[name]});
  const rendered=await exports.default!();assert.equal(calls,1);assert.equal(weekCalls,1);
  assert.ok(JSON.stringify(rendered).includes("Upcoming synthetic camp"));
  assert.ok(JSON.stringify(rendered).includes("Synthetic ready session"));
  assert.ok(JSON.stringify(rendered).includes("/athlete/calendar?view=list#event-camp"));
  empty=true;assert.ok(JSON.stringify(await exports.default!()).includes("Aucun camp ou compétition à venir"));
  exists=false;await assert.rejects(exports.default!(),/LOGIN/);assert.equal(calls,2);assert.equal(weekCalls,2);
  exists=true;fail=true;await assert.rejects(exports.default!(),/Synthetic SQL failure/);
});
