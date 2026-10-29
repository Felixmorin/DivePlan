import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { resourcePath } from "./request-observation";
import { normalizeTelemetryRoute } from "./telemetry-route";
function load<T>(path:string,dependencies:Record<string,unknown>,globals:Record<string,unknown>={}):T{
 const exports={};runInNewContext(ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Date,Headers,...globals,require:(name:string)=>{assert.ok(name in dependencies,`Unexpected ${name}`);return dependencies[name];}});return exports as T;
}
test("proxy overwrites spoofed context, redacts short IDs and identifies prefetch without URL heuristics",()=>{
 const {proxy}=load<{proxy:(r:unknown)=>{request:{headers:Headers};headers:Headers}}>("src/proxy.ts",{
  "next/server":{NextResponse:{next:(options:object)=>({...options,headers:new Headers()})}},
  "@/lib/request-observation":{resourcePath},
  "@/lib/telemetry-route":{normalizeTelemetryRoute}
 },{crypto:{randomUUID}});
 for(const [extra,expected] of [[{},"navigation"],[{"next-router-prefetch":"1"},"prefetch"],[{"next-router-segment-prefetch":"/_tree"},"prefetch"],[{"sec-purpose":"prefetch"},"prefetch"],[{"next-action":"action-id"},"action"]] as const){
  const h=new Headers({...extra,"x-diveplan-route":"/spoof","x-diveplan-trigger":"prefetch","x-diveplan-request-id":"spoof","x-diveplan-page-route":"/spoof"});
  const r=proxy({headers:h,nextUrl:{pathname:"/coach/athletes/alice"}});
  assert.equal(r.request.headers.get("x-diveplan-route"),"/coach/athletes/:id");
  assert.equal(r.request.headers.get("x-diveplan-trigger"),expected);
  assert.equal(r.request.headers.get("x-diveplan-page-route"),"/coach/athletes/:id");
  assert.match(r.headers.get("server-timing")!,new RegExp(r.request.headers.get("x-diveplan-request-id")!));
 }
});
test("per-request counters stay isolated, flush once after response, and recover if scheduling is unavailable",async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE TABLE "Club" (id text PRIMARY KEY); INSERT INTO "Club" VALUES ('a'),('b');`);
  await db.exec(readFileSync("db/migrations/0026_request_observations.sql","utf8"));
  await db.exec(readFileSync("db/migrations/0027_server_request_metrics.sql","utf8"));
  let current=new Headers();let fail=false;const callbacks:Array<()=>Promise<void>>=[];
  const metrics=load<typeof import("./server-request-metrics")>("src/lib/server-request-metrics.ts",{
   "server-only":{},"next/headers":{headers:async()=>current},"next/server":{after:(cb:()=>Promise<void>)=>{if(fail)throw new Error("unavailable");callbacks.push(cb);}}
  },{console:{error:()=>{}}});
  const writer=(sql:string,args:unknown[])=>db.query(sql,args);
  const idA=randomUUID(),idB=randomUUID();
  current=new Headers({"x-diveplan-request-id":idA,"x-diveplan-route":"/coach","x-diveplan-trigger":"prefetch"});
  const a=await metrics.getSqlRequestSpan(writer);assert.ok(a);a.clubId="a";a.queries=3;a.bytes=1200;a.durationMs=45;
  assert.equal(await metrics.getSqlRequestSpan(writer),a,"one callback and span per request");
  current=new Headers({"x-diveplan-request-id":idB,"x-diveplan-route":"/coach","x-diveplan-trigger":"navigation"});
  const b=await metrics.getSqlRequestSpan(writer);assert.ok(b);b.clubId="b";b.queries=1;b.bytes=20;
  assert.equal(callbacks.length,2);assert.equal((await db.query(`SELECT * FROM "ServerRequestMetric"`)).rows.length,0);
  await Promise.all(callbacks.map(cb=>cb()));
  const rows=(await db.query<{id:string;clubId:string;queryCount:number;resultBytes:number;trigger:string}>(`SELECT * FROM "ServerRequestMetric"`)).rows;
  assert.equal(rows.find(r=>r.id===idA)?.queryCount,3);assert.equal(rows.find(r=>r.id===idA)?.clubId,"a");
  assert.equal(rows.find(r=>r.id===idB)?.queryCount,1);assert.equal(rows.find(r=>r.id===idB)?.trigger,"navigation");
  current=new Headers({"x-diveplan-request-id":randomUUID(),"x-diveplan-route":"/coach"});fail=true;
  assert.equal(await metrics.getSqlRequestSpan(writer),null);fail=false;
  assert.ok(await metrics.getSqlRequestSpan(writer),"failed scheduling cannot leave a dangling entry");
  current=new Headers({"x-diveplan-request-id":randomUUID(),"x-diveplan-route":"/api/monitoring/transfer"});
  assert.equal(await metrics.getSqlRequestSpan(writer),null,"telemetry must not recursively log itself");
 }finally{await db.close();}
});
