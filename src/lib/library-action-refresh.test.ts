import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import * as jsx from "react/jsx-runtime";
import * as zod from "zod";
import { randomUUID } from "node:crypto";

type Node = {type: string | ((props: Record<string,unknown>)=>Node);props:Record<string,unknown>};
function nodes(value:unknown):Node[] {
  if(Array.isArray(value))return value.flatMap(nodes);
  if(!value||typeof value!=="object"||!("props" in value))return [];
  const node=value as Node;return [node,...nodes(node.props.children)];
}
function find(root:Node,predicate:(node:Node)=>boolean):Node {const node=nodes(root).find(predicate);assert.ok(node,"UI node exists");return node;}
function text(value:unknown):string {
  if(Array.isArray(value))return value.map(text).join("");
  if(value&&typeof value==="object"&&"props" in value)return text((value as Node).props.children);
  return typeof value==="string"?value:"";
}
const call=(node:Node,key:string,...args:unknown[])=>(node.props[key] as (...args:unknown[])=>unknown)(...args);
const named=(name:string)=>(node:Node)=>typeof node.type==="function"&&node.type.name===name;
function compile(source:string,dependencies:Record<string,unknown>,globals:Record<string,unknown>={}) {
  const exports:Record<string,unknown>={};
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,
    {exports,Date,...globals,require:(name:string)=>{assert.ok(name in dependencies,`Unexpected dependency ${name}`);return dependencies[name];}});
  return exports;
}

