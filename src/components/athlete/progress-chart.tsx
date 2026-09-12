"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type ProgressChartProps = {
  data: Array<{ name: string; volume: number }>;
};

export function ProgressChart({ data }: ProgressChartProps) {
  return (
    <div className="progress-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid stroke="rgba(137,190,220,.12)" vertical={false} />
          <XAxis dataKey="name" stroke="#a3b6ca" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis stroke="#a3b6ca" fontSize={11} tickLine={false} axisLine={false} width={24} />
          <Tooltip cursor={{ fill: "rgba(255,255,255,.05)" }} contentStyle={{ background: "#0a1830", border: "1px solid rgba(255,255,255,.12)", borderRadius: 8, color: "white" }} />
          <Bar dataKey="volume" fill="#27cce5" radius={[7, 7, 2, 2]}>
            <LabelList dataKey="volume" position="top" fill="#e8f2fb" fontSize={12} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
