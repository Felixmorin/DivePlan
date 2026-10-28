"use client";

import Form from "next/form";
import { useRef, useState } from "react";
import Link from "@/components/ui/app-link";
import { CalendarDays, ChartNoAxesColumnIncreasing, Clock3, Layers3, MapPin, Search, Users, Timer, LayoutGrid, List, CheckCircle2, FileText } from "lucide-react";
import type { CoachSessionsPage } from "@/lib/coach-sessions-list";
import { PAGE_SIZE, pageHref } from "@/lib/pagination";
import { deleteTrainingSession, markTrainingSessionNotDone } from "@/app/coach/sessions/actions";

export type SessionListItem = {
  id: string; title: string; groupName: string; status: "DRAFT" | "READY" | "IN_PROGRESS" | "COMPLETED" | "NOT_DONE" | "CANCELLED";
  date: Date | string; duration: number; volume: number; athleteCount: number; blockCount: number; location: string | null;
};

type Tab = "all" | "completed" | "drafts";

export function SessionsList({ sessions, pagination }: { sessions: SessionListItem[]; pagination?: CoachSessionsPage }) {
  if (pagination) return <PaginatedSessions data={pagination} />;
  return <DemoSessionsList sessions={sessions} />;
}
function DemoSessionsList({ sessions }: { sessions: SessionListItem[] }) {
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("all");
  const [period, setPeriod] = useState("all");
  const [expanded, setExpanded] = useState(false);
  const [view, setView] = useState<"tiles" | "list">("tiles");
  const now = new Date();
  const groups = [...new Set(sessions.map((session) => session.groupName))].sort();
  const counts = {
    all: sessions.length,
    completed: sessions.filter((s) => s.status === "COMPLETED" || s.status === "NOT_DONE" || s.status === "CANCELLED").length,
    drafts: sessions.filter((s) => s.status === "DRAFT").length,
  };
  const filtered = sessions.filter((s) => {
    const date = new Date(s.date);
    const matchesSearch = `${s.title} ${s.groupName}`.toLocaleLowerCase("fr").includes(search.toLocaleLowerCase("fr"));
    const matchesPeriod = period === "all" || (period === "month" ? date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear() : date >= new Date(now.getTime() - Number(period) * 86400000));
    return matchesSearch && (group === "all" || s.groupName === group) && matchesPeriod;
  });
  const upcoming = filtered.filter((s) => s.status === "READY" || s.status === "IN_PROGRESS").sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const completed = filtered.filter((s) => s.status === "COMPLETED" || s.status === "NOT_DONE" || s.status === "CANCELLED").sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const drafts = filtered.filter((s) => s.status === "DRAFT").sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const next = tab === "all" ? upcoming[0] : undefined;
  const historySource = tab === "all"
    ? filtered.filter((s) => s.id !== next?.id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    : tab === "completed" ? completed : drafts;
  const orderedSessions = tab === "all" && next ? [next, ...historySource] : historySource;
  const history = !expanded ? orderedSessions.slice(0, 9) : orderedSessions;
  const planned = filtered.reduce((sum, s) => sum + s.volume, 0);
  const hours = Math.round(filtered.filter(s=>{const d=new Date(s.date);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear()}).reduce((sum, s) => sum + s.duration, 0) / 60);

  return <>
    <DashboardStats monthCount={filtered.filter(s=>{const d=new Date(s.date);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear()}).length} upcoming={upcoming.length} volume={planned} hours={hours}/>
    <div className="mb-4 flex flex-wrap items-center gap-1.5">
      <div className="flex flex-1 flex-wrap gap-1" role="tablist" aria-label="Filtrer les séances">
        {([["all", `Toutes (${counts.all})`], ["completed", `Terminées (${counts.completed})`], ["drafts", `Brouillons (${counts.drafts})`]] as [Tab, string][]).map(([value, label]) => <button key={value} role="tab" aria-selected={tab === value} onClick={() => { setTab(value); setExpanded(false); }} className={`min-h-11 border-b-2 px-4 text-sm font-bold transition ${tab === value ? "border-cyan-500 text-sky-700" : "border-transparent text-slate-600 hover:bg-slate-50"}`}>{label}</button>)}
      </div>
      <label className="ml-auto flex min-h-8 min-w-44 items-center gap-2 rounded-md border border-slate-200 bg-white px-2 text-slate-500"><Search className="h-3.5 w-3.5 shrink-0" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher une séance…" className="min-w-0 flex-1 bg-transparent text-[10px] text-slate-800 outline-none" /></label>
      <select value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Filtrer par groupe" className="min-h-8 rounded-md border border-slate-200 bg-white px-2 text-[10px] text-slate-700"><option value="all">Tous les groupes</option>{groups.map((g) => <option key={g}>{g}</option>)}</select>
      <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Filtrer par période" className="min-h-8 rounded-md border border-slate-200 bg-white px-2 text-[10px] text-slate-700"><option value="all">Toutes les dates</option><option value="month">Ce mois-ci</option><option value="30">30 derniers jours</option><option value="90">90 derniers jours</option></select><ViewToggle view={view} onChange={setView}/>
    </div>

    <section>
      {history.length ? <div className={view === "tiles" ? "grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3" : "grid grid-cols-1 gap-2"}>{history.map((s) => <SessionRow key={s.id} session={s} view={view} />)}
        {orderedSessions.length > 9 && <button onClick={() => setExpanded(!expanded)} className="m-2 w-[calc(100%-1rem)] rounded-lg bg-slate-100 py-3 text-sm font-bold text-sky-800 hover:bg-slate-200">⌄　{expanded ? "Réduire l’historique" : "Afficher les séances précédentes"}</button>}
      </div> : !(tab === "all" && next) && <div className="rounded-xl border border-dashed border-slate-300 bg-white/70 px-5 py-12 text-center"><p className="font-bold">Aucune séance trouvée</p><p className="mt-1 text-sm text-slate-500">Modifiez les filtres ou créez une nouvelle séance.</p></div>}
    </section>
  </>;
}

function DashboardStats({monthCount,upcoming,volume,hours}:{monthCount:number;upcoming:number;volume:number;hours:number}) {
  const items: {icon: typeof CalendarDays;label:string;value:string|number;tone:"sky"|"teal"|"violet"|"orange"}[] = [{icon:CalendarDays,label:"Séances ce mois-ci",value:monthCount,tone:"sky"},{icon:Clock3,label:"À venir",value:upcoming,tone:"teal"},{icon:ChartNoAxesColumnIncreasing,label:"Plongeons planifiés",value:volume.toLocaleString("fr-CA"),tone:"violet"},{icon:Timer,label:"Temps d’entraînement",value:`${hours} heures`,tone:"orange"}];
  const tones: Record<"sky"|"teal"|"violet"|"orange",string> = {sky:"bg-sky-100 text-sky-600",teal:"bg-emerald-100 text-emerald-600",violet:"bg-violet-100 text-violet-600",orange:"bg-orange-100 text-orange-600"};
  return <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">{items.map(({icon:Icon,label,value,tone})=><div key={label} className="flex h-[92px] w-full max-w-[300px] items-center gap-4 rounded-lg border border-slate-200/80 bg-white px-4 shadow-sm"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${tones[tone]}`}><Icon className="h-5 w-5"/></span><span className="min-w-0"><small className="block truncate text-[14px] leading-5 text-slate-500">{label}</small><b className="block text-[26px] leading-7 text-slate-950">{value}</b></span></div>)}</div>;
}

function ViewToggle({view,onChange}:{view:"tiles"|"list";onChange:(view:"tiles"|"list")=>void}) {
  return <div className="flex h-8 overflow-hidden rounded-md border border-slate-200 bg-white" aria-label="Mode d’affichage">
    <button type="button" aria-label="Vue en tuiles" aria-pressed={view==="tiles"} onClick={()=>onChange("tiles")} className={`grid w-8 place-items-center ${view==="tiles"?"bg-cyan-500 text-white":"text-slate-500 hover:bg-slate-50"}`}><LayoutGrid className="h-4 w-4"/></button>
    <button type="button" aria-label="Vue en liste" aria-pressed={view==="list"} onClick={()=>onChange("list")} className={`grid w-8 place-items-center ${view==="list"?"bg-cyan-500 text-white":"text-slate-500 hover:bg-slate-50"}`}><List className="h-4 w-4"/></button>
  </div>;
}

function SessionRow({ session: s, showMonth = false, view = "tiles" }: { session: SessionListItem; showMonth?: boolean; view?: "tiles"|"list" }) {
  const date = new Date(s.date);
  const completed = s.status === "COMPLETED";
  const draft = s.status === "DRAFT";
  const label = completed ? "Terminée" : draft ? "Brouillon" : s.status === "NOT_DONE" ? "Non faite" : s.status === "CANCELLED" ? "Annulée" : s.status === "IN_PROGRESS" ? "En cours" : "À venir";
  const fmtDate = new Intl.DateTimeFormat("fr-CA", { timeZone: "America/Toronto", day: "numeric", month: "short", year: "numeric" }).format(date);
  if (view === "list") return <article className="grid grid-cols-1 items-center gap-2 rounded-lg border border-slate-200/80 bg-white px-3 py-2 shadow-sm md:grid-cols-[minmax(170px,1fr)_minmax(360px,2fr)_auto]">
    <div className="min-w-0"><span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-[3px] text-[10px] font-bold ${completed||s.status==="IN_PROGRESS"?"bg-emerald-100 text-emerald-800":draft?"bg-slate-100 text-slate-700":"bg-sky-100 text-sky-800"}`}>{completed||s.status==="IN_PROGRESS"?<CheckCircle2 className="h-3 w-3"/>:draft?<FileText className="h-3 w-3"/>:<Clock3 className="h-3 w-3"/>}{label}</span><h3 className="truncate text-[18px] font-extrabold leading-tight">{s.title}</h3><p className="truncate text-[12px] text-slate-500">{s.groupName}</p></div>
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] leading-[13px] text-slate-600 sm:grid-cols-3"><span className="flex items-center gap-1"><CalendarDays className="h-3 w-3 shrink-0"/>{fmtDate}</span><span className="flex items-center gap-1"><Clock3 className="h-3 w-3 shrink-0"/>{Math.floor(s.duration/60)} h {String(s.duration%60).padStart(2,"0")}</span><span className="flex items-center gap-1"><ChartNoAxesColumnIncreasing className="h-3 w-3 shrink-0"/>{s.volume.toLocaleString("fr-CA")} plongeons</span><span className="flex items-center gap-1"><Users className="h-3 w-3 shrink-0"/>{s.athleteCount} athlètes</span><span className="flex items-center gap-1"><Layers3 className="h-3 w-3 shrink-0"/>{s.blockCount} blocs</span><span className="flex items-center gap-1"><MapPin className="h-3 w-3 shrink-0"/><span className="truncate">{s.location||"Centre aquatique MTL"}</span></span></div>
    <Link href={s.id.startsWith("demo-")?"/coach/sessions/demo":`/coach/sessions/${s.id}`} className="inline-flex min-h-7 items-center justify-center rounded-md border border-sky-300 bg-white px-3 text-[10px] font-bold text-sky-600">Ouvrir&nbsp; →</Link>
  </article>;
  return <>
    {showMonth && <div className="border-b border-slate-200 bg-slate-100/80 px-4 py-2 text-sm font-extrabold capitalize text-slate-700">{new Intl.DateTimeFormat("fr-CA", { month: "long", year: "numeric", timeZone: "America/Toronto" }).format(date)}</div>}
    <article className="relative flex min-h-[154px] min-w-0 flex-col gap-1 rounded-lg border border-slate-200/80 bg-white p-2.5 pb-8 shadow-[0_2px_8px_rgba(23,53,89,.05)]">
      <div className="flex items-center justify-between"><span className={`inline-flex w-fit items-center gap-1 rounded-full px-1.5 py-[3px] text-[10px] font-bold ${completed || s.status === "IN_PROGRESS" ? "bg-emerald-100 text-emerald-800" : draft ? "bg-slate-100 text-slate-700" : "bg-sky-100 text-sky-800"}`}>{completed || s.status === "IN_PROGRESS" ? <CheckCircle2 className="h-3 w-3"/> : draft ? <FileText className="h-3 w-3"/> : <Clock3 className="h-3 w-3"/>}{label}</span>{!s.id.startsWith("demo-")?<details className="relative"><summary aria-label="Actions de la séance" className="cursor-pointer list-none text-[12px] font-black leading-none text-slate-500">•••</summary><div className="absolute right-0 top-5 z-20 w-40 rounded-lg border border-slate-200 bg-white p-1 shadow-lg"><form action={markTrainingSessionNotDone}><input type="hidden" name="sessionId" value={s.id}/><button className="w-full rounded px-2 py-1.5 text-left text-[11px] hover:bg-slate-50">Marquer non faite</button></form><form action={deleteTrainingSession}><input type="hidden" name="sessionId" value={s.id}/><button className="w-full rounded px-2 py-1.5 text-left text-[11px] text-red-700 hover:bg-red-50">Supprimer</button></form></div></details>:<span className="text-[12px] font-black leading-none text-slate-500">•••</span>}</div>
      <div className="min-w-0"><h3 className="truncate text-[18px] font-extrabold leading-tight">{s.title}</h3><p className="text-[12px] text-slate-500">{s.groupName}</p></div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] leading-[13px] text-slate-600">
        <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3 shrink-0" /><span className="capitalize">{fmtDate}</span></span>
        <span className="flex items-center gap-1"><Users className="h-3 w-3 shrink-0" />{s.groupName}</span>
        <span className="flex items-center gap-1"><Clock3 className="h-3 w-3 shrink-0" />{Math.floor(s.duration/60)} h {String(s.duration%60).padStart(2,"0")}</span>
        <span className="flex items-center gap-1"><Users className="h-3 w-3 shrink-0" />{s.athleteCount} athlètes</span>
        <span className="flex items-center gap-1"><ChartNoAxesColumnIncreasing className="h-3 w-3 shrink-0" />{s.volume.toLocaleString("fr-CA")} plongeons</span>
        <span className="flex items-center gap-1"><Layers3 className="h-3 w-3 shrink-0" />{s.blockCount} blocs</span>
        <span className="col-span-2 flex items-center gap-1"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{s.location || "Centre aquatique MTL"}</span></span>
      </div>
      <div className="absolute bottom-1.5 right-2"><Link href={s.id.startsWith("demo-") ? "/coach/sessions/demo" : `/coach/sessions/${s.id}`} className="inline-flex min-h-7 items-center justify-center rounded-md border border-sky-300 bg-white px-3 text-[10px] font-bold text-sky-600 hover:bg-sky-50">Ouvrir&nbsp; →</Link></div>
    </article>
  </>;
}

function PaginatedSessions({ data }: { data: CoachSessionsPage }) {
  const [view, setView] = useState<"tiles"|"list">("tiles");
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { filters, counts } = data;
  const href = (page: number, tab = filters.tab) => pageHref("/coach/sessions", { ...filters, tab }, page);
  const metrics = data.dashboard;
  return <>
    <DashboardStats monthCount={metrics?.monthCount??0} upcoming={metrics?.upcoming??0} volume={metrics?.volume??0} hours={Math.round((metrics?.minutes??0)/60)}/>
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
    <nav aria-label="Catégories de séances" className="flex w-fit flex-wrap gap-1">{([["all","Toutes"],["completed","Terminées"],["drafts","Brouillons"]] as const).map(([tab,label]) => <Link className="rounded-md border bg-white px-3 py-2 text-[10px] font-bold aria-[current=page]:border-sky-300 aria-[current=page]:bg-sky-100 aria-[current=page]:text-sky-800" key={tab} href={href(1,tab)} aria-current={filters.tab===tab?"page":undefined}>{label} ({counts[tab]})</Link>)}</nav>
    <Form action="/coach/sessions" prefetch={false} className="ml-auto flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="tab" value={filters.tab}/>
      <input key={filters.q} name="q" aria-label="Rechercher une séance" defaultValue={filters.q} maxLength={150} placeholder="Rechercher une séance…" onChange={(event)=>{if(searchTimeout.current) clearTimeout(searchTimeout.current); const form=event.currentTarget.form; searchTimeout.current=setTimeout(()=>form?.requestSubmit(),350);}} className="min-h-8 w-44 rounded-md border border-slate-200 px-2 text-[10px]"/>
      <select key={filters.group} name="group" aria-label="Filtrer par groupe" defaultValue={filters.group} onChange={(event)=>event.currentTarget.form?.requestSubmit()} className="min-h-8 rounded-md border border-slate-200 px-2 text-[10px]"><option value="">Tous les groupes</option>{data.groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select>
      <select key={filters.period} name="period" aria-label="Filtrer par période" defaultValue={filters.period} onChange={(event)=>event.currentTarget.form?.requestSubmit()} className="min-h-8 rounded-md border border-slate-200 px-2 text-[10px]"><option value="">Toutes les dates</option><option value="month">Ce mois-ci</option><option value="30">30 derniers jours</option><option value="90">90 derniers jours</option></select>
      <ViewToggle view={view} onChange={setView}/>
    </Form>
    </div>
    {(() => {const visible=data.sessions.filter(s=>s.id!==data.next?.id); if(data.next) visible.unshift(data.next); return <div className={view==="tiles"?"grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3":"grid grid-cols-1 gap-2"}>{visible.map(s=><SessionRow key={s.id} session={s} view={view}/>)}{!visible.length&&<p className="col-span-full rounded-xl border border-dashed bg-white p-6 text-slate-500">Aucune séance ne correspond aux filtres.</p>}</div>;})()}
    <nav aria-label="Pagination des séances" className="mt-4 flex justify-between gap-3 text-sm font-semibold">{data.page>1?<Link href={href(data.page-1)}>Précédent</Link>:<span/>}<span>Page {data.page} / {Math.max(1,Math.ceil(data.total/PAGE_SIZE))} · {data.total} séances</span>{data.page*PAGE_SIZE<data.total?<Link href={href(data.page+1)}>Suivant</Link>:<span/>}</nav>
  </>;
}
