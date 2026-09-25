"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type ProgressChartProps = {
  data: Array<{ name: string; volume: number }>;
  sessionData?: Array<{ name: string; volume: number; finalRating: string | null }>;
  weeklyData?: Array<{ name: string; volume: number }>;
  monthlyData?: Array<{ name: string; volume: number }>;
};

export function ProgressChart({ data, sessionData = [], weeklyData = [], monthlyData = [] }: ProgressChartProps) {
  const [period, setPeriod] = useState<"day" | "week" | "month" | "session-rating">("day");
  const isSessionRating = period === "session-rating";
  const chartData = period === "week" ? weeklyData : period === "month" ? monthlyData : isSessionRating ? sessionData : data;

  return (
    <div>
      <div className="trend-chart-toolbar">
        <label htmlFor="trend-period">Afficher</label>
        <select id="trend-period" className="select-button" value={period} onChange={(event) => setPeriod(event.target.value as "day" | "week" | "month")}>
          <option value="day">Par jour</option>
          <option value="week">Moyenne / semaine</option>
          <option value="month">Moyenne / mois</option>
          <option value="session-rating">Volume + ressentie</option>
        </select>
      </div>
      <div className="progress-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 18, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgba(137,190,220,.12)" vertical={false} />
          <XAxis dataKey="name" stroke="#a3b6ca" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis stroke="#a3b6ca" fontSize={11} tickLine={false} axisLine={false} width={24} />
          <Tooltip cursor={{ fill: "rgba(255,255,255,.05)" }} contentStyle={{ background: "#0a1830", border: "1px solid rgba(255,255,255,.12)", borderRadius: 8, color: "white" }} />
          <Bar dataKey="volume" fill="#ed163d" radius={[7, 7, 2, 2]}>
            {isSessionRating ? (
              <LabelList dataKey="finalRating" position="center" fill="#ffffff" fontSize={11} fontWeight={700} />
            ) : (
              <LabelList dataKey="volume" position="top" fill="#e8f2fb" fontSize={12} />
            )}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}
