"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";

const periods = [{ value: "6h", label: "Dernières 6 h" }, { value: "24h", label: "Dernières 24 h" }, { value: "7d", label: "7 derniers jours" }, { value: "30d", label: "30 derniers jours" }];
const aggregations = [{ value: "hour", label: "Agrégation horaire" }, { value: "day", label: "Agrégation quotidienne" }];

export function DatabaseFilters({ period, aggregation, updatedAt }: { period: string; aggregation: string; updatedAt: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectClass = "h-10 max-w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-600 sm:text-sm";
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set(key, value);
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };
  return <div className="flex flex-wrap items-center gap-2">
    <label className="sr-only" htmlFor="db-period">Période</label>
    <select id="db-period" className={selectClass} value={period} onChange={(event) => update("period", event.target.value)}>{periods.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
    <label className="sr-only" htmlFor="db-aggregation">Agrégation du graphique</label>
    <select id="db-aggregation" className={selectClass} value={aggregation} onChange={(event) => update("aggregation", event.target.value)}>{aggregations.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
    <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] font-medium text-slate-500" title={`Dernière mesure : ${updatedAt}`}><span className="h-2 w-2 rounded-full bg-blue-600" />{updatedAt}</span>
    <button type="button" onClick={() => router.refresh()} aria-label="Actualiser les mesures de la base de données" title="Actualiser" className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"><RefreshCw className="h-4 w-4" /></button>
  </div>;
}
