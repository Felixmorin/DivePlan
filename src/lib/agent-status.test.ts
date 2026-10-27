import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
test("agent polling rejects non-admins, bounds ids and never transfers report payloads",async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE TABLE "AiAgentRun" (id text PRIMARY KEY,status text,"startedAt" timestamp,"finishedAt" timestamp,error text,result jsonb);
   INSERT INTO "AiAgentRun" VALUES ('run-a','running',NOW(),NULL,NULL,jsonb_build_object('large',repeat('x',100000)));`);
  let user: {role:string}|null=null;let reads=0;
  const dependencies:Record<string,unknown>={"@/lib/current-user":{getCurrentUserAccess:async()=>user},"@/lib/db":{query:(sql:string,args:unknown[])=>{reads++;return db.query(sql,args);}}};
  const exports:{GET?:(req:Request)=>Promise<Response>}={};
  runInNewContext(ts.transpileModule(readFileSync("src/app/api/admin/agents/status/route.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Response,URL,require:(name:string)=>dependencies[name]});
  const get=(query="id=run-a")=>exports.GET!(new Request(`https://app.test/api/admin/agents/status?${query}`));
  assert.equal((await get()).status,401);user={role:"COACH"};assert.equal((await get()).status,403);assert.equal(reads,0);
  user={role:"ADMIN"};assert.equal((await get(Array.from({length:21},()=>"id=run-a").join("&"))).status,400);assert.equal((await get("id=bad%20id")).status,400);assert.equal(reads,0);
  const response=await get();assert.equal(response.status,200);assert.equal(response.headers.get("cache-control"),"private, no-store");
  const body=await response.text();assert.ok(body.length<500);assert.ok(!body.includes('result'));assert.equal(JSON.parse(body).runs[0].status,"running");
 }finally{await db.close();}
});
