import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BarChart3, Check, ChevronRight, Clock3, Dumbbell, History, ListChecks, Play, UserRound, Waves } from "lucide-react";
import { AthleteShell } from "@/components/athlete/athlete-shell";
import { BlockTypeBadge } from "@/components/training/block-type-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getAssignedReadySession, getAthleteProgressTotals, getAthleteRecentCompletions, getCurrentAthlete } from "@/lib/athlete-session";
import { formatMontrealDate, formatMontrealTime } from "@/lib/timezone";
import { isSessionStartAvailable } from "@/lib/session-availability";

export const dynamic = "force-dynamic";

export default async function AthleteTodayPage() {
  const athlete = await getCurrentAthlete();
  if (!athlete) redirect("/login");

  const [readySession, progressTotals, recentCompletions] = await Promise.all([
    getAssignedReadySession(athlete.id),
    getAthleteProgressTotals(athlete.id),
    getAthleteRecentCompletions(athlete.id)
  ]);

  const sessionDate = readySession ? new Date(readySession.date) : null;
  const sessionHref = readySession ? `/athlete/session/${readySession.id}` : null;
  const completionStatus = readySession?.completions[0]?.status ?? "NOT_STARTED";
  const canStart = sessionDate ? isSessionStartAvailable(sessionDate) : false;
  const blocks = readySession?.blocks ?? [];
  const totalVolume = blocks.reduce((sum, block) => sum + block.estimatedVolume, 0);
  const blockTypes = Array.from(new Set(blocks.map((block) => block.type)));
  const sessionTime = sessionDate ? formatMontrealTime(sessionDate) : "--:--";
  const sessionDateLabel = sessionDate ? formatMontrealDate(sessionDate, { weekday: "short", day: "numeric", month: "short" }) : "À venir";
  const latestCompletion = recentCompletions[0];

  return (
    <AthleteShell>
      <header className="athlete-header">
        <div>
          <h1>Salut {athlete.user.firstName} <span aria-hidden="true">👋</span></h1>
          <p>Ton entraînement est prêt.</p>
        </div>
      </header>

      <section className="today-card" aria-labelledby="today-title">
        <div className="today-card-content">
          <span className="today-badge">Aujourd&apos;hui</span>
          <h2 id="today-title">{readySession?.title ?? "Aucune séance planifiée"}</h2>
          {readySession ? (
            <div className="session-facts">
              <span><Clock3 /> {sessionTime}</span>
              <span><Waves /> {readySession.duration} min</span>
              <span><ListChecks /> {blockTypes.map((type) => <BlockTypeBadge key={type} type={type.toLowerCase()} />)}</span>
            </div>
          ) : <p className="today-empty-copy">Ton coach n&apos;a pas encore publié de séance à venir.</p>}
        </div>
        {readySession && sessionHref ? (
          <Button asChild size="lg" variant="action" className="today-cta">
            <Link href={sessionHref}>
              {completionStatus === "IN_PROGRESS" ? <History /> : canStart ? <Play className="fill-current" /> : <ListChecks />}
              {completionStatus === "IN_PROGRESS" ? "Continuer la séance" : canStart ? "Commencer la séance" : "Voir l’aperçu"}
              <ArrowRight className="ml-auto" />
            </Link>
          </Button>
        ) : <EmptyState className="today-empty" title="Aucune séance" description="Reviens quand ton coach aura publié la prochaine séance." />}
      </section>

      <SectionHeading title="Ma semaine" href="/athlete/week" linkLabel="Voir la semaine" />
      <section className="week-card" aria-label="Résumé de la semaine">
        <WeekMetric value={`${progressTotals.completedSessions} / 5`} label="séances complétées" tone="blue" progress={Math.min(100, progressTotals.completedSessions / 5 * 100)} />
        <WeekMetric value={`${Math.floor(progressTotals.completedMinutes / 60)} h`} suffix={` / ${Math.ceil(progressTotals.completedMinutes / 60) || 7} h`} label="temps d’entraînement" tone="purple" progress={Math.min(100, progressTotals.completedMinutes / 420 * 100)} />
        <WeekMetric value={progressTotals.totalDiveRepetitions} label="plongeons" tone="mint" progress={Math.min(100, progressTotals.totalDiveRepetitions / 180 * 100)} />
      </section>

      <SectionHeading title="À venir" href="/athlete/calendar" linkLabel="Voir tout" />
      <section className="schedule-card">
        {readySession ? (
          <ScheduleRow date={sessionDateLabel} icon={<Waves />} title={readySession.title} details={`${sessionTime}  ·  ${readySession.duration} min  ·  ${totalVolume || "—"} plongeons`} meta={readySession.focus} href={sessionHref ?? "/athlete"} />
        ) : <EmptyState className="border-0 bg-transparent p-4" title="Rien de prévu" description="Les prochaines séances apparaîtront ici." />}
      </section>

      <SectionHeading title="Dernière séance" href="/athlete/week" linkLabel="Voir le résumé" />
      <section className="latest-card">
        {latestCompletion ? (
          <ScheduleRow date={latestCompletion.completedAt ? formatMontrealDate(new Date(latestCompletion.completedAt), { weekday: "short", day: "numeric", month: "short" }) : "Récente"} icon={<Dumbbell />} title={latestCompletion.title} details={`${latestCompletion.duration} min  ·  ${latestCompletion.focus}`} meta={latestCompletion.status === "COMPLETED" ? "Séance complétée" : "Séance en cours"} href="/athlete/week" status={latestCompletion.status === "COMPLETED"} />
        ) : <EmptyState className="border-0 bg-transparent p-4" title="Aucun historique" description="Tes séances terminées apparaîtront ici." />}
      </section>

      <SectionHeading title="Accès rapides" />
      <div className="quick-links">
        <QuickLink href="/athlete/progress" icon={<BarChart3 />} label="Mes objectifs" />
        <QuickLink href="/athlete/skills" icon={<Waves />} label="Mes plongeons" />
        <QuickLink href="/athlete/profile" icon={<UserRound />} label="Mon profil" />
      </div>
    </AthleteShell>
  );
}

function SectionHeading({ title, href, linkLabel }: { title: string; href?: string; linkLabel?: string }) {
  return <div className="section-heading"><h2>{title}</h2>{href && <Link href={href}>{linkLabel} <ArrowRight /></Link>}</div>;
}

function WeekMetric({ value, suffix, label, tone, progress }: { value: string | number; suffix?: string; label: string; tone: "blue" | "purple" | "mint"; progress: number }) {
  return <div className="week-metric"><strong>{value}<small>{suffix}</small></strong><span>{label}</span><i className={`metric-progress ${tone}`} style={{ width: `${progress}%` }} /></div>;
}

function ScheduleRow({ date, icon, title, details, meta, href, status }: { date: string; icon: React.ReactNode; title: string; details: string; meta: string; href: string; status?: boolean }) {
  return <Link href={href} className="schedule-row"><span className="schedule-date">{date}</span><span className="schedule-icon">{icon}</span><span className="schedule-copy"><strong>{title}</strong><span>{details}</span><em>{meta}</em></span>{status ? <span className="completed-pill"><Check /> Complétée</span> : <ChevronRight className="row-arrow" />}</Link>;
}

function QuickLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return <Link href={href} className="quick-link"><span>{icon}</span>{label}<ChevronRight /></Link>;
}
