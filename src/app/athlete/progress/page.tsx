import { redirect } from "next/navigation";
import { Clock3, Dumbbell, Waves } from "lucide-react";
import { ProgressChart } from "@/components/athlete/progress-chart";
import { TechniqueDetails } from "@/components/athlete/technique-details";
import { AthleteShell } from "@/components/athlete/athlete-shell";
import { getAthleteProgressTotals, getCurrentAthlete } from "@/lib/athlete-session";
import { AthletePageHeader } from "@/components/athlete/page-header";
import { resolveAvatarUrls } from "@/lib/avatar-storage";

export const dynamic = "force-dynamic";

export default async function AthleteProgressPage() {
  const athlete = await getCurrentAthlete();
  if (!athlete) {
    redirect("/login");
  }

  const totals = athlete ? await getAthleteProgressTotals(athlete.id) : null;
  const [avatarUrl] = await resolveAvatarUrls([athlete.user.avatar]);
  const sessions = totals?.thisWeekSessions ?? 0;
  const dives = totals?.thisWeekDiveRepetitions ?? 0;
  const minutes = totals?.thisWeekMinutes ?? 0;
  const technique = [
    { label: "Avant", color: "#08c9c7", icon: "waves" },
    { label: "Arriere", color: "#ff655c", icon: "activity" },
    { label: "Renverse", color: "#36a0ff", icon: "waves" },
    { label: "Retourne", color: "#9147ed", icon: "waves" },
    { label: "Vrille", color: "#08a9c5", icon: "goal" },
    { label: "Equilibre", color: "#edb52b", icon: "goal" }
  ] as const;
  const techniqueWithVolumes = technique.map((item) => ({ ...item, dives: totals?.skillData.find((entry) => entry.name === item.label)?.volume ?? 0 }));
  return (
    <AthleteShell>
      <AthletePageHeader title="Progression" avatarUrl={avatarUrl} initials={`${athlete.user.firstName[0]}${athlete.user.lastName[0]}`} />

      <section className="progress-card progress-summary">
        <div className="section-heading"><h2>Cette semaine</h2></div>
        <div className="summary-grid">
          <SummaryMetric icon={<Waves />} value={`${sessions} / 5`} label="séances" progress={Math.min(100, sessions * 20)} tone="blue" />
          <SummaryMetric icon={<Dumbbell />} value={String(dives)} label="plongeons" progress={Math.min(100, dives / 1.5)} tone="purple" />
          <SummaryMetric icon={<Clock3 />} value={`${Math.floor(minutes / 60)} h ${minutes % 60 ? `${minutes % 60}` : "00"}`} label="temps d’entraînement" progress={Math.min(100, minutes / 3)} tone="mint" />
        </div>
      </section>

      <section className="progress-card trend-card" id="tendance">
        <div className="section-heading"><div><h2>Volume de plongeons</h2><p>4 dernières semaines</p></div></div>
        <ProgressChart data={totals?.chartData ?? []} sessionData={totals?.sessionChartData ?? []} weeklyData={totals?.weeklyChartData ?? []} monthlyData={totals?.monthlyChartData ?? []} initialPeriod="week" lightTheme />
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
