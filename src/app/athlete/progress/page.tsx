import { redirect } from "next/navigation";
import { Activity, Clock3, Dumbbell, Goal, Waves } from "lucide-react";
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
  const readyScore = totals?.readyScore ?? 0;
  const technique = [
    { label: "Avant", color: "#26dfc2", icon: Waves },
    { label: "Arriere", color: "#25bde9", icon: Activity },
    { label: "Retour", color: "#9272f2", icon: Waves },
    { label: "Renverse", color: "#a069f1", icon: Waves },
    { label: "Vrille", color: "#a069f1", icon: Goal },
    { label: "Equilibre", color: "#26dfc2", icon: Goal }
  ].map((item) => ({ ...item, dives: totals?.skillData.find((entry) => entry.name === item.label)?.volume ?? 0 }));
  return (
    <AthleteShell>
      <div className="progress-head">
        <div>
          <h1>Progression</h1>
          <p>Vois ton évolution.</p>
        </div>
        <div className="progress-ring" style={{ "--progress": `${readyScore}%` } as React.CSSProperties}>
          <span>{readyScore}%</span>
          <small>Cette semaine</small>
        </div>
      </div>

      <div className="progress-tabs" aria-label="Période de progression">
        <button className="active" type="button">Semaine</button>
        <button type="button">Mois</button>
        <button type="button">Saison</button>
      </div>

      <section className="progress-card progress-summary">
        <div className="section-heading"><span className="section-icon cyan"><Activity size={21} /><span /></span><h2>Résumé de la semaine</h2><a href="#tendance">Voir détails <span>→</span></a></div>
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
        <TechniqueDetails technique={technique} skillDives={totals?.skillDives ?? []} />
      </section>
    </AthleteShell>
  );
}

function SummaryMetric({ icon, value, label, progress, tone }: { icon: React.ReactNode; value: string; label: string; progress: number; tone: string }) {
  return <div className="summary-metric"><span className={`metric-icon ${tone}`}>{icon}</span><strong>{value}</strong><span className="metric-label">{label}</span><div className="metric-track"><i className={tone} style={{ width: `${progress}%` }} /></div></div>;
}
