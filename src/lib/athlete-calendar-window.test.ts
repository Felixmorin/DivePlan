import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import * as timezone from "./timezone";
import type { AthletePlanningEvent } from "./athlete-planning";

// Original production indexing loop, retained only as the synthetic reference.
const legacyIndex = `const eventsByDay = new Map<string, AthletePlanningEvent[]>();
  for (const event of events) {
    const startKey = toMontrealDateInputValue(event.startsAt);
    const endKey = toMontrealDateInputValue(event.endsAt ?? event.startsAt);
    for (let date = parseMontrealSessionDate(startKey, "12:00"); toMontrealDateInputValue(date) <= endKey; date = addMontrealDays(date, 1)) {
      const key = toMontrealDateInputValue(date);
      eventsByDay.set(key, [...(eventsByDay.get(key) ?? []), event]);
    }
  }
`;
const frozenNow = new Date("2026-11-02T18:00:00Z");
class FixedDate extends Date {
  constructor(value?:string|number|Date) {super(value===undefined?frozenNow.getTime():value instanceof Date?value.getTime():value);}
}
type Element = {type?:string;props:Record<string,unknown>};
type CalendarProps = {events:AthletePlanningEvent[];monthKey:string;selectedDayKey:string|null};
const event = (id:string,startsAt:string,endsAt:string|null=null):AthletePlanningEvent=>({
  id,title:`Synthetic ${id}`,type:"CAMP",startsAt:new Date(startsAt),endsAt:endsAt?new Date(endsAt):null,
  cancelledAt:null,duration:60,location:"Pool",audience:"club",groupName:null
});
function load(legacy=false) {
  let source=readFileSync("src/app/athlete/calendar/page.tsx","utf8");
  if(legacy) {
    const start=source.indexOf("  const indexedDayKeys");
    const end=source.indexOf("  const monthEvents =",start);
    assert.ok(start>=0&&end>start);
    source=source.slice(0,start)+legacyIndex+source.slice(end);
  }
  let dateAdds=0;let dateKeys=0;let reads=0;let authorized=true;
  const maps:Array<Map<string,AthletePlanningEvent[]>>=[];
  class TrackedMap extends Map<string,AthletePlanningEvent[]> {constructor(){super();maps.push(this);}}
  const jsx=(type:unknown,props:Record<string,unknown>):Element=>({type:typeof type==="string"?type:typeof type==="function"?type.name:undefined,props});
  const dependencies:Record<string,unknown>={
    "react/jsx-runtime":{jsx,jsxs:jsx},
    "@/lib/timezone":{...timezone,
      addMontrealDays:(...args:Parameters<typeof timezone.addMontrealDays>)=>{dateAdds++;return timezone.addMontrealDays(...args);},
      toMontrealDateInputValue:(...args:Parameters<typeof timezone.toMontrealDateInputValue>)=>{dateKeys++;return timezone.toMontrealDateInputValue(...args);}},
    "@/lib/utils":{cn:(...values:unknown[])=>values.filter(Boolean).join(" ")},
    "@/lib/current-user":{requireAthlete:async()=>{if(!authorized)throw new Error("FORBIDDEN");return {athlete:{id:"athlete-a",groupId:"group-a"},clubId:"club-a"};}},
    "@/lib/athlete-planning":{getAthletePlanningEvents:async(args:{clubId:string;athleteId:string;groupId:string})=>{
      reads++;assert.deepEqual(JSON.parse(JSON.stringify(args)).clubId,"club-a");assert.equal(args.athleteId,"athlete-a");assert.equal(args.groupId,"group-a");return [];
    }}
  };
  for(const match of source.matchAll(/from "([^"]+)"/g))if(!(match[1] in dependencies))dependencies[match[1]]={};
  const exports:{MonthCalendar?:(props:CalendarProps)=>Element;default?:(props:unknown)=>Promise<Element>}={};
  runInNewContext(ts.transpileModule(source+"\nexport { MonthCalendar };",{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}
  }).outputText,{exports,Date:FixedDate,Map:TrackedMap,Set,require:(name:string)=>dependencies[name]});
  return {render:exports.MonthCalendar!,page:exports.default!,deny:()=>{authorized=false;},stats:()=>({dateAdds,dateKeys,reads,
    indexedDays:maps.at(-1)?.size??0,memberships:[...(maps.at(-1)?.values()??[])].reduce((sum,items)=>sum+items.length,0)})};
}
const plain=(value:unknown)=>JSON.parse(JSON.stringify(value));

