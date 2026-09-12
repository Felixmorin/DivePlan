import { redirect } from "next/navigation";
import { Activity, ChevronDown, Clock3, Dumbbell, Goal, Waves } from "lucide-react";
import { ProgressChart } from "@/components/athlete/progress-chart";
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
  const completion = totals?.completionRate ?? 0;
  const readyScore = totals?.readyScore ?? 0;
  const technique = [
    { label: "Avant", dives: Math.round(dives * 0.72), color: "#26dfc2", icon: Waves },
    { label: "Arrière", dives: Math.round(dives * 0.58), color: "#25bde9", icon: Activity },
    { label: "Retourné", dives: Math.round(dives * 0.46), color: "#9272f2", icon: Waves },
    { label: "Vrilles", dives: Math.round(dives * 0.68), color: "#a069f1", icon: Goal }
  ];
  const maxTechniqueDives = Math.max(...technique.map((item) => item.dives), 1);

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
        <div className="section-heading"><span className="section-icon mint"><Activity size={22} /></span><div><h2>Tendance</h2><p>Volume d’entraînement sur les 6 derniers jours</p></div><button className="select-button" type="button">Plongeons <ChevronDown size={16} /></button></div>
        <ProgressChart data={totals?.chartData ?? []} />
      </section>

      <section className="progress-card technique-card">
        <div className="section-heading"><span className="section-icon cyan"><Goal size={22} /></span><h2>Travail technique</h2><a href="#technique">Voir détails <span>→</span></a></div>
        <div className="technique-list" id="technique">{technique.map(({ label, dives: techniqueDives, color, icon: Icon }) => <div className="technique-row" key={label}><Icon size={22} style={{ color }} /><span>{label}</span><div className="technique-track"><i style={{ width: `${Math.round((techniqueDives / maxTechniqueDives) * 100)}%`, background: color }} /></div><b>{techniqueDives}</b></div>)}</div>
      </section>
    </AthleteShell>
  );
}

function SummaryMetric({ icon, value, label, progress, tone }: { icon: React.ReactNode; value: string; label: string; progress: number; tone: string }) {
  return <div className="summary-metric"><span className={`metric-icon ${tone}`}>{icon}</span><strong>{value}</strong><span className="metric-label">{label}</span><div className="metric-track"><i className={tone} style={{ width: `${progress}%` }} /></div></div>;
}
