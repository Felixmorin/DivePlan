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
import * as timezone from "./timezone";

const now=new Date("2027-06-27T18:00Z");
class FixedDate extends Date {constructor(value?:string|number|Date){super(value===undefined?now.getTime():value instanceof Date?value.getTime():value);}}

test("progress details append date rows without repeatedly copying their entire dive history",async(t)=>{
  const db=new PGlite();
  try{
    await db.exec(`CREATE TABLE "PoolSection" (id text PRIMARY KEY,height text,label text);
      CREATE TABLE "PoolDive" (id text PRIMARY KEY,"poolSectionId" text,"diveCode" text);
      CREATE TABLE "AthleteDiveLog" ("athleteId" text,"poolDiveId" text,timestamp timestamptz,"repetitionsCompleted" int,"familyOverride" text);
      INSERT INTO "PoolSection" VALUES ('one','ONE_METER',NULL),('three','THREE_METER',NULL),('platform','CUSTOM','7,5 m');
      INSERT INTO "PoolDive" SELECT 'dive-'||n,'one',(100+n)::text||'C' FROM generate_series(1,12) n;
      INSERT INTO "AthleteDiveLog" SELECT 'athlete-a','dive-'||n,'2026-09-01T18:00Z'::timestamptz+day*INTERVAL '1 day',1,NULL FROM generate_series(1,12) n CROSS JOIN generate_series(0,299) day;
      INSERT INTO "AthleteDiveLog" VALUES ('athlete-b','dive-1','2027-06-30T18:00Z',777,NULL);`);
    let athleteId:string|null="athlete-a";
    function load(legacy=false){
      let copies=0,buckets=0,reads=0,bytes=0,rowCount=0;
      let source=readFileSync("src/app/athlete/progress/details/page.tsx","utf8");
      if(legacy)source=source.replace('const dates = datesByDive.get(key);\n    if (dates) dates.push(row);\n    else datesByDive.set(key, [row]);','datesByDive.set(key, [...(datesByDive.get(key) ?? []), row]);');
      class TrackedMap extends Map<unknown,unknown>{
        set(key:unknown,value:unknown){
          if(Array.isArray(value)&&value.length&&value[0]&&typeof value[0]==="object"&&"date" in value[0]){
            buckets++;
            value=new Proxy(value,{get:(target,property,receiver)=>{
              if(property===Symbol.iterator)return function*(){for(const item of target){copies++;yield item;}};
              return Reflect.get(target,property,receiver);
            }});
          }
          return super.set(key,value);
        }
      }
      const wrap=({children}:{children?:ReactNode})=>createElement("div",null,children);
      const dependencies:Record<string,unknown>={
        "react/jsx-runtime":jsx,"lucide-react":icons,"next/navigation":{redirect:(path:string)=>{throw new Error(`REDIRECT ${path}`);}},
        "@/components/ui/app-link":{default:({children,href}:{children?:ReactNode;href:string})=>createElement("a",{href},children)},
        "@/components/athlete/athlete-shell":{AthleteShell:wrap},"@/components/athlete/progress-details-period":{ProgressDetailsPeriod:()=>null},
        "@/lib/athlete-session":{getCurrentAthlete:async()=>athleteId?{id:athleteId}:null},
        "@/lib/timezone":{...timezone,startOfMontrealWeek:(date:Date=now)=>timezone.startOfMontrealWeek(date),toMontrealDateInputValue:(date:Date=now)=>timezone.toMontrealDateInputValue(date)},
        "@/lib/db":{query:async(sql:string,args:unknown[])=>{reads++;const response=await db.query(sql,args);rowCount=response.rows.length;bytes+=Buffer.byteLength(JSON.stringify(response.rows));return response;}}
      };
      const exports:{default?:(props:{searchParams:Promise<Record<string,string>>})=>Promise<ReactNode>}={};
      runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,
        {exports,Date:FixedDate,Map:TrackedMap,require:(name:string)=>{assert.ok(name in dependencies,name);return dependencies[name];}});
      return {render:async(params:Record<string,string>={period:"season",all:"1"})=>renderToStaticMarkup(await exports.default!({searchParams:Promise.resolve(params)})),stats:()=>({copies,buckets,reads,bytes,rowCount})};
    }
    await t.test("same 12-dive season preserves every rendered date while eliminating quadratic copies",async()=>{
      const before=load(true),after=load();const oldMarkup=await before.render(),markup=await after.render();
      assert.equal(markup,oldMarkup);const old=before.stats(),next=after.stats();
      assert.equal(old.rowCount,3600);assert.equal(old.copies,12*300*299/2);assert.equal(old.buckets,3600);
      assert.equal(next.copies,0);assert.equal(next.buckets,12);assert.equal(next.reads,old.reads);assert.equal(next.bytes,old.bytes);assert.equal(next.rowCount,old.rowCount);
      assert.equal((markup.match(/class="progress-dive-date"/g)??[]).length,3600);
      t.diagnostic(`Synthetic 12 dives x 300 days: copied bucket entries ${old.copies} -> ${next.copies}; grouping arrays ${old.buckets} -> ${next.buckets}; SQL ${old.reads} -> ${next.reads}, result JSON bytes ${old.bytes} -> ${next.bytes}; identical server markup. No latency/HTTP/FOT saving measured.`);
    });
    await t.test("collapsed top-seven lists, show-all links and week/month/season filters keep the same output",async()=>{
      const cases:Array<Record<string,string>>=[{period:"season"},{period:"week",all:"1"},{period:"month",all:"1"},{period:"invalid",family:"invalid"}];
      for(const params of cases){
        const old=load(true),next=load();assert.equal(await next.render(params),await old.render(params));assert.equal(next.stats().copies,0);
      }
      const compact=await load().render({period:"season"});assert.equal((compact.match(/<details /g)??[]).length,7);assert.match(compact,/Voir tous les plongeons/);
    });
    await t.test("families, identical codes at different heights, custom platforms and within-day sums stay distinct",async()=>{
      await db.exec(`INSERT INTO "PoolDive" VALUES ('back','three','201C'),('platform-dive','platform','101C');
        INSERT INTO "AthleteDiveLog" VALUES ('athlete-a','back','2027-06-30T18:00Z',4,NULL),('athlete-a','back','2027-06-30T19:00Z',3,NULL),
          ('athlete-a','platform-dive','2027-06-30T18:00Z',5,'Avant'),('athlete-a','back','2027-06-29T18:00Z',2,'Vrille');`);
      for(const family of ["Avant","Arriere","Vrille","invalid"]){
        const params={period:"season",all:"1",family};const old=load(true),next=load();assert.equal(await next.render(params),await old.render(params));assert.equal(next.stats().copies,0);
      }
      assert.match(await load().render({period:"season",family:"Arriere"}),/7 répétitions/);
      assert.match(await load().render({period:"season",family:"Avant",all:"1"}),/Plateforme/);
    });
    await t.test("other athletes, empty histories and signed-out access retain their boundaries",async()=>{
      athleteId="athlete-b";const old=load(true),next=load();const markup=await next.render();assert.equal(markup,await old.render());assert.match(markup,/777 répétitions/);assert.equal(next.stats().rowCount,1);
      athleteId="missing";assert.match(await load().render(),/Aucun plongeon pour cette période/);
      athleteId=null;const denied=load();await assert.rejects(denied.render(),/REDIRECT \/login/);assert.equal(denied.stats().reads,0);athleteId="athlete-a";
    });
    await t.test("a SQL error is still propagated rather than converted to an empty history",async()=>{
      await db.exec('DROP TABLE "AthleteDiveLog"');await assert.rejects(load().render(),(error:unknown)=>(error as {code:string}).code==="42P01");
    });
  }finally{await db.close();}
});
