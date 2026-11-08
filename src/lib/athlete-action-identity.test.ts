import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import { z } from "zod";
import { PGlite } from "@electric-sql/pglite";
import { MILESTONES } from "./milestones";
import { isSessionStartAvailable } from "./session-availability";

const now=new Date("2026-11-02T19:00Z");
class Clock extends Date {constructor(value?:string|number|Date){super(value===undefined?now.getTime():value instanceof Date?value.getTime():value);}}
const payload={sessionId:"session-a",sessionFeedback:{rating:"Bien",note:"Synthetic feedback"},
  exercises:[{exerciseId:"exercise",completed:true,rating:"Bien",note:null}],
  dives:[{poolDiveId:"dive",repetitionsCompleted:7,goldenRepetitions:2,feedbackCompleted:true,rating:"Bien",note:"Synthetic"}]};
type ActionModule=typeof import("@/app/athlete/session/[id]/actions");

test("Server Action progress saves use minimal identity without changing authorization, writes or invalidation",async(t)=>{
  const db=new PGlite();
  try{
    await db.exec(`CREATE TABLE "User" (id text,"firstName" text,"lastName" text,email text,username text,avatar text,role text,
      "clubId" text,"passwordHash" text,"passwordSetAt" timestamptz,"createdAt" timestamptz,"accessEnabled" boolean);
      CREATE TABLE "Club" (id text,name text,logo text,"createdAt" timestamptz);
      CREATE TABLE "Athlete" (id text,"userId" text,"clubId" text,"groupId" text,"birthDate" timestamptz,level text,active boolean);
      CREATE TABLE "TrainingGroup" (id text,name text,"clubId" text,"coachId" text);
      CREATE TABLE "Coach" (id text,"userId" text,"clubId" text,"planningDefaultView" text,"weekStartsOn" int,"printShowCoachNotes" boolean,"printShowAthleteNames" boolean,"printRepetitionChecks" boolean);
      CREATE TABLE "TrainingSession" (id text,date timestamptz,status text,"competitionEvaluationAtStart" boolean);
      CREATE TABLE "SessionBlock" (id text,"sessionId" text,"competitionEvaluation" boolean);
      CREATE TABLE "SessionBlockAssignment" ("sessionBlockId" text,"athleteId" text);
      CREATE TABLE "DrylandBlockExercise" ("blockId" text,"exerciseId" text);
      CREATE TABLE "PoolTraining" ("blockId" text);
      CREATE TABLE "PoolSection" (id text,"poolTrainingId" text,height text);
      CREATE TABLE "PoolDive" (id text,"poolSectionId" text,"diveCode" text);
      CREATE TABLE "CompetitionDive" (id text,"athleteId" text,"diveCode" text,height text);
      CREATE TABLE "AthleteSessionCompletion" ("athleteId" text,"sessionId" text,"startedAt" timestamptz,"completedAt" timestamptz,status text,rating text,note text,PRIMARY KEY("athleteId","sessionId"));
      CREATE TABLE "AthleteExerciseLog" (id text,"athleteId" text,"sessionId" text,"exerciseId" text,completed boolean,rating text,note text,UNIQUE("athleteId","sessionId","exerciseId"));
      CREATE TABLE "AthleteDiveLog" (id text,"athleteId" text,"sessionId" text,"poolDiveId" text,"repetitionsCompleted" int,"goldenRepetitions" int,"feedbackCompleted" boolean,rating text,note text,timestamp timestamptz,UNIQUE("athleteId","sessionId","poolDiveId"));
      CREATE VIEW "AthleteDiveRepetition" AS SELECT l.*,d."diveCode",s.height FROM "AthleteDiveLog" l JOIN "PoolDive" d ON d.id=l."poolDiveId" JOIN "PoolSection" s ON s.id=d."poolSectionId";
      CREATE TABLE "AthleteSessionAbsence" ("sessionId" text,"athleteId" text);
      INSERT INTO "Club" VALUES ('club-a','Synthetic A',repeat('L',128000),NOW()),('club-b','Synthetic B',NULL,NOW());
      INSERT INTO "User" SELECT id,id,'Synthetic',id||'@example.test',NULL,NULL,role,club,'synthetic-hash',NOW(),NOW(),true
        FROM (VALUES ('user-a','ATHLETE','club-a'),('user-peer','ATHLETE','club-a'),('user-b','ATHLETE','club-b'),('coach','COACH','club-a'),('no-profile','ATHLETE','club-a')) v(id,role,club);
      INSERT INTO "Athlete" VALUES ('athlete-a','user-a','club-a','group-a','2010-01-01','Synthetic',true),
        ('peer','user-peer','club-a',NULL,'2010-01-01','Synthetic',true),('athlete-b','user-b','club-b',NULL,'2010-01-01','Synthetic',true);
      INSERT INTO "TrainingGroup" VALUES ('group-a','Synthetic','club-a','coach-a');
      INSERT INTO "Coach" VALUES ('coach-a','coach','club-a','week',1,true,true,false);
      INSERT INTO "TrainingSession" VALUES ('session-a','2026-11-02T18:00Z','IN_PROGRESS',false),('foreign','2026-11-02T18:00Z','IN_PROGRESS',false);
      INSERT INTO "SessionBlock" VALUES ('block','session-a',false),('foreign-block','foreign',false);
      INSERT INTO "SessionBlockAssignment" VALUES ('block','athlete-a'),('foreign-block','athlete-b');
      INSERT INTO "DrylandBlockExercise" VALUES ('block','exercise');
      INSERT INTO "PoolTraining" VALUES ('block');INSERT INTO "PoolSection" VALUES ('section','block','ONE_METER');
      INSERT INTO "PoolDive" VALUES ('dive','section','101A');
      INSERT INTO "AthleteSessionAbsence" VALUES ('session-a','peer');
      UPDATE "User" SET "createdAt"='2026-11-02T18:00Z',"passwordSetAt"='2026-11-02T18:00Z';
      UPDATE "Club" SET "createdAt"='2026-11-02T18:00Z';`);
    function request(legacy=false,memoized=true,session:{id?:string;email?:string}|null={id:"user-a"}){
      const reads:string[]=[];let bytes=0;let writes=0;const invalidations:string[]=[];
      const query=async(sql:string,args:unknown[])=>{
        const result=await db.query(sql,args);
        if(/^\s*(SELECT|WITH)/i.test(sql)){reads.push(sql);bytes+=Buffer.byteLength(JSON.stringify(result.rows));}else writes++;
        return {...result,rowCount:result.affectedRows??result.rows.length};
      };
      const database={query,setDatabaseEgressRoute(){},setDatabaseEgressClub(){},withDatabaseEgressComponent:(_name:string,work:()=>unknown)=>work(),
        withTransaction:(work:(tx:unknown)=>Promise<unknown>)=>db.transaction(tx=>work({query:async(sql:string,args:unknown[])=>{
          const result=await tx.query(sql,args);if(/^\s*SELECT/i.test(sql)){reads.push(sql);bytes+=Buffer.byteLength(JSON.stringify(result.rows));}else writes++;
          return {...result,rowCount:result.affectedRows??result.rows.length};}}))};
      const modules:Record<string,unknown>={"@/lib/db":database,react:{cache:(fn:()=>unknown)=>{let called=false;let value:unknown;return()=>{
        if(!memoized||!called){called=true;value=fn();}return value;};}},
        "next/navigation":{redirect:(path:string)=>{throw new Error(`REDIRECT ${path}`);}},"next/headers":{headers:async()=>new Headers()},
        "@/auth":{auth:async()=>session?{user:session}:null},"./pagination":{},"@/lib/pool-list":{},"@/lib/timezone":{},
        "node:crypto":{randomUUID},"next/cache":{revalidatePath:(path:string)=>invalidations.push(path)},
        "@/lib/monitoring":{trackEvent:async()=>{}},zod:{z},"@/lib/milestones":{MILESTONES},
        "@/lib/milestone-data":{getClubMilestones:async()=>[]},"@/lib/session-status":{completeSessionIfAllAthletesAreDone:async()=>{}},
        "@/lib/session-availability":{isSessionStartAvailable:(date:Date)=>isSessionStartAvailable(date,now),SESSION_NOT_STARTED_MESSAGE:"not started"}};
      const load=(source:string)=>{const exports:Record<string,unknown>={};runInNewContext(ts.transpileModule(source,{
        compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
      }).outputText,{exports,Date:Clock,process:{env:{NODE_ENV:"production"}},require:(name:string)=>{assert.ok(name in modules,name);return modules[name];}});return exports;};
      modules["@/lib/current-user"]=load(readFileSync("src/lib/current-user.ts","utf8"));
      modules["@/lib/athlete-session"]=load(readFileSync("src/lib/athlete-session.ts","utf8"));
      modules["@/lib/athlete-progress"]=load(readFileSync("src/lib/athlete-progress.ts","utf8"));
      let actions=readFileSync("src/app/athlete/session/[id]/actions.ts","utf8");
      if(legacy){
        // Reconstruct only the previous profile reads; all business SQL stays real.
        actions=actions.replace("const athlete = await getCurrentAthleteIdentity();","const athlete = await getCurrentAthlete({ includeCompetitionDives: false });")
          .replace("async function assertSessionStartAvailable(sessionId: string, athleteId: string) {",`async function assertSessionStartAvailable(sessionId: string, _athleteId: string) {
            const athlete = await getCurrentAthlete({ includeCompetitionDives: false });
            if (!athlete) throw new Error("Aucun athlete actif trouve.");`)
          .replace("[sessionId, athleteId]","[sessionId, athlete.id]");
      }
      return {actions:load(actions) as ActionModule,invalidations,stats:()=>({reads,bytes,writes})};
    }
    const snapshot=async()=>({
      exercises:(await db.query(`SELECT "athleteId","exerciseId",completed,rating,note FROM "AthleteExerciseLog" ORDER BY "athleteId"`)).rows,
      dives:(await db.query<{goldenRepetitions:number}>(`SELECT "athleteId","poolDiveId","repetitionsCompleted","goldenRepetitions","feedbackCompleted",rating,note FROM "AthleteDiveLog" ORDER BY "athleteId"`)).rows,
      completion:(await db.query<{status:string}>(`SELECT * FROM "AthleteSessionCompletion" ORDER BY "athleteId"`)).rows,
      absences:(await db.query(`SELECT * FROM "AthleteSessionAbsence"`)).rows});
    for(const memoized of [true,false]){
      await db.exec('TRUNCATE "AthleteExerciseLog","AthleteDiveLog","AthleteSessionCompletion"');
      const before=request(true,memoized);await before.actions.saveAthleteProgress(payload);const expected=await snapshot();
      await db.exec('TRUNCATE "AthleteExerciseLog","AthleteDiveLog","AthleteSessionCompletion"');
      const after=request(false,memoized);await after.actions.saveAthleteProgress(payload);
      assert.deepEqual(await snapshot(),expected);assert.deepEqual(after.invalidations,before.invalidations);
      assert.deepEqual(after.invalidations,["/athlete","/athlete/progress","/athlete/session/session-a"]);
      assert.equal(before.stats().reads.length,memoized?7:8);assert.equal(after.stats().reads.length,4);
      assert.equal(before.stats().writes,3);assert.equal(after.stats().writes,3);
      assert.ok(after.stats().reads.every(sql=>!sql.includes("to_jsonb")&&!sql.includes('"clubLogo"')));
      assert.ok(after.stats().bytes<before.stats().bytes/100);
      t.diagnostic(`Synthetic action body, request cache ${memoized?"memoized":"not memoized"}: SQL reads ${before.stats().reads.length} -> ${after.stats().reads.length}; row JSON bytes ${before.stats().bytes} -> ${after.stats().bytes}; business writes 3 -> 3. Excludes Next RSC re-render and real session/telemetry infrastructure.`);
    }
    await t.test("unused profile reads are removed even when the club has no logo",async()=>{
      await db.exec(`UPDATE "Club" SET logo=NULL WHERE id='club-a'`);
      const before=request(true);await before.actions.saveAthleteProgress(payload);const expected=await snapshot();
      const after=request();await after.actions.saveAthleteProgress(payload);assert.deepEqual(await snapshot(),expected);
      assert.equal(before.stats().reads.filter(sql=>sql.includes("to_jsonb(")).length,4);
      assert.equal(after.stats().reads.filter(sql=>sql.includes("SELECT a.id")).length,1);
      assert.ok(after.stats().bytes<before.stats().bytes);
      t.diagnostic(`Synthetic without logo, memoized cache: row JSON bytes ${before.stats().bytes} -> ${after.stats().bytes}; SQL reads ${before.stats().reads.length} -> ${after.stats().reads.length}. Action body only.`);
      await db.exec(`UPDATE "Club" SET logo=repeat('L',128000) WHERE id='club-a'`);
    });
    await t.test("identity, password and access guards reject before persistence, including other users/clubs",async()=>{
      const before=await snapshot();
      for(const session of [null,{id:"missing"},{id:"missing",email:"user-a@example.test"},{id:"no-profile"},{id:"coach"},{id:"user-peer"},{id:"user-b"}]){
        const req=request(false,true,session);await assert.rejects(req.actions.saveAthleteProgress(payload));assert.equal(req.stats().writes,0);assert.equal(req.invalidations.length,0);
      }
      await db.exec(`UPDATE "User" SET "accessEnabled"=false WHERE id='user-a'`);
      await assert.rejects(request().actions.saveAthleteProgress(payload));
      await db.exec(`UPDATE "User" SET "accessEnabled"=true,"passwordSetAt"=NULL WHERE id='user-a'`);
      await assert.rejects(request().actions.saveAthleteProgress(payload),/change-password/);
      await db.exec(`UPDATE "User" SET "passwordSetAt"=NOW() WHERE id='user-a'; UPDATE "Athlete" SET "clubId"='missing' WHERE id='athlete-a'`);
      await assert.rejects(request().actions.saveAthleteProgress(payload));
      await db.exec(`UPDATE "Athlete" SET "clubId"='club-a' WHERE id='athlete-a'`);
      assert.deepEqual(await snapshot(),before);
      await request(false,true,{email:"USER-A@EXAMPLE.TEST"}).actions.saveAthleteProgress(payload);
    });
    await t.test("draft, future, missing and foreign sessions cannot save; started sessions closed by schedule can",async()=>{
      for(const sessionId of ["missing","foreign"]){const req=request();await assert.rejects(req.actions.saveAthleteProgress({...payload,sessionId}));assert.equal(req.stats().writes,0);}
      for(const status of ["DRAFT","READY"]){
        await db.query(`UPDATE "TrainingSession" SET status=$1,date='2027-01-01' WHERE id='session-a'`,[status]);
        const req=request();await assert.rejects(req.actions.saveAthleteProgress(payload));assert.equal(req.stats().writes,0);
      }
      await db.exec(`UPDATE "TrainingSession" SET status='COMPLETED' WHERE id='session-a'`);
      await request().actions.saveAthleteProgress(payload);
      await db.exec(`UPDATE "AthleteSessionCompletion" SET status='COMPLETED',"completedAt"='2026-11-02T19:00Z' WHERE "athleteId"='athlete-a'`);
      const before=await snapshot();await request().actions.saveAthleteProgress(payload);assert.deepEqual(await snapshot(),before);
      await db.exec(`UPDATE "TrainingSession" SET status='IN_PROGRESS',date='2026-11-02T18:00Z' WHERE id='session-a'`);
    });
    await t.test("completion retains its full profile but does not reload it in the scheduling guard",async()=>{
      const req=request();assert.deepEqual(JSON.parse(JSON.stringify(await req.actions.completeAthleteSession(payload))),[]);
      assert.equal(req.stats().reads.filter(sql=>sql.includes("SELECT to_jsonb(a)")).length,1);
      const current=await snapshot();assert.equal(current.completion[0].status,"COMPLETED");
      assert.equal(current.dives[0].goldenRepetitions,2);assert.equal(current.absences.length,1);
    });
    await t.test("a persistence error rolls back work and never invalidates the UI as if saved",async()=>{
      const before=(await snapshot()).exercises;await db.exec('DROP TABLE "AthleteDiveLog" CASCADE');
      const req=request();await assert.rejects(req.actions.saveAthleteProgress({...payload,exercises:[{...payload.exercises[0],completed:false}]}));
      assert.deepEqual((await db.query(`SELECT "athleteId","exerciseId",completed,rating,note FROM "AthleteExerciseLog" ORDER BY "athleteId"`)).rows,before);
      assert.equal(req.invalidations.length,0);
    });
  }finally{await db.close();}
});
