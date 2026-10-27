"use client";

import { useMemo, useState } from "react";

export type DayPoint = { day: string; active: number; completed: number };
export type FunnelPoint = { label: string; count: number; percent: number | null; tone: string; dropoff: null };
export type FeatureStat = { feature: string; role: string; users: number };

export function ActivityChart({ points }: { points: DayPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const data = useMemo(() => points, [points]);
  const width = 620, height = 220, left = 34, top = 18, right = 12, bottom = 38;
  const max = Math.max(1, ...data.flatMap((point) => [point.active, point.completed]));
  const x = (index: number) => left + (data.length <= 1 ? (width-left-right)/2 : index*(width-left-right)/(data.length-1));
  const y = (value: number) => top + (height-top-bottom)*(1-value/max);
  const line = (key: "active" | "completed") => data.map((point,index)=>`${index ? "L" : "M"}${x(index)},${y(point[key])}`).join(" ");
  const date = (value: string) => new Date(value).toLocaleDateString("fr-CA", { day: "numeric", month: "short" });
  return <div className="w-full" role="group" aria-label="Graphique des utilisateurs actifs et des séances complétées par jour">
    {!data.length ? <div className="grid h-48 place-items-center text-sm text-slate-500">Aucune activité suivie sur la période.</div> : <><svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full overflow-visible" onMouseLeave={() => setHover(null)}>
      {[0, .25, .5, .75, 1].map((fraction) => { const yy=top+(height-top-bottom)*(1-fraction); return <g key={fraction}><line x1={left} x2={width-right} y1={yy} y2={yy} stroke="#e5edf6"/><text x={left-7} y={yy+4} textAnchor="end" fontSize="10" fill="#64748b">{Math.round(max*fraction)}</text></g>; })}
      <path d={`${line("active")} L${x(data.length-1)},${height-bottom} L${x(0)},${height-bottom} Z`} fill="#1976f3" opacity=".09"/><path d={line("active")} fill="none" stroke="#1769e8" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/>
      <path d={`${line("completed")} L${x(data.length-1)},${height-bottom} L${x(0)},${height-bottom} Z`} fill="#10a876" opacity=".1"/><path d={line("completed")} fill="none" stroke="#10a876" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/>
      {data.map((point,index)=><g key={point.day} onMouseEnter={()=>setHover(index)} onFocus={()=>setHover(index)} tabIndex={0} aria-label={`${date(point.day)} : ${point.active} utilisateurs actifs, ${point.completed} séances complétées`}><circle cx={x(index)} cy={y(point.active)} r="5" fill="white" stroke="#1769e8" strokeWidth="3"><title>{date(point.day)} · Utilisateurs actifs : {point.active}</title></circle><circle cx={x(index)} cy={y(point.completed)} r="5" fill="white" stroke="#10a876" strokeWidth="3"><title>{date(point.day)} · Séances complétées : {point.completed}</title></circle></g>)}
      {data.map((point,index)=>(index===0||index===data.length-1||index%Math.ceil(data.length/6)===0)?<text key={`label-${point.day}`} x={x(index)} y={height-8} textAnchor="middle" fontSize="10" fill="#64748b">{date(point.day)}</text>:null)}
      {hover !== null && data[hover] && <g pointerEvents="none"><rect x={Math.min(width-190,Math.max(left,x(hover)-82))} y={Math.max(2,top-5)} width="180" height="44" rx="7" fill="#0f2945"/><text x={Math.min(width-180,Math.max(left+10,x(hover)-72))} y={top+12} fontSize="10" fill="white">{date(data[hover].day)} · actifs {data[hover].active}</text><text x={Math.min(width-180,Math.max(left+10,x(hover)-72))} y={top+29} fontSize="10" fill="white">Séances complétées {data[hover].completed}</text></g>}
    </svg><div className="mt-1 flex justify-center gap-5 text-xs text-slate-600"><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-blue-600" />Utilisateurs actifs</span><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-emerald-600" />Séances complétées</span></div></>}
  </div>;
}
