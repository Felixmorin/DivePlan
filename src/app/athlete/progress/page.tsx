import { redirect } from "next/navigation";
import { Activity, Clock3, Dumbbell, Waves } from "lucide-react";
import { ProgressChart } from "@/components/athlete/progress-chart";
import { TechniqueDetails } from "@/components/athlete/technique-details";
import { AthleteShell } from "@/components/athlete/athlete-shell";
import { getAthleteProgressTotals, getCurrentAthlete } from "@/lib/athlete-session";

export const dynamic = "force-dynamic";

export default async function AthleteProgressPage() {
  const athlete = await getCurrentAthlete();
  if (!athlete) {
    redirect("/login");
  }

  const totals = athlete ? await getAthleteProgressTotals(athlete.id) : null;
  const sessions = totals?.completedSessions ?? 0;
  const dives = totals?.totalDiveRepetitions ?? 0;
  const minutes = totals?.completedMinutes ?? 0;
  const technique = [
    { label: "Avant", color: "#ed163d", icon: "waves" },
    { label: "Arriere", color: "#ff4b68", icon: "activity" },
    { label: "Retour", color: "#bd0d2d", icon: "waves" },
    { label: "Renverse", color: "#ff6b83", icon: "waves" },
    { label: "Vrille", color: "#bd0d2d", icon: "goal" },
    { label: "Equilibre", color: "#ed163d", icon: "goal" }
  ] as const;
  const techniqueWithVolumes = technique.map((item) => ({ ...item, dives: totals?.skillData.find((entry) => entry.name === item.label)?.volume ?? 0 }));
  return (
    <AthleteShell>
      <div className="progress-head">
        <div>
          <h1>Progression</h1>
        </div>
      </div>

      <div className="progress-tabs" aria-label="Période de progression">
        <button className="active" type="button">Semaine</button>
        <button type="button">Mois</button>
        <button type="button">Saison</button>
      </div>

      <section className="progress-card progress-summary">
        <div className="section-heading"><span className="section-icon cyan"><Activity size={21} /><span /></span><h2>Résumé de la semaine</h2></div>
        <div className="summary-grid">
          <SummaryMetric icon={<Waves />} value={`${sessions} / 5`} label="séances" progress={Math.min(100, sessions * 20)} tone="blue" />
          <SummaryMetric icon={<Dumbbell />} value={String(dives)} label="plongeons" progress={Math.min(100, dives / 1.5)} tone="purple" />
          <SummaryMetric icon={<Clock3 />} value={`${Math.floor(minutes / 60)} h ${minutes % 60 ? `${minutes % 60}` : "00"}`} label="temps d’entraînement" progress={Math.min(100, minutes / 3)} tone="mint" />
        </div>
      </section>

      <section className="progress-card trend-card" id="tendance">
        <div className="section-heading"><span className="section-icon mint"><Activity size={22} /></span><div><h2>Tendance</h2><p>Volume d’entraînement dans le temps</p></div></div>
        <ProgressChart data={totals?.chartData ?? []} weeklyData={totals?.weeklyChartData ?? []} monthlyData={totals?.monthlyChartData ?? []} />
      </section>

      <section className="progress-card technique-card">
        <TechniqueDetails technique={techniqueWithVolumes} skillDives={totals?.skillDives ?? []} />
      </section>
    </AthleteShell>
  );
}

function SummaryMetric({ icon, value, label, progress, tone }: { icon: React.ReactNode; value: string; label: string; progress: number; tone: string }) {
  return <div className="summary-metric"><span className={`metric-icon ${tone}`}>{icon}</span><strong>{value}</strong><span className="metric-label">{label}</span><div className="metric-track"><i className={tone} style={{ width: `${progress}%` }} /></div></div>;
}
