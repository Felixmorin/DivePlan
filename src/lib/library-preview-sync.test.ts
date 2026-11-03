import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import { createElement, type ReactNode } from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";

type Node = {type:string|((props:Record<string,unknown>)=>Node);props:Record<string,unknown>};
const fixture = (id="exercise-a") => ({id,name:"Original exercise",category:"Technique",level:"Intermédiaire",description:"Original instructions",bodyArea:"Jambes",equipment:"Tapis",setup:"Pool",defaultSets:2,defaultReps:8,defaultDuration:null,roundTrip:false,restSeconds:20,coachNotes:"Original coach note",favorite:false,lastUsed:null});
type Exercise = ReturnType<typeof fixture>;
function nodes(value:unknown):Node[] {
  if(Array.isArray(value))return value.flatMap(nodes);
  if(!value||typeof value!=="object"||!("props" in value))return [];
  const node=value as Node;return [node,...nodes(node.props.children)];
}
const named=(name:string)=>(node:Node)=>typeof node.type==="function"&&node.type.name===name;
function find(root:Node,predicate:(node:Node)=>boolean):Node {const node=nodes(root).find(predicate);assert.ok(node,"Expected UI node");return node;}
const call=(node:Node,key:string,...args:unknown[])=>(node.props[key] as (...args:unknown[])=>unknown)(...args);

function mount(legacy=false) {
  let current:unknown[]=[];let cursor=0;const states=new Map<unknown,unknown[]>();
  let refreshes=0,mutations=0;const pushes:string[]=[];
  const run=(fn:(props:Record<string,unknown>)=>Node,props:Record<string,unknown>)=>{current=states.get(fn)??[];states.set(fn,current);cursor=0;return fn(props);};
  let source=readFileSync("src/app/coach/library/library-client.tsx","utf8");
  if(legacy)source=source.replace('const [selection, setSelected] = useState<Exercise | null>(null);\n  const selected = exercises.find((exercise) => exercise.id === selection?.id) ?? null;', 'const [selected, setSelected] = useState<Exercise | null>(null);');
  const wrap=({children}:{children?:ReactNode})=>createElement("div",null,children);
  const dependencies:Record<string,unknown>={
    "react/jsx-runtime":jsx,react:{useMemo:(fn:()=>unknown)=>fn(),useTransition:()=>[false,()=>{throw new Error("Unexpected mutation");}],
      useState:(initial:unknown)=>{const values=current;const index=cursor++;if(!(index in values))values[index]=typeof initial==="function"?initial():initial;return [values[index],(value:unknown)=>{values[index]=typeof value==="function"?value(values[index]):value;}];}},
    "next/navigation":{useRouter:()=>({refresh:()=>refreshes++,push:(path:string)=>pushes.push(path)})},
    "@/app/coach/library/actions":{archiveLibraryExercise:()=>mutations++,saveLibraryExercise:()=>mutations++,toggleLibraryExerciseFavorite:()=>mutations++},
    "@/components/ui/toast-provider":{useToast:()=>({notify:()=>{}})},"lucide-react":icons,
    "@/components/ui/badge":{Badge:wrap},"@/components/ui/button":{Button:wrap},"@/components/ui/input":{Input:wrap},
    "@/lib/utils":{cn:(...parts:unknown[])=>parts.filter(Boolean).join(" ")}
  };
  const exports:Record<string,unknown>={};
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,
    {exports,require:(name:string)=>{assert.ok(name in dependencies,name);return dependencies[name];}});
  const render=(exercises:Exercise[])=>run(exports.LibraryClient as (props:Record<string,unknown>)=>Node,{exercises,dives:[],templates:[]});
  const child=(node:Node)=>run(node.type as (props:Record<string,unknown>)=>Node,node.props);
  const select=(root:Node,name:string)=>call(find(root,n=>n.props["aria-label"]===`Sélectionner ${name}`),"onClick");
  return {render,child,select,stats:()=>({refreshes,mutations,pushes})};
}

