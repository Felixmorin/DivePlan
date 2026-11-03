import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { normalizeTelemetryRoute } from "./telemetry-route";
import { parseObservations } from "./request-observation";

const url="https://app.test/api/monitoring/transfer";
const request=(body:unknown,origin="https://app.test")=>new Request(url,{method:"POST",body:JSON.stringify(body),headers:{origin}});
const invalidValues:unknown[]=[null,false,true,"","0","100",[],[0],{}, {valueOf:null,toString:null}];

test("telemetry requires JSON numbers without manufacturing samples or throwing on coercion",async(t)=>{
  const db=new PGlite();
  try{
    await db.exec(`CREATE TABLE "Club" (id text PRIMARY KEY);INSERT INTO "Club" VALUES ('club-a'),('club-b');`);
    for(const name of ["0002_transfer_telemetry.sql","0003_performance_telemetry.sql","0004_performance_ratings.sql"]){
      await db.exec(readFileSync(`db/migrations/${name}`,"utf8"));
    }
    let user:{role:string;clubId:string}|null={role:"COACH",clubId:"club-a"};let writes=0;
    function load(legacy=false){
      let source=readFileSync("src/app/api/monitoring/transfer/route.ts","utf8");
      if(legacy){
        for(const field of ["requests","transferBytes","cacheHits"])source=source.replace(`const ${field} = item.${field};`,`const ${field} = Number(item.${field});`);
        source=source.replace('typeof requests !== "number" || typeof transferBytes !== "number" || typeof cacheHits !== "number"\n      || ',"")
          .replace("const numericValue = item.value;","const numericValue = Number(item.value);")
          .replace('typeof numericValue !== "number" || ',"");
      }
      const dependencies:Record<string,unknown>={
        "@/lib/current-user":{getCurrentUserAccess:async()=>user},"@/lib/db":{query:(sql:string,args:unknown[])=>{writes++;return db.query(sql,args);}},
        "@/lib/telemetry-route":{normalizeTelemetryRoute},"@/lib/request-observation":{parseObservations}
      };
      const exports:{POST?:(request:Request)=>Promise<Response>}={};
      runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
        {exports,Request,Response,URL,TextDecoder,require:(name:string)=>{assert.ok(name in dependencies,name);return dependencies[name];}});
      return exports.POST!;
    }
    const post=load();const legacy=load(true);
    const stats=async(club="club-a")=>(await db.query<{metric:string;samples:number;total:number;good:number;needs:number}>(
      `SELECT metric,SUM("ratedSamples")::int AS samples,SUM("ratedTotalValue") AS total,SUM("goodSamples")::int AS good,
        SUM("needsImprovementSamples")::int AS needs FROM "PerformanceTelemetryHour" WHERE "clubId"=$1 GROUP BY metric ORDER BY metric`,[club])).rows;
    const transfer=async()=>(await db.query(`SELECT SUM(requests)::int AS requests,SUM("transferBytes")::int AS bytes,SUM("cacheHits")::int AS hits FROM "TransferTelemetryHour"`)).rows[0];
    await t.test("mixed LCP samples retain only the measurement instead of five coerced zeroes",async()=>{
      const body={vitals:[3000,null,false,"","0",[]].map(value=>({route:"/coach",name:"LCP",value}))};
      assert.equal((await legacy(request(body))).status,200);const before=(await stats())[0];
      assert.deepEqual(before,{metric:"LCP",samples:6,total:3000,good:5,needs:1});
      await db.exec('TRUNCATE "PerformanceTelemetryHour"');
      assert.equal((await post(request(body))).status,200);const after=(await stats())[0];
      assert.deepEqual(after,{metric:"LCP",samples:1,total:3000,good:0,needs:1});
      t.diagnostic(`Synthetic mixed LCP: samples ${before.samples} -> ${after.samples}, arithmetic mean ${before.total/before.samples} -> ${after.total/after.samples} ms, false good samples 5 -> 0. Not visits, percentiles, or a production measurement.`);
    });
    await t.test("all five metrics ignore non-number representations and malformed objects without SQL or exceptions",async()=>{
      const malformed={vitals:[{route:"/coach",name:"INP",value:{valueOf:null,toString:null}}]};
      const beforeWrites=writes;await assert.rejects(legacy(request(malformed)),/primitive value/);
      assert.equal((await post(request(malformed))).status,400);assert.equal(writes,beforeWrites);
      for(const name of ["LCP","INP","CLS","FCP","TTFB"]){
        for(const value of invalidValues)assert.equal((await post(request({vitals:[{route:"/coach",name,value}]}))).status,400);
        assert.equal((await post(request({vitals:[{route:"/coach",name}]}))).status,400);
      }
      assert.equal(writes,beforeWrites);
      t.diagnostic("Synthetic malformed numeric object: uncaught coercion TypeError before -> 400 after, zero ingestion SQL. No production incident asserted.");
    });
    await t.test("numeric zero, fractional values and inclusive rating thresholds remain valid for every metric",async()=>{
      await db.exec('TRUNCATE "PerformanceTelemetryHour"');
      const limits:Record<string,number[]>={LCP:[0,2500,4000,60000],INP:[0,200,500,60000],CLS:[0,0.1,0.25,10],FCP:[0,1800,3000,60000],TTFB:[0,800,1800,60000]};
      for(const [name,values]of Object.entries(limits)){
        assert.equal((await post(request({vitals:values.map(value=>({route:"/coach",name,value}))}))).status,200);
      }
      for(const row of await stats()){
        assert.equal(row.samples,4);assert.equal(row.good,2);assert.equal(row.needs,1);
        assert.equal(row.total,limits[row.metric].reduce((sum,value)=>sum+value,0));
      }
      const before=writes;
      for(const [name,value]of [["LCP",-1],["LCP",60001],["CLS",10.01]])assert.equal((await post(request({vitals:[{route:"/coach",name,value}]}))).status,400);
      assert.equal((await post(new Request(url,{method:"POST",body:'{"vitals":[{"route":"/coach","name":"LCP","value":1e400}]}'}))).status,400);
      assert.equal(writes,before);
    });
    await t.test("transfer counters also require numbers while valid zeroes, bounds and mixed batches are retained",async()=>{
      const valid={route:"/coach",resourceType:"fetch",requests:2,transferBytes:300,cacheHits:1};const before=writes;
      for(const field of ["requests","transferBytes","cacheHits"])for(const value of invalidValues){
        assert.equal((await post(request({entries:[{...valid,[field]:value}]}))).status,400);
      }
      assert.equal(writes,before);
      assert.equal((await post(request({entries:[valid,{...valid,requests:"1",transferBytes:null,cacheHits:false}]}))).status,200);
      assert.deepEqual(await transfer(),{requests:2,bytes:300,hits:1});
      assert.equal((await post(request({entries:[{...valid,requests:1,transferBytes:0,cacheHits:0},{...valid,requests:100000,transferBytes:100000000,cacheHits:100000}]}))).status,200);
      assert.deepEqual(await transfer(),{requests:100003,bytes:100000300,hits:100001});
      for(const patch of [{requests:0},{requests:1.5},{transferBytes:0.5},{transferBytes:100000001},{cacheHits:3}]){
        assert.equal((await post(request({entries:[{...valid,...patch}]}))).status,400);
      }
    });
    await t.test("valid mixed batches keep authenticated club ownership and origin/expired-session handling",async()=>{
      const body={clubId:"club-a",vitals:[{route:"/athlete",name:"FCP",value:1200},{route:"/athlete",name:"FCP",value:null}],entries:[{route:"/athlete",resourceType:"fetch",requests:1,transferBytes:0,cacheHits:0}]};
      user={clubId:"club-b",role:"ATHLETE"};assert.equal((await post(request(body))).status,200);
      assert.deepEqual(await stats("club-b"),[{metric:"FCP",samples:1,total:1200,good:1,needs:0}]);
      assert.equal((await stats("club-a")).length,5);
      const before=writes;assert.equal((await post(request(body,"https://foreign.test"))).status,403);
      user=null;assert.equal((await post(request(body))).status,204);
      user={clubId:"club-a",role:"COACH"};assert.equal(writes,before);
    });
    await t.test("real persistence errors are still propagated rather than replaced with successful collection",async()=>{
      await db.exec('DROP TABLE "PerformanceTelemetryHour"');
      await assert.rejects(post(request({vitals:[{route:"/coach",name:"FCP",value:100}]})),(error:unknown)=>(error as {code:string}).code==="42P01");
    });
  }finally{await db.close();}
});
