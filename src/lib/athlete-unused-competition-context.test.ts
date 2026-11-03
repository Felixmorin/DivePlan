import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { createElement, type ReactNode } from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";
import * as zod from "zod";
import * as timezone from "./timezone";

const paths=["src/app/athlete/page.tsx","src/app/athlete/progress/page.tsx","src/app/athlete/progress/details/page.tsx","src/app/athlete/week/page.tsx","src/app/athlete/preferences/page.tsx","src/app/athlete/profile/page.tsx","src/app/athlete/profile/golden-reps/page.tsx"];
const actionPath="src/app/athlete/profile/actions.ts";
function load(path:string,dependencies:Record<string,unknown>,legacy=false){
  let source=readFileSync(path,"utf8");
  if(legacy)source=source.replace("getCurrentAthlete({ includeCompetitionDives: false })","getCurrentAthlete()");
  const exports:Record<string,unknown>={};
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,
    {exports,Date,require:(name:string)=>{assert.ok(name in dependencies,`Unexpected dependency ${name}`);return dependencies[name];}});
  return exports;
}

test("athlete pages and profile saves skip competition context they never consume",async(t)=>{
  const db=new PGlite();
  try{
    await db.exec(`CREATE TABLE "User" (id text PRIMARY KEY,"firstName" text,"lastName" text,email text,username text UNIQUE,avatar text,role text,"clubId" text,"passwordHash" text,"passwordSetAt" timestamp,"createdAt" timestamp);
      CREATE TABLE "Club" (id text PRIMARY KEY,name text,logo text,"createdAt" timestamp);
      CREATE TABLE "Athlete" (id text PRIMARY KEY,"userId" text,"clubId" text,"groupId" text,"birthDate" timestamp,level text,active boolean);
      CREATE TABLE "TrainingGroup" (id text PRIMARY KEY,name text,"clubId" text,"coachId" text);
      CREATE TABLE "Coach" (id text PRIMARY KEY,"userId" text,"clubId" text);
      CREATE TABLE "CompetitionDiveList" (id text PRIMARY KEY,position int);
      CREATE TABLE "CompetitionDive" (id text PRIMARY KEY,"athleteId" text,"listId" text,height text,position int,"createdAt" timestamp);
      INSERT INTO "Club" VALUES ('club-a','Synthetic A',NULL,'2026-01-01'),('club-b','Synthetic B',NULL,'2026-01-01');
      INSERT INTO "User" VALUES ('user-a','Alpha','Test','a@example.test','alpha',NULL,'ATHLETE','club-a',NULL,'2026-01-01','2026-01-01'),
        ('user-b','Beta','Test','b@example.test','beta',NULL,'ATHLETE','club-b',NULL,'2026-01-01','2026-01-01'),
        ('coach-user','Coach','Test','coach@example.test','coach',NULL,'COACH','club-a',NULL,'2026-01-01','2026-01-01');
      INSERT INTO "Athlete" VALUES ('athlete-a','user-a','club-a','group-a','2010-01-01','Provincial',true),('athlete-b','user-b','club-b',NULL,'2011-01-01','Relève',true);
      INSERT INTO "TrainingGroup" VALUES ('group-a','Synthetic group','club-a','coach-a');
      INSERT INTO "Coach" VALUES ('coach-a','coach-user','club-a');
      INSERT INTO "CompetitionDiveList" VALUES ('primary',0),('secondary',1);
      INSERT INTO "CompetitionDive" SELECT 'dive-'||n,'athlete-a','primary','ONE_METER',n,'2026-01-01' FROM generate_series(1,12) n;
      INSERT INTO "CompetitionDive" VALUES ('secondary-dive','athlete-a','secondary','THREE_METER',0,'2026-01-01'),('foreign-dive','athlete-b','primary','THREE_METER',0,'2026-01-01');`);
    type Identity={id:string;role:string;passwordSetAt:Date|null};
    let identity:Identity|null={id:"user-a",role:"ATHLETE",passwordSetAt:new Date()};
    let reads:string[]=[],bytes=0,writes=0;let helperIds:string[]=[];let invalidations:string[]=[];
    const query=async(sql:string,args:unknown[])=>{const response=await db.query(sql,args);if(/^\s*SELECT/.test(sql)){reads.push(sql);bytes+=Buffer.byteLength(JSON.stringify(response.rows));}else writes++;return response;};
    const redirect=(path:string)=>{throw new Error(`REDIRECT ${path}`);};
    const profileModule=load("src/lib/athlete-session.ts",{
      "./pagination":{},"@/lib/pool-list":{},"@/lib/timezone":timezone,"next/navigation":{redirect},
      "@/lib/current-user":{getCurrentUser:async()=>identity,getCurrentAthleteUserAccess:async()=>identity},"@/lib/db":{query}
    });
    const get=profileModule.getCurrentAthlete as typeof import("./athlete-session").getCurrentAthlete;
    const weekSummary={total:1,completed:1,remaining:0,plannedMinutes:90,completedMinutes:90,volume:8};
    const totals={completedSessions:1,totalDiveRepetitions:8,completedMinutes:90,thisWeekDiveRepetitions:8,thisWeekMinutes:90,skillData:[],chartData:[],dailyFamilyChartData:[],sessionChartData:[],weeklyChartData:[],monthlyChartData:[],skillDives:[]};
    const record=<T,>(result:T)=>(id:string)=>{helperIds.push(id);return Promise.resolve(result);};
    const athleteHelpers={getCurrentAthlete:get,getAssignedReadySession:record(null),getAthleteCurrentWeekSummary:record(weekSummary),getAthleteProgressTotals:record(totals),getAthleteSummary:record(totals),
      getAthleteGoldenReps:record([{height:"ONE_METER",code:"103C",name:"Synthetic dive",count:2}]),
      getAthleteCompletionPage:record({completions:[{sessionId:"session",title:"Synthetic session",status:"COMPLETED",duration:90,completedAt:new Date("2026-11-01T20:00Z")}],total:1,page:1})};
    const wrap=(props:Record<string,unknown>)=>createElement("div",null,props.children as ReactNode??JSON.stringify(props));
    const ui=new Proxy({},{get:()=>wrap});
    const common:Record<string,unknown>={
      "react/jsx-runtime":jsx,"lucide-react":icons,"next/navigation":{redirect},"@/lib/athlete-session":athleteHelpers,"@/lib/timezone":timezone,
      "@/lib/pagination":{PAGE_SIZE:20},"@/lib/session-availability":{isSessionStartAvailable:()=>false},
      "@/lib/athlete-planning":{getAthleteWeekPlanningEvents:async()=>[],getAthleteUpcomingHighlights:async()=>[]},
      "@/lib/avatar-storage":{resolveAvatarUrls:async(values:unknown[])=>values.map(()=>null)},
      "@/lib/db":{query:async()=>({rows:[]}),withDatabaseEgressComponent:async(_name:string,fn:()=>unknown)=>fn()},
      "@/app/athlete/profile/actions":{signOutAthlete:async()=>{}}
    };
    for(const path of paths){
      const source=ts.createSourceFile(path,readFileSync(path,"utf8"),ts.ScriptTarget.Latest,true);
      for(const statement of source.statements)if(ts.isImportDeclaration(statement)&&ts.isStringLiteral(statement.moduleSpecifier)){
        const name=statement.moduleSpecifier.text;
        if(name.startsWith("@/components/"))common[name]=name==="@/components/ui/app-link"?{default:({children,href}:{children:ReactNode;href:string})=>createElement("a",{href},children)}:ui;
      }
    }
    type Page=(props:{searchParams:Promise<Record<string,string>>})=>Promise<ReactNode>;
    const pages=paths.map(path=>({before:load(path,common,true).default as Page,after:load(path,common).default as Page}));
    const render=(page:Page)=>page({searchParams:Promise.resolve({period:"week",page:"1"})}).then(renderToStaticMarkup);
    const reset=()=>{reads=[];bytes=0;writes=0;helperIds=[];invalidations=[];};
    for(let index=0;index<paths.length;index++)await t.test(`${paths[index]} retains markup and athlete-scoped helper inputs without the list read`,async()=>{
      reset();const before=await render(pages[index].before);const oldBytes=bytes;assert.equal(reads.length,3);assert.equal(reads.filter(sql=>sql.includes('"CompetitionDive"')).length,1);const oldIds=[...helperIds];
      reset();const after=await render(pages[index].after);assert.equal(after,before);assert.deepEqual(helperIds,oldIds);
      assert.ok(helperIds.every(id=>id==="athlete-a"));assert.equal(reads.length,2);assert.ok(reads.every(sql=>!sql.includes('"CompetitionDive"')));assert.ok(bytes<oldBytes);assert.equal(writes,0);
      t.diagnostic(`${paths[index]} synthetic current-athlete context: SQL reads 3 -> 2, row JSON bytes ${oldBytes} -> ${bytes}; other page data and auth excluded, no HTTP/FOT claim.`);
    });
    const actionDeps={"next/cache":{revalidatePath:(path:string)=>invalidations.push(path)},zod,"@/auth":{signOut:async()=>{}},"@/lib/athlete-session":athleteHelpers,"@/lib/db":{query}};
    type Save=(field:"firstName"|"lastName"|"username",value:string)=>Promise<{ok:boolean;error?:string}>;
    const beforeSave=load(actionPath,actionDeps,true).updateAthleteProfileField as Save;
    const save=load(actionPath,actionDeps).updateAthleteProfileField as Save;
    await t.test("profile field save keeps validation, user ownership, write and revalidation while skipping the unused list",async()=>{
      for(const action of [beforeSave,save]){
        await db.exec(`UPDATE "User" SET "firstName"='Alpha' WHERE id='user-a'`);reset();
        assert.equal((await action("firstName","Updated")).ok,true);assert.equal(reads.length,action===beforeSave?3:2);assert.equal(writes,1);
        assert.deepEqual(invalidations,["/athlete/profile","/athlete/profile/edit"]);
        assert.deepEqual((await db.query(`SELECT id,"firstName" FROM "User" WHERE id IN ('user-a','user-b') ORDER BY id`)).rows,[{id:"user-a",firstName:"Updated"},{id:"user-b",firstName:"Beta"}]);
      }
      reset();assert.equal((await save("firstName","")).ok,false);assert.equal(writes,0);assert.equal(invalidations.length,0);
      assert.equal((await save("username","beta")).ok,false);assert.equal(writes,0);
    });
    await t.test("all pages and profile save retain signed-out, wrong-role and password guards",async()=>{
      for(const invalid of [null,{id:"user-a",role:"COACH",passwordSetAt:new Date()},{id:"user-a",role:"ATHLETE",passwordSetAt:null}]){
        identity=invalid;reset();
        for(const page of pages)await assert.rejects(render(page.after),invalid?.role==="ATHLETE"?/REDIRECT \/change-password/:/REDIRECT \/login/);
        if(invalid?.role==="ATHLETE")await assert.rejects(save("firstName","New"),/REDIRECT \/change-password/);else assert.equal((await save("firstName","New")).ok,false);
        assert.equal(reads.length,0);assert.equal(writes,0);
      }
      identity={id:"user-a",role:"ATHLETE",passwordSetAt:new Date()};
    });
    await t.test("other athletes, missing profiles and default full-list consumers keep their boundaries",async()=>{
      identity={id:"user-b",role:"ATHLETE",passwordSetAt:new Date()};reset();const markup=await render(pages[5].after);
      assert.match(markup,/Beta/);assert.match(markup,/Synthetic B/);assert.doesNotMatch(markup,/Alpha|Coach Test/);assert.ok(helperIds.every(id=>id==="athlete-b"));
      assert.equal((await get())!.competitionDives[0].id,"foreign-dive");
      identity={id:"missing",role:"ATHLETE",passwordSetAt:new Date()};await assert.rejects(render(pages[5].after),/REDIRECT \/login/);assert.equal((await save("firstName","New")).ok,false);
      identity={id:"user-a",role:"ATHLETE",passwordSetAt:new Date()};const full=await get();assert.equal(full!.competitionDives.length,12);assert.ok(full!.competitionDives.every(dive=>dive.athleteId==="athlete-a"));
    });
  }finally{await db.close();}
});
