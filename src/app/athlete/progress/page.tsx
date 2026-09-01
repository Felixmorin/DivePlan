import { redirect } from "next/navigation";
import { ProgressChart } from "@/components/athlete/progress-chart";
import { AthleteShell } from "@/components/athlete/athlete-shell";
import { Badge } from "@/components/ui/badge";
import { getAthleteProgressTotals, getCurrentAthlete } from "@/lib/athlete-session";

export const dynamic = "force-dynamic";

export default async function AthleteProgressPage() {
  const athlete = await getCurrentAthlete();
  if (!athlete) {
    redirect("/login");
  }

  const totals = athlete ? await getAthleteProgressTotals(athlete.id) : null;
  const metrics = totals
    ? [
        ["Entrainements", String(totals.completedSessions)],
        ["Plongeons", String(totals.totalDiveRepetitions)],
        ["Exercices", String(totals.completedExercises)],
        ["Temps", `${Math.round(totals.completedMinutes / 60)} h`],
        ["Plan complete", `${totals.completionRate}%`]
      ]
    : [
        ["Entrainements", "0"],
        ["Plongeons", "0"],
        ["Exercices", "0"],
        ["Temps", "0 h"],
        ["Plan complete", "0%"]
      ];

  return (
    <AthleteShell>
      <div className="mb-5 rounded-[var(--radius-panel)] border border-white/10 bg-[var(--color-athlete-panel)] p-5">
        <div className="flex items-center justify-between">
          <div><p className="text-xs font-bold uppercase text-[var(--color-brand)]">Progression</p><h1 className="mt-2 text-3xl font-black">Ready Score</h1></div>
          <div className="text-right"><div className="text-3xl font-black text-[var(--color-success)]">{totals?.readyScore ?? 0}</div><div className="text-xs font-semibold text-white/45">logs</div></div>
        </div>
        <p className="mt-4 text-sm leading-6 text-white/68">{totals?.recentNote ?? "Complete une seance pour generer une tendance."}</p>
      </div>
      <ProgressChart data={totals?.chartData ?? []} />
      <div className="mt-5 grid grid-cols-2 gap-3">{metrics.map(([label, value]) => <div key={label} className="rounded-2xl border border-white/10 bg-[var(--color-athlete-panel)] p-4"><div className="text-xs font-bold uppercase text-white/38">{label}</div><div className="mt-2 text-3xl font-black">{value}</div></div>)}</div>
      <div className="mt-5 flex flex-wrap gap-2">{(totals?.skillCategories.length ? totals.skillCategories : ["Avant", "Arriere", "Retour", "Renverse", "Vrille", "Equilibre"]).map((item) => <Badge key={item}>{item}</Badge>)}</div>
    </AthleteShell>
  );
}
