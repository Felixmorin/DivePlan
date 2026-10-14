"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type ProgressChartProps = {
  data: Array<{ name: string; volume: number }>;
  sessionData?: Array<{ name: string; volume: number; finalRating: string | null }>;
  weeklyData?: Array<{ name: string; volume: number }>;
  monthlyData?: Array<{ name: string; volume: number }>;
  dailyFamilyData?: Array<{ name: string; volume: number; familyVolumes: Record<string, number> }>;
  initialPeriod?: "day" | "week" | "month" | "session-rating";
  lightTheme?: boolean;
};

export function ProgressChart({ data, sessionData = [], weeklyData = [], monthlyData = [], dailyFamilyData = [], initialPeriod = "day", lightTheme = false }: ProgressChartProps) {
  const [period, setPeriod] = useState<"day" | "week" | "month" | "session-rating">(initialPeriod);
  const isSessionRating = period === "session-rating";
  const chartData = period === "week" ? weeklyData : period === "month" ? monthlyData : isSessionRating ? sessionData : period === "day" && lightTheme && dailyFamilyData.length ? dailyFamilyData : data;
  const showFamilyStack = period === "day" && lightTheme && dailyFamilyData.length > 0;
  const familySeries = [
    { key: "Avant", color: "#09c5c4" },
    { key: "Arriere", color: "#ff625c" },
    { key: "Renverse", color: "#399af2" },
    { key: "Retourne", color: "#9252e8" },
    { key: "Vrille", color: "#00a9c6" },
    { key: "Equilibre", color: "#f0b82f" }
  ];

  return (
    <div>
      <div className="trend-chart-toolbar">
        <label htmlFor="trend-period">Afficher</label>
        <select id="trend-period" className="select-button" value={period} onChange={(event) => setPeriod(event.target.value as "day" | "week" | "month" | "session-rating")}>
          <option value="day">Par jour</option>
          <option value="week">Moyenne / semaine</option>
          <option value="month">Moyenne / mois</option>
          <option value="session-rating">Volume + ressentie</option>
        </select>
      </div>
      <div className="progress-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 18, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={lightTheme ? "#e3edf6" : "rgba(137,190,220,.12)"} vertical={false} />
          <XAxis dataKey="name" stroke={lightTheme ? "#607492" : "#a3b6ca"} fontSize={11} tickLine={false} axisLine={false} />
          <YAxis stroke={lightTheme ? "#607492" : "#a3b6ca"} fontSize={11} tickLine={false} axisLine={false} width={24} />
          <Tooltip cursor={{ fill: lightTheme ? "#eef6fd" : "rgba(255,255,255,.05)" }} contentStyle={{ background: lightTheme ? "#fff" : "#0a1830", border: `1px solid ${lightTheme ? "#dce8f3" : "rgba(255,255,255,.12)"}`, borderRadius: 8, color: lightTheme ? "#102451" : "white" }} />
          {showFamilyStack ? familySeries.map(({ key, color }) => <Bar key={key} dataKey={(entry: { familyVolumes?: Record<string, number> }) => entry.familyVolumes?.[key] ?? 0} name={key} stackId="family-volume" fill={color} radius={key === familySeries[familySeries.length - 1].key ? [7, 7, 0, 0] : [0, 0, 0, 0]} />) : <Bar dataKey="volume" fill={lightTheme ? "#50a8f8" : "#ed163d"} radius={[7, 7, 2, 2]}>
            {isSessionRating ? (
              <LabelList dataKey="finalRating" position="center" fill="#ffffff" fontSize={11} fontWeight={700} />
            ) : (
              <LabelList dataKey="volume" position="top" fill={lightTheme ? "#102451" : "#e8f2fb"} fontSize={12} />
            )}
          </Bar>}
        </BarChart>
      </ResponsiveContainer>
      </div>
      {showFamilyStack && <div className="family-chart-legend" aria-label="Familles de plongeons dans le graphique">
        {familySeries.map(({ key, color }) => <span key={key}><i style={{ backgroundColor: color }} />{key}</span>)}
      </div>}
    </div>
  );
}
