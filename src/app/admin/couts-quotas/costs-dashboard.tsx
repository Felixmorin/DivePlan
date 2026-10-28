"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/ui/app-link";
import { ArrowDown, ArrowUp, Bell, CalendarDays, ChevronDown, Pencil } from "lucide-react";

export type ChartPoint = { day: string; transfer: number; sql: number; transferAt: string | null; sqlAt: string | null };
export type RouteMetric = { route: string; requests: string; bytes: string; updated: Date };
export function CostsDashboard({ period, aggregation }: { period: string; aggregation: string }) {
  const router = useRouter();
  const updateFilter = (next: { period?: string; aggregation?: string }) => {
    const params = new URLSearchParams({ period, aggregation, ...next });
    router.push(`/admin/couts-quotas?${params.toString()}`);
  };
  return <div className="flex flex-wrap items-center gap-2">
    <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2"><CalendarDays className="h-4 w-4 text-slate-600"/><label className="sr-only" htmlFor="cost-period">Période</label><select id="cost-period" value={period} onChange={e=>updateFilter({ period: e.target.value })} className="min-h-9 bg-transparent text-sm font-semibold text-slate-800"><option value="7d">7 derniers jours</option><option value="30d">30 derniers jours</option><option value="90d">90 derniers jours</option></select><ChevronDown className="h-4 w-4"/></span>
    <label className="sr-only"><span>Agrégation</span><select id="aggregation" value={aggregation} onChange={e=>updateFilter({ aggregation: e.target.value })} className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold"><option value="day">Jour</option><option value="week">Semaine</option><option value="month">Mois</option></select></label>
    <a href="#alert-panel" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-bold text-white hover:bg-blue-700"><Bell className="h-4 w-4"/>Configurer les alertes</a>
  </div>;
}
export function CostsChart({ points, aggregation }: { points: ChartPoint[]; aggregation: string }) {
  const rows = useMemo(() => {
    if (aggregation === "day") return points;
    const map = new Map<string, ChartPoint>();
    points.forEach((p, i) => { const key = aggregation === "week" ? `Sem. ${Math.floor(i/7)+1}` : p.day.slice(0,2); const old = map.get(key); map.set(key, { day:key, transfer:(old?.transfer??0)+p.transfer, sql:(old?.sql??0)+p.sql, transferAt:p.transferAt, sqlAt:p.sqlAt }); });
    return [...map.values()];
  }, [points, aggregation]);
  const max = Math.max(1, ...rows.flatMap(p=>[p.transfer,p.sql]));
  const width=760, height=260, pad=44;
  const coords = (key: "transfer"|"sql") => rows.map((p,i)=>`${pad+i*(width-pad*2)/Math.max(1,rows.length-1)},${height-pad-(p[key]/max)*(height-pad*2)}`).join(" ");
  if (!points.length) return <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Aucune donnée sur cette période. Les métriques apparaîtront lorsque la télémétrie aura été collectée.</p>;
  return <div className="min-w-0"><div className="w-full overflow-x-auto"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Transfert navigateur et volume des résultats SQL observés" className="h-auto min-w-[520px] w-full">{[0,1,2,3,4].map(i=><g key={i}><line x1={pad} x2={width-pad} y1={pad+i*(height-pad*2)/4} y2={pad+i*(height-pad*2)/4} stroke="#e2e8f0"/><text x="0" y={pad+i*(height-pad*2)/4+4} fill="#64748b" fontSize="11">{(max*(1-i/4)/1024/1024).toFixed(1)} Mo</text></g>)}<polyline points={coords("transfer")} fill="none" stroke="#0875e1" strokeWidth="3"/ ><polyline points={coords("sql")} fill="none" stroke="#f97316" strokeWidth="3"/>{rows.map((p,i)=><g key={p.day}><circle cx={pad+i*(width-pad*2)/Math.max(1,rows.length-1)} cy={height-pad-p.transfer/max*(height-pad*2)} r="4" fill="#0875e1"><title>{p.day}: {fmt(p.transfer)} octets · Instrumentation navigateur DivePlan · observé</title></circle><circle cx={pad+i*(width-pad*2)/Math.max(1,rows.length-1)} cy={height-pad-p.sql/max*(height-pad*2)} r="4" fill="#f97316"><title>{p.day}: {fmt(p.sql)} octets · résultats SQL · observé</title></circle></g>)}</svg></div><div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-600"><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-blue-600"/>Transfert navigateur estimé DivePlan</span><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-orange-500"/>Résultats SQL observés</span></div><p className="mt-2 text-xs text-slate-500">Historique réel agrégé. Projection de fin de période : indisponible (quota et période fournisseur non configurés).</p></div>;
}
export function RouteTable({ routes }: { routes: RouteMetric[] }) {
 const [sort,setSort]=useState<"bytes"|"requests">("bytes"); const sorted=[...routes].sort((a,b)=>Number(b[sort])-Number(a[sort]));
 return <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="border-y border-slate-200 bg-slate-50 text-xs text-slate-600"><tr><th className="p-3">Route ou fonctionnalité</th><th><button className="inline-flex items-center gap-1 p-3 font-bold" onClick={()=>setSort("bytes")}>Transfert estimé {sort==="bytes"?<ArrowDown className="h-3 w-3"/>:<ArrowUp className="h-3 w-3"/>}</button></th><th><button className="inline-flex items-center gap-1 p-3 font-bold" onClick={()=>setSort("requests")}>Requêtes {sort==="requests"?<ArrowDown className="h-3 w-3"/>:<ArrowUp className="h-3 w-3"/>}</button></th><th className="p-3">Source / détails</th></tr></thead><tbody>{sorted.length?sorted.map(row=><tr key={row.route} className="border-b border-slate-100"><td className="p-3 font-semibold text-slate-800">{row.route}</td><td className="p-3">{fmt(Number(row.bytes))}</td><td className="p-3">{Number(row.requests).toLocaleString("fr-CA")}</td><td className="p-3"><Link className="font-semibold text-blue-700 hover:underline" href={`/admin/performance?route=${encodeURIComponent(row.route)}`}>Instrumentation app · Diagnostic →</Link></td></tr>):<tr><td colSpan={4} className="p-5 text-center text-slate-500">Données indisponibles pour cette période.</td></tr>}</tbody></table></div>
}
export function AlertConfig() {
 const [open,setOpen]=useState(false); const [saved,setSaved]=useState(false);
 return <><button onClick={()=>setOpen(v=>!v)} aria-expanded={open} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg border border-blue-200 px-3 text-sm font-bold text-blue-700 hover:bg-blue-50"><Pencil className="h-4 w-4"/>{open?"Fermer":"Modifier"}</button>{open&&<form id="alert-config" className="mt-3 space-y-3 rounded-lg bg-slate-50 p-3" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);localStorage.setItem("diveplan-cost-alert",JSON.stringify(Object.fromEntries(f)));setSaved(true);}}><p className="text-xs text-amber-800">Enregistrement local à ce navigateur seulement. Les notifications et règles serveur ne sont pas configurées.</p><label className="block text-xs font-semibold">Seuil quota (%)<input name="quota" type="number" min="1" max="100" defaultValue="80" className="mt-1 w-full rounded border p-2 text-sm"/></label><label className="block text-xs font-semibold">Variation inhabituelle (%)<input name="change" type="number" min="1" max="1000" defaultValue="25" className="mt-1 w-full rounded border p-2 text-sm"/></label><label className="block text-xs font-semibold">Service<select name="service" className="mt-1 w-full rounded border bg-white p-2 text-sm"><option>Tout service mesuré</option><option>Transfert navigateur</option><option>Résultats SQL</option></select></label><label className="flex items-center gap-2 text-xs"><input type="checkbox" name="active" defaultChecked/>Règle active</label><button className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white">Enregistrer dans ce navigateur</button>{saved&&<p role="status" className="text-xs text-emerald-700">Règle enregistrée localement.</p>}</form>}</>;
}
function fmt(n:number){return n?`${(n/1024**(Math.floor(Math.log(n)/Math.log(1024)))).toLocaleString("fr-CA",{maximumFractionDigits:1})} ${["octets","Ko","Mo","Go","To"][Math.min(4,Math.floor(Math.log(n)/Math.log(1024)))]}`:"0 octet"}




