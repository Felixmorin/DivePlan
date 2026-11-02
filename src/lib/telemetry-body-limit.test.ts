import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { normalizeTelemetryRoute } from "./telemetry-route";
import { parseObservations } from "./request-observation";

const url="https://app.test/api/monitoring/transfer";
const vital={vitals:[{route:"/coach",name:"FCP",value:100}]};
const encode=(value:string)=>new TextEncoder().encode(value);
function streamed(body:string,chunkSize=4096,headers:Record<string,string>={},cancel?:()=>void|PromiseLike<void>){
  const data=encode(body);let offset=0;let cancellations=0;
  const stream=new ReadableStream<Uint8Array>({
    pull(controller){if(offset===data.length){controller.close();return;}const end=Math.min(offset+chunkSize,data.length);controller.enqueue(data.slice(offset,end));offset=end;},
    cancel(){cancellations++;return cancel?.();}
  },{highWaterMark:0});
  return {request:new Request(url,{method:"POST",body:stream,duplex:"half",headers:{origin:"https://app.test",...headers}} as RequestInit),
    stats:()=>({delivered:offset,cancellations,total:data.length})};
}

test("telemetry enforces its byte budget while preserving valid measurements and access",async(t)=>{
  const db=new PGlite();
  try{
    await db.exec(`CREATE TABLE "Club" (id text PRIMARY KEY);INSERT INTO "Club" VALUES ('club-a'),('club-b');`);
    for(const name of ["0002_transfer_telemetry.sql","0003_performance_telemetry.sql","0004_performance_ratings.sql"]){
      await db.exec(readFileSync(`db/migrations/${name}`,"utf8"));
    }
    let user:{clubId:string;role:string}|null={clubId:"club-a",role:"COACH"};
    let writes=0;let authCalls=0;
    const parsedBodies:unknown[]=[];
    const load=(legacy=false)=>{
      let source=readFileSync("src/app/api/monitoring/transfer/route.ts","utf8");
      if(legacy)source=source.replace("await readBoundedText(request)","await request.text()")
        .replace("if (raw === null)","if (raw.length > maxRequestBytes)");
      const dependencies:Record<string,unknown>={
        "@/lib/current-user":{getCurrentUserAccess:async()=>{authCalls++;return user;}},
        "@/lib/db":{query:(sql:string,args:unknown[])=>{writes++;return db.query(sql,args);}},
        "@/lib/telemetry-route":{normalizeTelemetryRoute},"@/lib/request-observation":{parseObservations}
      };
      const exports:{POST?:(request:Request)=>Promise<Response>}={};
      runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
        {exports,Request,Response,URL,TextDecoder,
          JSON:{stringify:JSON.stringify,parse:(text:string)=>{const value:unknown=JSON.parse(text);parsedBodies.push(value);return value;}},
          require:(name:string)=>{assert.ok(name in dependencies,name);return dependencies[name];}});
      return exports.POST!;
    };
    const post=load();
    await t.test("a Unicode batch larger than 20000 bytes is rejected without trusting Content-Length",async()=>{
      const body=JSON.stringify({...vital,padding:"é".repeat(11000)});
      assert.ok(body.length<20000&&encode(body).byteLength>20000);
      assert.equal((await load(true)(new Request(url,{method:"POST",body}))).status,200,"previous character count admitted this batch");
      await db.exec('TRUNCATE "PerformanceTelemetryHour"');writes=0;
      for(const headers of [{},{"content-length":"1"}] as Record<string,string>[]){
        const input=streamed(body,1000,headers);assert.equal((await post(input.request)).status,413);
        assert.equal(input.stats().cancellations,1);assert.equal(input.request.body?.locked,false);
      }
      assert.equal(writes,0);
      t.diagnostic(`Synthetic Unicode body: ${body.length} UTF-16 units, ${encode(body).byteLength} UTF-8 bytes; HTTP result 200 -> 413, telemetry writes 1 -> 0. No production incident/transfer measurement.`);
    });
    await t.test("an oversized chunked body stops being read at the first overflow chunk",async()=>{
      const body=JSON.stringify({...vital,padding:"x".repeat(200000)});
      const before=streamed(body);const after=streamed(body);
      assert.equal((await load(true)(before.request)).status,413);
      assert.equal((await post(after.request)).status,413);
      assert.equal(before.stats().delivered,before.stats().total);
      assert.equal(after.stats().delivered,20480);assert.equal(after.stats().cancellations,1);
      assert.equal(after.request.body?.locked,false);assert.equal(writes,0);
      t.diagnostic(`Synthetic controlled stream: body bytes consumed ${before.stats().delivered} -> ${after.stats().delivered}; same 413, zero telemetry writes. App-level stream consumption, not network ingress/FOT.`);
    });
    await t.test("exactly 20000 UTF-8 bytes and split multibyte characters preserve all five Web Vitals and transfers",async()=>{
      const value={vitals:[{route:"/coach",name:"LCP",value:1200},{route:"/coach",name:"INP",value:90},
        {route:"/coach",name:"CLS",value:0.05},{route:"/coach",name:"FCP",value:800},{route:"/coach",name:"TTFB",value:200}],
        entries:[{route:"/coach",resourceType:"fetch",requests:2,transferBytes:321,cacheHits:1}],padding:"é😀"};
      const json=JSON.stringify(value);const body=json+" ".repeat(20000-encode(json).byteLength);
      const input=streamed(body,1);assert.equal((await post(input.request)).status,200);
      assert.equal(input.stats().delivered,20000);assert.equal(input.stats().cancellations,0);assert.equal(input.request.body?.locked,false);
      assert.equal((parsedBodies.at(-1) as {padding:string}).padding,"é😀","incremental decoding preserves the actual multibyte characters");
      const oldWrites=writes;const oldParses=parsedBodies.length;
      assert.equal((await post(streamed(body+" ").request)).status,413,"20001 bytes is over budget");
      assert.equal(writes,oldWrites);assert.equal(parsedBodies.length,oldParses,"oversize is refused before JSON parsing");
      const rows=(await db.query<{metric:string;samples:number;totalValue:number}>(`SELECT metric,samples,"totalValue" FROM "PerformanceTelemetryHour" WHERE "clubId"='club-a' ORDER BY metric`)).rows;
      assert.deepEqual(rows.map(row=>row.metric),["CLS","FCP","INP","LCP","TTFB"]);
      for(const row of rows){assert.equal(row.samples,1);assert.equal(row.totalValue,value.vitals.find(item=>item.name===row.metric)!.value);}
      assert.deepEqual((await db.query(`SELECT requests,"transferBytes"::int,"cacheHits" FROM "TransferTelemetryHour"`)).rows,[{requests:2,transferBytes:321,cacheHits:1}]);
      user={clubId:"club-b",role:"ATHLETE"};assert.equal((await post(new Request(url,{method:"POST",body:JSON.stringify(vital)}))).status,200);
      assert.equal((await db.query<{samples:number}>(`SELECT samples FROM "PerformanceTelemetryHour" WHERE "clubId"='club-b'`)).rows[0].samples,1);
      user={clubId:"club-a",role:"COACH"};
    });
    await t.test("origin, expired sessions and declared oversize still return before consuming the body",async()=>{
      const oldWrites=writes;const oldAuth=authCalls;
      const foreign=streamed(JSON.stringify(vital),5,{origin:"https://foreign.test"});
      assert.equal((await post(foreign.request)).status,403);assert.equal(foreign.stats().delivered,0);assert.equal(authCalls,oldAuth);
      user=null;const expired=streamed(JSON.stringify(vital));assert.equal((await post(expired.request)).status,204);assert.equal(expired.stats().delivered,0);
      user={clubId:"club-a",role:"COACH"};const oversized=streamed(JSON.stringify(vital),5,{"content-length":"20001"});
      assert.equal((await post(oversized.request)).status,413);assert.equal(oversized.stats().delivered,0);assert.equal(writes,oldWrites);
    });
    await t.test("reader errors, absent bodies and invalid JSON retain the 400 path without writes",async()=>{
      const oldWrites=writes;
      for(const body of [undefined,"{invalid"]){assert.equal((await post(new Request(url,{method:"POST",body}))).status,400);}
      const broken=new Request(url,{method:"POST",duplex:"half",body:new ReadableStream({pull(c){c.error(new Error("Synthetic read failure"));}},{highWaterMark:0})} as RequestInit);
      assert.equal((await post(broken)).status,400);assert.equal(broken.body?.locked,false);assert.equal(writes,oldWrites);
    });
    await t.test("failing or unresolved stream cancellation cannot delay or replace the 413",{timeout:2000},async()=>{
      for(const cancel of [()=>Promise.reject(new Error("Synthetic cancellation failure")),()=>new Promise<void>(()=>{})]){
        const input=streamed("x".repeat(30000),30000,{},cancel);
        assert.equal((await post(input.request)).status,413);assert.equal(input.stats().cancellations,1);assert.equal(input.request.body?.locked,false);
      }
    });
  }finally{await db.close();}
});