test("library mobile preview resolves the selected id against current server props",async(t)=>{
  const original=fixture();const updated={...original,name:"Updated exercise",description:"Updated instructions",coachNotes:"Updated coach note",defaultSets:4,defaultReps:12};
  await t.test("incoming updated props replace stale preview details without another refresh",()=>{
    for(const legacy of [true,false]){
      const app=mount(legacy);app.select(app.render([original]),original.name);
      const preview=find(app.render([updated]),named("Preview"));
      assert.strictEqual(preview.props.exercise,legacy?original:updated);
      const markup=renderToStaticMarkup(app.child(preview) as unknown as ReactNode);
      assert.match(markup,legacy?/Original instructions/:/Updated instructions/);
      assert.match(markup,legacy?/Original coach note/:/Updated coach note/);
      assert.doesNotMatch(markup,legacy?/Updated exercise/:/Original exercise/);
      assert.deepEqual(app.stats(),{refreshes:0,mutations:0,pushes:[]});
    }
    t.diagnostic("Synthetic prop update: original description/notes before -> current description/notes after; 0 extra refreshes, 0 mutations. Not a production or network measurement.");
  });
  await t.test("edit opens with current data and an unsaved draft survives subsequent prop updates",()=>{
    const before=mount(true);before.select(before.render([original]),original.name);
    call(find(before.render([updated]),named("Preview")),"onEdit");
    assert.strictEqual(find(before.render([updated]),named("ExerciseForm")).props.exercise,original);
    const app=mount();app.select(app.render([original]),original.name);
    call(find(app.render([updated]),named("Preview")),"onEdit");
    const form=find(app.render([updated]),named("ExerciseForm"));assert.strictEqual(form.props.exercise,updated);
    let formTree=app.child(form);
    const nameField=find(formTree,n=>named("Field")(n)&&n.props.label==="Nom");assert.equal(nameField.props.value,"Updated exercise");
    call(nameField,"onChange","Unsaved draft name");
    const newer={...updated,name:"Another server edit"};
    formTree=app.child(find(app.render([newer]),named("ExerciseForm")));
    assert.equal(find(formTree,n=>named("Field")(n)&&n.props.label==="Nom").props.value,"Unsaved draft name");
    assert.equal(app.stats().mutations,0);
  });
  await t.test("delete confirmation uses the current name and identifier",()=>{
    const app=mount();app.select(app.render([original]),original.name);
    call(find(app.render([updated]),named("Preview")),"onDelete");
    const dialog=find(app.render([updated]),n=>n.props.role==="alertdialog");
    const markup=renderToStaticMarkup(dialog as unknown as ReactNode);assert.match(markup,/Updated exercise/);assert.doesNotMatch(markup,/Original exercise/);
    assert.deepEqual(app.stats(),{refreshes:0,mutations:0,pushes:[]});
  });
  await t.test("removed selections and replacement datasets cannot retain an obsolete preview",()=>{
    const app=mount();app.select(app.render([original]),original.name);
    assert.equal(nodes(app.render([])).filter(named("Preview")).length,0);
    const other={...fixture("exercise-b"),name:"Other exercise"};
    assert.equal(nodes(app.render([other])).filter(named("Preview")).length,0);
    app.select(app.render([other]),other.name);
    assert.strictEqual(find(app.render([other]),named("Preview")).props.exercise,other);
    assert.deepEqual(app.stats(),{refreshes:0,mutations:0,pushes:[]});
  });
  await t.test("close, reopen and unrelated updates preserve the intended selection",()=>{
    const app=mount();const other={...fixture("exercise-b"),name:"Other exercise"};
    assert.equal(nodes(app.render([original,other])).filter(named("Preview")).length,0);
    app.select(app.render([original,other]),other.name);
    const preview=find(app.render([updated,other]),named("Preview"));assert.strictEqual(preview.props.exercise,other);
    call(preview,"onClose");assert.equal(nodes(app.render([updated,other])).filter(named("Preview")).length,0);
    app.select(app.render([updated,other]),updated.name);assert.strictEqual(find(app.render([updated,other]),named("Preview")).props.exercise,updated);
  });
  await t.test("filtering does not substitute another exercise and add-to-session navigation is preserved",()=>{
    const app=mount();app.select(app.render([original]),original.name);
    let root=app.render([updated]);
    call(find(root,n=>n.props.placeholder==="Rechercher un exercice…"),"onChange",{target:{value:"No matching exercise"}});
    root=app.render([updated]);const preview=find(root,named("Preview"));assert.strictEqual(preview.props.exercise,updated);
    const detail=app.child(preview);
    const button=find(detail,n=>Array.isArray(n.props.children)&&n.props.children.includes("+ Ajouter à la séance")||n.props.children==="+ Ajouter à la séance");
    call(button,"onClick");assert.deepEqual(app.stats(),{refreshes:0,mutations:0,pushes:["/coach/sessions/new?exerciseId=exercise-a"]});
  });
});