test("calendar renders the same long events with indexing bounded to the visible days",t=>{
  const events=Array.from({length:12},(_,i)=>event(`long-${i}`,"2026-01-01T05:00Z","2026-12-31T23:00Z"));
  const props={events,monthKey:"2026-11",selectedDayKey:null};
  const before=load(true);const after=load();
  assert.deepEqual(plain(after.render(props)),plain(before.render(props)));
  const old=before.stats();const updated=after.stats();
  assert.equal(updated.indexedDays,42);assert.equal(updated.memberships,12*42);
  assert.ok(updated.dateAdds<old.dateAdds/20);assert.ok(updated.dateKeys<old.dateKeys/20);
  t.diagnostic(`Synthetic 12 year-long events: indexed days ${old.indexedDays} -> ${updated.indexedDays}; retained event/day memberships ${old.memberships} -> ${updated.memberships}; addMontrealDays calls ${old.dateAdds} -> ${updated.dateAdds}; date-key conversions ${old.dateKeys} -> ${updated.dateKeys}. Same render tree. No production timing or transfer measurement.`);
});

test("grid and selected-day details preserve DST, adjacent months, ordering, cancellations and all event types",()=>{
  const events=[event("spanning","2026-10-20T12:00Z","2026-12-08T12:00Z"),
    event("dst-before","2026-11-01T05:30Z"),event("dst-after","2026-11-01T06:30Z"),
    event("midnight","2026-11-01T04:00Z","2026-11-02T05:00Z"),
    event("single","2026-11-02T17:00Z"),event("reversed","2026-11-05T17:00Z","2026-11-04T17:00Z")];
  events[1].type="COMPETITION";events[2].type="TRAINING_SCHEDULE";events[2].cancelledAt=frozenNow;
  events[3].audience="athlete";events[4].audience="group";events[4].groupName="Synthetic group";
  for(const selectedDayKey of [null,"2026-11-01","2026-10-26","2026-12-06","2026-12-08","2026-01-01"]) {
    const props={events,monthKey:"2026-11",selectedDayKey};
    const before=load(true);const after=load();
    assert.deepEqual(plain(after.render(props)),plain(before.render(props)),String(selectedDayKey));
    assert.ok(after.stats().indexedDays<=43);
  }
  const spring={events:[event("spring","2026-03-07T05:00Z","2026-03-10T04:00Z")],monthKey:"2026-03",selectedDayKey:"2026-03-08"};
  assert.deepEqual(plain(load().render(spring)),plain(load(true).render(spring)));
});

test("empty calendars and far-away selected dates preserve their empty/detail states without expanding the event",()=>{
  for(const props of [
    {events:[],monthKey:"2026-11",selectedDayKey:null},
    {events:[],monthKey:"2026-11",selectedDayKey:"2026-11-02"},
    {events:[event("long","2025-01-01","2027-12-31")],monthKey:"2026-11",selectedDayKey:"2027-08-01"}
  ]) {
    const after=load();assert.deepEqual(plain(after.render(props)),plain(load(true).render(props)));
    assert.ok(after.stats().indexedDays<=43);assert.equal(after.stats().dateAdds,43);
  }
});

test("the page still authorizes before scoped reads and both calendar/list views use the same read counts",async()=>{
  for(const view of ["calendar","list"]) {
    const page=load();await page.page({searchParams:Promise.resolve({view,month:"2026-11"})});
    assert.equal(page.stats().reads,view==="calendar"?2:1);
    page.deny();await assert.rejects(page.page({searchParams:Promise.resolve({view})}),/FORBIDDEN/);
    assert.equal(page.stats().reads,view==="calendar"?2:1);
  }
});
