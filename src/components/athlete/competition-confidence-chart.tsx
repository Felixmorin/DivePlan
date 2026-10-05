"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type CompetitionConfidencePoint = {
  competitionDiveId: string;
  code: string;
  height: "ONE_METER" | "THREE_METER" | "PLATFORM" | "CUSTOM";
  rating: number;
  evaluatedAt: string;
  evaluator: "ATHLETE" | "COACH";
};

const heights = [
  { value: "ONE_METER", label: "1 m" },
  { value: "THREE_METER", label: "3 m" },
  { value: "PLATFORM", label: "Plateforme" },
  { value: "CUSTOM", label: "Autre" }
] as const;
const colors = ["#0891b2", "#e11d48", "#7c3aed", "#16a34a", "#d97706", "#2563eb", "#db2777", "#475569", "#65a30d", "#9333ea"];

export function CompetitionConfidenceChart({ data, initialDiveId, athleteView = false }: { data: CompetitionConfidencePoint[]; initialDiveId?: string; athleteView?: boolean }) {
  const [height, setHeight] = useState("ALL");
  const [diveId, setDiveId] = useState(initialDiveId ?? "ALL");
  const [author, setAuthor] = useState("ALL");
  const matchingHeight = height === "ALL" ? data : data.filter((item) => item.height === height);
  const dives = Array.from(new Map(matchingHeight.map((item) => [item.competitionDiveId, { id: item.competitionDiveId, code: item.code, height: item.height }])).values());
  const selectedDive = dives.some((dive) => dive.id === diveId) ? diveId : "ALL";
  const visibleDiveIds = selectedDive === "ALL" ? dives.map((dive) => dive.id) : [selectedDive];
  const visiblePoints = data.filter((point) => (height === "ALL" || point.height === height) && visibleDiveIds.includes(point.competitionDiveId) && (athleteView || author === "ALL" || point.evaluator === author));
  const series = Array.from(new Map(visiblePoints.map((point) => [`${point.evaluator}:${point.competitionDiveId}`, {
    key: `${point.evaluator}:${point.competitionDiveId}`,
    diveId: point.competitionDiveId,
    code: point.code,
    evaluator: point.evaluator,
    label: `${point.code} · ${point.evaluator === "COACH" ? "Coach" : "Athlète"}`
  }])).values());
  const chartData = useMemo(() => {
    const byDate = new Map<string, Record<string, string | number>>();
    for (const item of visiblePoints) {
      const time = new Date(item.evaluatedAt).getTime();
      const row = byDate.get(String(time)) ?? {
        time,
        date: new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short", year: "2-digit" }).format(new Date(time))
      };
      row[`${item.evaluator}:${item.competitionDiveId}`] = item.rating;
      byDate.set(String(time), row);
    }
    return Array.from(byDate.values()).sort((a, b) => Number(a.time) - Number(b.time));
  }, [visiblePoints]);

  return (
    <Card className={athleteView ? "border-cyan-200/15 bg-[#0b1e30] text-white" : ""}>
      <CardHeader><CardTitle>{athleteView ? "Évolution de ma confiance" : "Évolution de la confiance en compétition"}</CardTitle></CardHeader>
      <CardContent>
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold text-current/65">Hauteur
            <select aria-label="Filtrer par hauteur" value={height} onChange={(event) => { setHeight(event.target.value); setDiveId("ALL"); }} className="mt-1 h-10 w-full rounded-lg border border-current/15 bg-transparent px-3 text-sm text-current">
              <option value="ALL">Toutes les hauteurs</option>
              {heights.filter((item) => data.some((point) => point.height === item.value)).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-current/65">Plongeon
            <select aria-label="Filtrer par plongeon" value={selectedDive} onChange={(event) => setDiveId(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-current/15 bg-transparent px-3 text-sm text-current">
              <option value="ALL">Tous les plongeons</option>
              {dives.map((item) => <option key={item.id} value={item.id}>{item.code} · {heights.find((heightOption) => heightOption.value === item.height)?.label ?? item.height}</option>)}
            </select>
          </label>
          {!athleteView && <label className="text-xs font-bold text-current/65 sm:col-span-2">Évaluateur
            <select aria-label="Filtrer par évaluateur" value={author} onChange={(event) => setAuthor(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-current/15 bg-transparent px-3 text-sm text-current">
              <option value="ALL">Athlète et coach</option><option value="ATHLETE">Athlète</option><option value="COACH">Coach</option>
            </select>
          </label>}
        </div>
        {chartData.length === 0 ? <p className="py-10 text-center text-sm font-semibold text-current/55">Aucune évaluation enregistrée pour ce filtre.</p> : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 12, right: 16, left: 8, bottom: 18 }}>
                <CartesianGrid stroke="rgba(137,160,180,.2)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} label={{ value: "Date d’évaluation", position: "insideBottom", offset: -12, fontSize: 11 }} />
                <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} allowDecimals={false} width={34} label={{ value: "Note (0 à 5)", angle: -90, position: "insideLeft", fontSize: 11 }} />
                <Tooltip formatter={(value, name) => [value, series.find((item) => item.key === name)?.label ?? name]} labelFormatter={(label) => `Évaluation · ${label}`} />
                {series.map((item) => <Line key={item.key} type="linear" dataKey={item.key} name={item.label} stroke={colors[dives.findIndex((dive) => dive.id === item.diveId) % colors.length]} strokeWidth={2.5} strokeDasharray={item.evaluator === "COACH" ? "6 4" : undefined} connectNulls dot={{ r: 4 }} activeDot={{ r: 6 }} />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">{series.map((item) => <span key={item.key} className="inline-flex items-center gap-2 text-xs font-bold text-current/70"><i className={`h-2.5 w-2.5 rounded-full ${item.evaluator === "COACH" ? "border border-current bg-transparent" : ""}`} style={{ color: colors[dives.findIndex((dive) => dive.id === item.diveId)], backgroundColor: item.evaluator === "COACH" ? "transparent" : colors[dives.findIndex((dive) => dive.id === item.diveId)] }} />{item.label}</span>)}</div>
      </CardContent>
    </Card>
  );
}
