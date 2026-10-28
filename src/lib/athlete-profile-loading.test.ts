import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as timezone from "./timezone";

test("athlete sections load only their own queries and authorize the profile before fetching history",async()=>{
 const sql:string[]=[];let progressCalls=0;let historyCalls=0;let exists=true;
 const source=readFileSync("src/app/coach/athletes/[id]/page.tsx","utf8");
 const query=async(text:string)=>{sql.push(text);return {rows:text.startsWith('SELECT a.id,a."userId"') && exists ? [{id:"athlete-a",avatar:null,groupId:null}] : []};};
 const dependencies:Record<string,unknown>={
  "@/lib/athlete-history":{getAthleteHistory:async()=>{historyCalls++;return {sessions:[],total:0,page:1,minutes:0,filters:{}};}},
  "@/lib/current-user":{requireCoach:async()=>({clubId:"club-a"})},"@/lib/db":{query},
  "next/navigation":{notFound:()=>{throw new Error("not found");}},"@/lib/avatar-storage":{resolveAvatarUrls:async()=>[null]},
  "@/lib/athlete-session":{getAthleteProgressTotals:async()=>{progressCalls++;return {chartData:[],sessionChartData:[],weeklyChartData:[],monthlyChartData:[],skillData:[],skillDives:[]};}},
  "@/lib/avatar":{avatarUrlForPage:()=>null},"@/lib/timezone":timezone,
  "react/jsx-runtime":{jsx:(type:unknown,props:unknown)=>({type,props}),jsxs:(type:unknown,props:unknown)=>({type,props})}
 };
 // Unrendered JSX imports are inert; do not replace any data dependency.
 for(const match of source.matchAll(/from "([^"]+)"/g)) if(!(match[1] in dependencies))dependencies[match[1]]={};
 const exports:{default?:(props:unknown)=>Promise<unknown>}={};
 runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,Date,console,require:(name:string)=>dependencies[name]});
 const render=(tab:string)=>exports.default!({params:Promise.resolve({id:"athlete-a"}),searchParams:Promise.resolve({tab})});
 await render("history");assert.equal(historyCalls,1);assert.equal(progressCalls,0);assert.ok(!sql.some(s=>s.includes('FROM "CompetitionDive"')||s.includes('FROM "AthleteCompetitionDiveEvaluation"')));
 sql.length=0;
 await render("evaluations");assert.equal(historyCalls,1);assert.equal(progressCalls,0);assert.ok(sql.some(s=>s.includes('FROM "AthleteCompetitionDiveEvaluation"')));assert.ok(!sql.some(s=>s.includes('FROM "AthleteDiveNote"')));
 sql.length=0;
 await render("overview");assert.equal(progressCalls,1);assert.equal(historyCalls,1);assert.ok(sql.some(s=>s.includes("LIMIT 7")),"overview only fetches the recent wellness ratings");
 exists=false;await assert.rejects(render("history"),/not found/);assert.equal(historyCalls,1,"unauthorized/missing profile cannot fetch its history");
});
