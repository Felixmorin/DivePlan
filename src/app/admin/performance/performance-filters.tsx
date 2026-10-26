"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";

const periods = [{ value: "6h", label: "Dernières 6 h" }, { value: "12h", label: "Dernières 12 h" }, { value: "24h", label: "Dernières 24 h" }, { value: "72h", label: "3 derniers jours" }, { value: "7d", label: "7 derniers jours" }];
const metrics = [{ value: "LCP", label: "LCP" }, { value: "INP", label: "INP" }, { value: "CLS", label: "CLS" }];

export function PerformanceFilters({ routes, updatedAt }: { routes: string[]; updatedAt: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = new URLSearchParams(searchParams.toString());
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value); else next.delete(key);
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };
  const selectClass = "h-10 max-w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-600 sm:text-sm";
  return <div className="flex flex-wrap items-center gap-2">
    <label className="sr-only" htmlFor="perf-period">Période de mesure</label>
    <select id="perf-period" className={selectClass} value={params.get("period") ?? "24h"} onChange={(event) => update("period", event.target.value)}>{periods.map((period) => <option key={period.value} value={period.value}>{period.label}</option>)}</select>
    <label className="sr-only" htmlFor="perf-route">Filtrer par route</label>
    <select id="perf-route" className={`${selectClass} max-w-48`} value={params.get("route") ?? ""} onChange={(event) => update("route", event.target.value)}><option value="">Toutes les routes</option>{routes.map((route) => <option key={route} value={route}>{route}</option>)}</select>
    <label className="sr-only" htmlFor="perf-device">Filtrer par appareil</label>
    <select id="perf-device" className={`${selectClass} opacity-70`} value="" disabled title="La dimension appareil n’est pas collectée"><option value="">Appareils · non mesurés</option></select>
    <label className="sr-only" htmlFor="perf-browser">Filtrer par navigateur</label>
    <select id="perf-browser" className={`${selectClass} opacity-70`} value="" disabled title="La dimension navigateur n’est pas collectée"><option value="">Navigateurs · non mesurés</option></select>
    <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] font-medium text-slate-500" title={`Dernière mesure : ${updatedAt}`}><span className="h-2 w-2 rounded-full bg-emerald-500" />Mis à jour · {updatedAt}</span>
    <button type="button" onClick={() => router.refresh()} aria-label="Actualiser les mesures de performance" title="Actualiser" className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"><RefreshCw className="h-4 w-4" /></button>
  </div>;
}

export function MetricSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = new URLSearchParams(searchParams.toString());
  const value = params.get("metric") ?? "LCP";
  return <div className="flex items-center gap-2"><label htmlFor="perf-metric" className="sr-only">Métrique du graphique temporel</label><select id="perf-metric" value={value} onChange={(event) => { const next = new URLSearchParams(searchParams.toString()); next.set("metric", event.target.value); router.push(`${pathname}?${next.toString()}`, { scroll: false }); }} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">{metrics.map((metric) => <option key={metric.value} value={metric.value}>{metric.label}</option>)}</select></div>;
}
