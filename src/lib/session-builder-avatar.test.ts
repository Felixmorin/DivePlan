import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { createElement, type ReactNode } from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as zod from "zod";
import { randomUUID } from "node:crypto";
import * as timezone from "./timezone";

const paths = ["src/app/coach/sessions/new/page.tsx", "src/app/coach/sessions/[id]/edit/page.tsx"];
const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
const icons = new Proxy({}, { get: () => () => null });
function withoutAvatars(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutAvatars);
  return value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).filter(([key])=>key!=="avatar").map(([key,item])=>[key,withoutAvatars(item)])) : value;
}
function compile(path: string, dependencies: Record<string, unknown>) {
  const exports: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(readFileSync(path,"utf8"), {
    compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}
  }).outputText, {exports,require:(name:string)=>{assert.ok(name in dependencies,`Unexpected dependency ${name}`);return dependencies[name];}});
  return exports;
}

test("session creation and editing omit disabled photos from SQL while retaining builder props", async (t)=>{
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "User" (id text PRIMARY KEY,"firstName" text,"lastName" text,avatar text);
      CREATE TABLE "Athlete" (id text PRIMARY KEY,"userId" text,"groupId" text,level text,"clubId" text,active boolean);
      CREATE TABLE "TrainingGroup" (id text PRIMARY KEY,name text,"clubId" text);
      CREATE TABLE "DrylandExercise" (id text PRIMARY KEY,name text,category text,"defaultSets" int,"defaultReps" int,"defaultDuration" int,"roundTrip" boolean,equipment text,tags text[],"archivedAt" timestamptz);
      CREATE TABLE "SessionTemplate" (id text PRIMARY KEY,name text,category text,favorite boolean,payload jsonb,"clubId" text);
      CREATE TABLE "PlanningEvent" (id text PRIMARY KEY,title text,"startsAt" timestamptz,duration int,"groupId" text,location text,"clubId" text,type text);
      CREATE TABLE "TrainingWeek" (id text PRIMARY KEY,"groupId" text,"clubId" text);
      CREATE TABLE "TrainingSession" (id text PRIMARY KEY,title text,date timestamptz,"weekId" text);
      CREATE TABLE "CompetitionSimulation" ("sessionId" text,status text,turns jsonb);
      CREATE TABLE "AthleteSessionCompletion" ("athleteId" text,"sessionId" text,status text);
      CREATE TABLE "AthleteDiveLog" ("athleteId" text,"sessionId" text,"repetitionsCompleted" int);
      CREATE TABLE "CoachAthleteSessionNote" ("athleteId" text,"sessionId" text,note text);
      INSERT INTO "TrainingGroup" VALUES ('group-a','Synthetic group','club-a'),('group-b','Other group','club-b');
      INSERT INTO "TrainingWeek" VALUES ('week-a','group-a','club-a');
      INSERT INTO "TrainingSession" VALUES ('session-a','Synthetic session','2026-12-01T22:00Z','week-a');
      INSERT INTO "DrylandExercise" VALUES ('exercise','Synthetic exercise','Force',2,8,NULL,false,'Tapis','{force}',NULL);
      INSERT INTO "PlanningEvent" VALUES ('event-a','Synthetic schedule','2026-12-01T22:00Z',90,'group-a','Pool','club-a','TRAINING_SCHEDULE');
      INSERT INTO "User" SELECT 'user-'||n,'Athlete '||lpad(n::text,2,'0'),'Test',
        CASE WHEN n<=20 THEN 'data:image/png;base64,'||repeat('A',128000) WHEN n<=25 THEN 'https://example.test/photo-'||n ELSE NULL END FROM generate_series(1,30) n;
      INSERT INTO "Athlete" SELECT 'athlete-'||n,'user-'||n,'group-a','Provincial','club-a',true FROM generate_series(1,30) n;
      INSERT INTO "User" VALUES ('foreign-user','Foreign','Athlete',repeat('F',128000)),('inactive-user','Inactive','Athlete',repeat('I',128000));
      INSERT INTO "Athlete" VALUES ('foreign','foreign-user','group-b','Other','club-b',true),('inactive','inactive-user','group-a','Other','club-a',false);
      INSERT INTO "AthleteSessionCompletion" VALUES ('athlete-1','session-a','COMPLETED');
      INSERT INTO "AthleteDiveLog" VALUES ('athlete-1','session-a',40);
      INSERT INTO "CoachAthleteSessionNote" VALUES ('athlete-1','session-a','Synthetic coaching note');`);
    let clubId="club-a"; let authorized=true; let legacy=false; let status="DRAFT"; let started=false;
    let bytes=0; let queries=0; let results: unknown[]=[]; let builders: Record<string,unknown>[]=[];
    let queue=Promise.resolve();
    const query=(text:string,args:unknown[])=>{
      const sql=legacy?text.replace(/NULL::text AS avatar/g,"u.avatar"):text; queries++;
      const response=queue.then(async()=>{const result=await db.query(sql,args);bytes+=Buffer.byteLength(JSON.stringify(result.rows));results.push(plain(result.rows));return result;});
      queue=response.then(()=>undefined,()=>undefined); return response;
    };
    const snapshot = () => ({id:"session-a",date:new Date("2026-12-01T22:00Z"),title:"Synthetic session",duration:90,notes:"Synthetic notes",weekId:"week-a",coachId:"coach",status,planningEventId:"event-a",competitionEvaluationAtStart:false,
      week:{id:"week-a",clubId:"club-a",groupId:"group-a",group:{id:"group-a",name:"Synthetic group"}},
      blocks:[{id:"block",sessionId:"session-a",type:"POOL",title:"Synthetic block",description:null,duration:60,position:0,estimatedVolume:40,competitionEvaluation:false,
        assignments:[{athleteId:"athlete-1",sessionBlockId:"block"}],drylandExercises:[],poolTraining:{sections:[{height:"ONE_METER",label:null,order:0,dives:[{diveCode:"103C",diveName:"Synthetic dive",position:"C",repetitions:10,notes:null,order:0}]}]}}],
      completions:started?[{startedAt:new Date(),status:"IN_PROGRESS"}]:[],diveLogs:[],exerciseLogs:[]});
    const templateFunctions=compile("src/lib/session-template.ts",{
      "node:crypto":{randomUUID},zod,"@/lib/db":{query},"@/lib/timezone":timezone,"./session-structure":{}
    });
    const buildPayload=templateFunctions.buildSessionTemplatePayload as (value: unknown)=>unknown;
    await db.query(`INSERT INTO "SessionTemplate" VALUES ('template-a','Synthetic template','Séance',true,$1,'club-a')`,[JSON.stringify(buildPayload(snapshot()))]);
    const avatarFunctions=compile("src/lib/avatar-storage.ts",{"server-only":{}});
    const wrap=({children}:{children?:ReactNode})=>createElement("div",null,children);
    const data=(props:Record<string,unknown>)=>{builders.push(plain(props) as Record<string,unknown>);return createElement("pre",null,JSON.stringify(props));};
    const actions={createDrylandExercise:async()=>{},createTrainingSession:async()=>{},duplicateTrainingSession:async()=>{},updateDraftSessionFromBuilder:async()=>{},updateTrainingSession:async()=>{}};
    const dependencies:Record<string,unknown>={
      "react/jsx-runtime":jsx,"lucide-react":icons,
      "@/lib/db":{query,setDatabaseEgressRoute:()=>{}},"@/lib/timezone":timezone,
      "@/lib/current-user":{requireCoach:async()=>{if(!authorized)throw new Error("FORBIDDEN");return{clubId};}},
      "@/lib/avatar-storage":avatarFunctions,
      "@/lib/session-template":{...templateFunctions,getSessionSnapshots:async(ids:string[],club:string)=>club==="club-a"?new Map(ids.map(id=>[id,snapshot()])):new Map()},
      "@/lib/coach-session":{getCoachSession:async(id:string)=>{if(id!=="session-a"||clubId!=="club-a")throw new Error("NOT_FOUND");return snapshot();}},
      "@/lib/coach-pool-insights":{getCoachPoolInsights:async()=>clubId==="club-a"?{"athlete-1":{families:[{family:"Avant",volume:40}],competitionDives:[]}}:{}},
      "@/app/coach/sessions/actions":actions,"@/components/coach/session-builder":{SessionBuilder:data},
      "@/components/coach/coach-shell":{CoachShell:wrap},"@/components/coach/athlete-avatar-group":{AthleteAvatarGroup:wrap},
      "@/components/coach/pool-list-table":{PoolListFormTable:wrap},"@/components/training/block-type-badge":{BlockTypeBadge:wrap},
      "@/components/training/status-pill":{StatusPill:wrap},"@/components/ui/button":{Button:wrap},
      "@/components/ui/card":{Card:wrap,CardContent:wrap,CardHeader:wrap,CardTitle:wrap},
      "@/components/ui/input":{Input:wrap},"@/components/ui/textarea":{Textarea:wrap},
      "@/components/ui/empty-state":{EmptyState:({title}:{title:string})=>createElement("p",null,title)},
      "@/components/ui/app-link":{default:({children,href}:{children?:ReactNode;href:string})=>createElement("a",{href},children)}
    };
    type Props={searchParams:Promise<{templateId?:string;exerciseId?:string;planningEventId?:string}>;params:Promise<{id:string}>};
    const pages=paths.map(path=>compile(path,dependencies).default as (props:Props)=>Promise<ReactNode>);
    const reset=()=>{bytes=0;queries=0;results=[];builders=[];};
    const render=async(index:number,id="session-a")=>renderToStaticMarkup(await pages[index]({params:Promise.resolve({id}),searchParams:Promise.resolve({templateId:"template-a",exerciseId:"exercise",planningEventId:"event-a"})}));
    for(const index of [0,1])await t.test(`${paths[index]} keeps builder props and removes only SQL photos`,async()=>{
      reset();legacy=true;const before=await render(index);const oldBytes=bytes;const oldQueries=queries;const oldData=withoutAvatars(results);const oldBuilders=plain(builders);
      reset();legacy=false;const after=await render(index);
      assert.equal(after,before);assert.deepEqual(builders,oldBuilders);assert.deepEqual(withoutAvatars(results),oldData);assert.equal(queries,oldQueries);
      const athletes=builders[0].athletes as Array<{id:string;avatar:null;firstName:string}>;
      assert.equal(athletes.length,30);assert.ok(athletes.every(a=>a.avatar===null));assert.equal(athletes[0].firstName,"Athlete 01");
      assert.doesNotMatch(JSON.stringify(results),/data:image|example.test/);assert.doesNotMatch(after,/Foreign|Inactive/);assert.ok(bytes<oldBytes/50);
      assert.match(after,/103C|Synthetic coaching note/);
      t.diagnostic(`${paths[index]} synthetic SQL results in JSON: ${oldBytes} -> ${bytes} bytes; reads ${oldQueries} -> ${queries}. Builder props unchanged; not HTTP/RSC/FOT or PostgreSQL wire bytes.`);
    });
    await t.test("ready session, locked editing and initial selection stay intact",async()=>{
      status="READY";reset();const ready=await render(1);assert.match(ready,/Synthetic coaching note/);assert.equal(builders[0].initialDate,"2026-12-01");
      assert.equal(builders[0].initialPlanningEventId,"event-a");assert.equal(builders[0].editingSession,true);
      started=true;reset();const locked=await render(1);assert.match(locked,/Modification bloquee/);assert.match(locked,/\/coach\/sessions\/session-a/);assert.equal(builders.length,0);started=false;
    });
    await t.test("other clubs, inactive athletes, empty club, forbidden access and demo retain their boundaries",async()=>{
      clubId="club-b";reset();await render(0);const athletes=builders[0].athletes as Array<{id:string}>;assert.deepEqual(athletes.map(a=>a.id),["foreign"]);
      await assert.rejects(render(1),/NOT_FOUND/);
      clubId="empty-club";reset();assert.match(await render(0),/Prépare l’effectif/);assert.equal(builders.length,0);
      clubId="club-a";authorized=false;
      for(const index of [0,1]){reset();await assert.rejects(render(index),/FORBIDDEN/);assert.equal(queries,0);}authorized=true;
      clubId="dev-club";reset();assert.match(await render(0),/Mode demo/);assert.equal(queries,0);clubId="club-a";
    });
    await t.test("SQL failures remain visible and stored photos are unchanged",async()=>{
      assert.equal((await db.query<{count:number}>(`SELECT COUNT(*)::int AS count FROM "User" WHERE avatar LIKE 'data:image/%'`)).rows[0].count,20);
      await db.exec('DROP TABLE "User"');await assert.rejects(render(0),(error:unknown)=>(error as {code:string}).code==="42P01");
    });
  }finally{await db.close();}
});
