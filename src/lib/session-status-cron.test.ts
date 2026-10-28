import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
test("scheduled completion only processes newly expired sessions, preserves past records and is idempotent",async()=>{
 const db=new PGlite();
 try {
  await db.exec(`CREATE TYPE "CompletionStatus" AS ENUM ('COMPLETED','SKIPPED','IN_PROGRESS');
   CREATE TABLE "TrainingSession" (id text PRIMARY KEY,status text,date timestamp,duration int);
   CREATE TABLE "SessionBlock" (id text PRIMARY KEY,"sessionId" text);
   CREATE TABLE "SessionBlockAssignment" ("sessionBlockId" text,"athleteId" text);
   CREATE TABLE "AthleteSessionAbsence" ("sessionId" text,"athleteId" text);
   CREATE TABLE "AthleteSessionCompletion" ("athleteId" text,"sessionId" text,"startedAt" timestamp,"completedAt" timestamp,status "CompletionStatus",PRIMARY KEY ("athleteId","sessionId"));
   INSERT INTO "TrainingSession" VALUES ('expired','READY','2026-10-27 10:00',60),('active','IN_PROGRESS','2026-10-27 11:30',60),('old','COMPLETED','2026-01-01',60),('draft','DRAFT','2026-01-01',60);
   INSERT INTO "SessionBlock" VALUES ('be','expired'),('bo','old'),('ba','active');
   INSERT INTO "SessionBlockAssignment" VALUES ('be','present'),('be','absent'),('bo','historic');
   INSERT INTO "AthleteSessionAbsence" VALUES ('expired','absent');
   INSERT INTO "AthleteSessionCompletion" VALUES ('historic','old','2026-01-01','2026-01-01 02:00','COMPLETED');`);
  const historicBefore=(await db.query<{completedAt:Date}>(`SELECT "completedAt" FROM "AthleteSessionCompletion" WHERE "athleteId"='historic'`)).rows[0].completedAt;
  const query=async(sql:string,args:unknown[])=>{const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows??r.rows.length};};
  const exports: Record<string,unknown>={};
  runInNewContext(ts.transpileModule(readFileSync("src/lib/session-status.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Date,require:(name:string)=>{assert.equal(name,"@/lib/db");return {query,withTransaction:(work:(tx:{query:typeof query})=>Promise<unknown>)=>db.transaction(tx=>work({query:async(sql:string,args:unknown[])=>{const r=await tx.query(sql,args);return {...r,rowCount:r.affectedRows??r.rows.length};}}))};}});
  const complete=exports.completeExpiredTrainingSessions as (now:Date)=>Promise<number>;
  assert.equal(await complete(new Date("2026-10-27T12:00:00Z")),1);
  const {rows}=await db.query<{"athleteId":string;status:string;completedAt:Date|null}>(`SELECT * FROM "AthleteSessionCompletion" ORDER BY "athleteId"`);
  assert.equal(rows.find(r=>r.athleteId==="absent")?.status,"SKIPPED");
  assert.equal(rows.find(r=>r.athleteId==="present")?.status,"COMPLETED");
  assert.equal(new Date(rows.find(r=>r.athleteId==="historic")!.completedAt!).toISOString(),new Date(historicBefore).toISOString());
  assert.equal(await complete(new Date("2026-10-27T12:01:00Z")),0);
  assert.equal((await db.query(`SELECT * FROM "AthleteSessionCompletion"`)).rows.length,3);
 } finally {await db.close();}
});