test("library mutations use their server action revalidation without a second refresh",async(t)=>{
  const db=new PGlite();
  try{
    await db.exec(`CREATE TABLE "DrylandExercise" (id text PRIMARY KEY,name text,category text,level text,description text,"bodyArea" text,equipment text,setup text,"defaultSets" int,"defaultReps" int,"defaultDuration" int,"roundTrip" boolean,"restSeconds" int,"coachNotes" text,"archivedAt" timestamptz,tags text[],"createdAt" timestamptz,"updatedAt" timestamptz,favorite boolean DEFAULT false);
      CREATE TABLE "SyntheticExistingWork" ("exerciseId" text,repetitions int,golden int,present boolean);
      INSERT INTO "SyntheticExistingWork" VALUES ('exercise',8,2,true);`);
    const seed=async()=>db.exec(`TRUNCATE "DrylandExercise";INSERT INTO "DrylandExercise" (id,name,category,description,"roundTrip","defaultReps",favorite) VALUES ('exercise','Synthetic exercise','Technique','Synthetic instructions',false,8,false);`);
    let denied=false,failSql=false,pending=false,queries=0,refreshes=0;
    let invalidations:string[]=[],notifications:unknown[][]=[],alerts:unknown[]=[],pushes:string[]=[];
    let transitions:Promise<unknown>[]=[];
    const actionSource=readFileSync("src/app/coach/library/actions.ts","utf8");
    const actions=compile(actionSource,{
      "next/cache":{revalidatePath:(path:string)=>invalidations.push(path)},"node:crypto":{randomUUID},zod,
      "@/lib/current-user":{requireFullAccessCoach:async()=>{if(denied)throw new Error("FORBIDDEN");return {clubId:"synthetic-club"};}},
      "@/lib/db":{query:async(sql:string,args:unknown[])=>{queries++;if(failSql)throw new Error("Synthetic database failure");const result=await db.query(sql,args);return {...result,rowCount:result.affectedRows??result.rows.length};}}
    });
    function ui(legacy=false){
      const state=new Map<unknown,unknown[]>();let current:unknown[]=[];let cursor=0;
      const run=(fn:(props:Record<string,unknown>)=>Node,props:Record<string,unknown>)=>{current=state.get(fn)??[];state.set(fn,current);cursor=0;return fn(props);};
      let source=readFileSync("src/app/coach/library/library-client.tsx","utf8");
      if(legacy){
        source=source.replace("const { notify } = useToast();","const router = useRouter();\n  const { notify } = useToast();")
          .replace('notify(next ? "Ajouté aux favoris" : "Retiré des favoris");','notify(next ? "Ajouté aux favoris" : "Retiré des favoris"); router.refresh();')
          .replace('notify("Exercice supprimé");','notify("Exercice supprimé"); router.refresh();')
          .replace('setFormExercise(undefined); notify(message);','setFormExercise(undefined); notify(message); router.refresh();');
      }
      const exports=compile(source,{
        "react/jsx-runtime":jsx,
        react:{useState:(initial:unknown)=>{const index=cursor++;const values=current;if(!(index in values))values[index]=typeof initial==="function"?initial():initial;return [values[index],(value:unknown)=>{values[index]=typeof value==="function"?value(values[index]):value;}];},
          useMemo:(fn:()=>unknown)=>fn(),useTransition:()=>[pending,(fn:()=>Promise<unknown>)=>transitions.push(Promise.resolve().then(fn))]},
        "next/navigation":{useRouter:()=>({refresh:()=>refreshes++,push:(path:string)=>pushes.push(path)})},
        "@/app/coach/library/actions":actions,"@/components/ui/toast-provider":{useToast:()=>({notify:(...args:unknown[])=>notifications.push(args)})},
        "lucide-react":new Proxy({},{get:()=>()=>null}),"@/components/ui/badge":{Badge:()=>null},"@/components/ui/button":{Button:()=>null},"@/components/ui/input":{Input:()=>null},"@/lib/utils":{cn:(...parts:unknown[])=>parts.filter(Boolean).join(" ")}
      },{alert:(message:unknown)=>alerts.push(message)});
      const render=async()=>run(exports.LibraryClient as (props:Record<string,unknown>)=>Node,{exercises:(await db.query(`SELECT *,NULL::text AS "lastUsed" FROM "DrylandExercise" WHERE "archivedAt" IS NULL ORDER BY name`)).rows,dives:[],templates:[{id:"template",name:"Synthetic template",category:"Séance",blocks:1,favorite:false}]});
      const form=(parent:Node)=>{const node=find(parent,named("ExerciseForm"));return run(node.type as (props:Record<string,unknown>)=>Node,node.props);};
      return {render,form,run};
    }
    const flush=async()=>{while(transitions.length)await Promise.all(transitions.splice(0));};
    const reset=()=>{queries=0;refreshes=0;invalidations=[];notifications=[];alerts=[];pushes=[];transitions=[];};
    const submit=async(kind:"favorite"|"archive"|"create"|"edit",legacy=false)=>{
      const app=ui(legacy);let root=await app.render();
      if(kind==="favorite")call(find(root,n=>n.props["aria-label"]==="Favori"),"onClick");
      else if(kind==="archive"){
        call(find(root,n=>n.type==="button"&&text(n.props.children)==="Supprimer"),"onClick");root=await app.render();
        const dialog=find(root,n=>n.props.role==="alertdialog");call(find(dialog,n=>text(n.props.children)==="Supprimer"&&typeof n.props.onClick==="function"),"onClick");
      }else{
        call(find(root,n=>text(n.props.children).trim()===(kind==="create"?"Créer un exercice":"Modifier")&&typeof n.props.onClick==="function"),"onClick");root=await app.render();
        let form=app.form(root);
        call(find(form,n=>named("Field")(n)&&n.props.label==="Nom"),"onChange",kind==="create"?"Synthetic created":"Synthetic edited");
        form=app.form(root);call(find(form,n=>n.type==="textarea"),"onChange",{target:{value:"Updated instructions"}});
        form=app.form(root);call(find(form,n=>n.type==="form"),"onSubmit",{preventDefault:()=>{}});
      }
      await flush();return {app,root:await app.render()};
    };
    for(const kind of ["favorite","create","edit","archive"] as const)await t.test(`${kind}: one server revalidation, same stored result and feedback, refresh 1 -> 0`,async()=>{
      const outcomes=[];
      for(const legacy of [true,false]){
        await seed();reset();const {root}=await submit(kind,legacy);
        assert.equal(refreshes,legacy?1:0);assert.equal(invalidations.filter(path=>path==="/coach/library").length,1);
        assert.equal(queries,1);assert.equal(notifications.length,1);assert.equal(alerts.length,0);
        assert.equal(nodes(root).filter(named("ExerciseForm")).length,0);assert.equal(nodes(root).filter(n=>n.props.role==="alertdialog").length,0);
        const stored=(await db.query<{name:string;description:string;favorite:boolean;archived:boolean}>(`SELECT name,description,favorite,("archivedAt" IS NOT NULL) AS archived FROM "DrylandExercise" ORDER BY name`)).rows;
        outcomes.push({stored,notifications,invalidations});
        if(kind==="favorite")assert.equal(stored[0].favorite,true);
        if(kind==="archive")assert.equal(stored[0].archived,true);
        if(kind==="create"||kind==="edit")assert.ok(stored.some(row=>row.name===`Synthetic ${kind==="create"?"created":"edited"}`&&row.description==="Updated instructions"));
      }
      assert.deepEqual(outcomes[1],outcomes[0]);t.diagnostic(`Synthetic ${kind}: explicit router.refresh calls 1 -> 0; SQL write 1 -> 1; current page invalidation 1 -> 1. Not an HTTP/FOT/latency benchmark.`);
    });
    await t.test("authorization and persistence failures keep errors without success notices or refreshes",async()=>{
      for(const kind of ["favorite","archive","create","edit"] as const)for(const mode of ["denied","sql"]){
        await seed();reset();denied=mode==="denied";failSql=mode==="sql";
        const {root}=await submit(kind);assert.equal(refreshes,0);assert.equal(invalidations.length,0);assert.equal(queries,denied?0:1);
        if(kind==="favorite"||kind==="archive")assert.equal(notifications[0]?.[1],"error");
        else {assert.equal(notifications.length,0);assert.equal(alerts.length,1);assert.equal(nodes(root).filter(named("ExerciseForm")).length,1);}
        denied=false;failSql=false;
      }
    });
    await t.test("pending controls and navigation remain available, existing training work is untouched",async()=>{
      await seed();reset();pending=true;const app=ui();const root=await app.render();assert.equal(find(root,n=>n.props["aria-label"]==="Favori").props.disabled,true);pending=false;
      call(find(root,n=>n.props["aria-label"]==="Sélectionner Synthetic exercise"),"onClick");const selectedRoot=await app.render();
      const preview=find(selectedRoot,named("Preview"));const detail=app.run(preview.type as (props:Record<string,unknown>)=>Node,preview.props);
      call(find(root,n=>n.type==="button"&&text(n.props.children)==="Modèles"),"onClick");const templateRoot=await app.render();
      const template=find(templateRoot,named("TemplateLibrary"));const tree=app.run(template.type as (props:Record<string,unknown>)=>Node,template.props);
      call(find(tree,n=>text(n.props.children)==="Charger"),"onClick");assert.deepEqual(pushes,["/coach/sessions/new?templateId=template"]);
      call(find(detail,n=>text(n.props.children)==="+ Ajouter à la séance"),"onClick");assert.equal(pushes[1],"/coach/sessions/new?exerciseId=exercise");
      assert.deepEqual((await db.query(`SELECT * FROM "SyntheticExistingWork"`)).rows,[{exerciseId:"exercise",repetitions:8,golden:2,present:true}]);assert.equal(refreshes,0);
    });
  }finally{await db.close();}
});
