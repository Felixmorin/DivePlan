import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, CheckCircle2, Clock3, History, Play, RotateCcw, UserRound, Waves } from "lucide-react";
import { AthleteShell } from "@/components/athlete/athlete-shell";
import { BlockTypeBadge } from "@/components/training/block-type-badge";
import { ProgressRing } from "@/components/training/progress-ring";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getAssignedReadySession, getAthleteProgressTotals, getAthleteRecentCompletions, getCurrentAthlete } from "@/lib/athlete-session";
import { formatMontrealDate, formatMontrealTime } from "@/lib/timezone";

export const dynamic = "force-dynamic";

export default async function AthleteTodayPage() {
  const athlete = await getCurrentAthlete();
  if (!athlete) {
    redirect("/login");
  }

  const [readySession, progressTotals, recentCompletions] = await Promise.all([
    getAssignedReadySession(athlete.id),
    getAthleteProgressTotals(athlete.id),
    getAthleteRecentCompletions(athlete.id)
  ]);
  const blocks = readySession
    ? readySession.blocks.map((block) => ({
        id: block.id,
        title: block.title,
        type: block.type.toLowerCase(),
        duration: block.duration,
        volume: block.estimatedVolume
      }))
    : [];
  const completionStatus = readySession?.completions[0]?.status ?? "NOT_STARTED";
  const started = completionStatus === "IN_PROGRESS";
  const sessionHref = readySession ? `/athlete/session/${readySession.id}` : null;
  const sessionTitle = readySession?.title ?? "Aucune séance planifiée";
  const sessionFocus = readySession?.focus ?? "Ton coach n'a pas encore publié de séance à venir.";
  const sessionDuration = readySession?.duration ?? 0;
  const sessionDate = readySession ? new Date(readySession.date) : null;
  const sessionTime = sessionDate ? formatMontrealTime(sessionDate) : "--:--";
  const coachName = readySession?.coach?.user ? `${readySession.coach.user.firstName} ${readySession.coach.user.lastName}` : "Coach";
  const blockTypes = Array.from(new Set(blocks.map((block) => block.type)));
  const totalVolume = blocks.reduce((sum, block) => sum + block.volume, 0);

  return (
    <AthleteShell>
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-3xl font-black leading-none">Salut {athlete.user.firstName}</h1>
          <p className="mt-1 text-sm font-bold text-white/50">Ton entrainement est pret.</p>
        </div>
        <ProgressRing value={progressTotals.completionRate} label="semaine" size={64} className="shrink-0 text-white" />
      </header>

      <section className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-[var(--color-athlete-panel)] shadow-[0_20px_60px_rgba(0,0,0,0.28)]">
        <div className="border-b border-white/10 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-white text-[var(--color-navy)]">Aujourd&apos;hui</Badge>
            <span className="inline-flex items-center gap-1 rounded-full bg-white/8 px-2.5 py-1 text-xs font-black text-white/70"><Clock3 className="h-3.5 w-3.5" /> {sessionTime}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-white/8 px-2.5 py-1 text-xs font-black text-white/70"><CalendarDays className="h-3.5 w-3.5" /> ~{sessionDuration} min</span>
          </div>
          <h2 className="mt-5 text-4xl font-black leading-none tracking-normal">{sessionTitle}</h2>
          <p className="mt-3 text-sm font-semibold leading-6 text-white/70">{sessionFocus}</p>
          <div className="mt-4 flex items-center gap-2 text-sm font-bold text-white/55"><UserRound className="h-4 w-4" /> {coachName}</div>
        </div>

        <div className="grid grid-cols-3 border-b border-white/10">
          <Metric icon={Waves} label="Plongeons" value={totalVolume} />
          <Metric icon={CheckCircle2} label="Completees" value={progressTotals.completedSessions} />
          <Metric icon={History} label="Recent" value={recentCompletions.length} />
        </div>

        <div className="p-5">
          <div className="mb-5 flex flex-wrap gap-2">{blockTypes.map((type) => <BlockTypeBadge key={type} type={type} />)}</div>
          {sessionHref ? (
            <Button asChild size="lg" variant="action" className="h-16 w-full rounded-2xl text-base">
              <Link href={sessionHref}>{started ? <RotateCcw className="h-5 w-5" /> : <Play className="h-5 w-5 fill-current" />} {started ? "Continuer" : "Commencer la séance"}</Link>
            </Button>
          ) : (
            <EmptyState className="border-white/10 bg-white/6" title="Aucune séance" description="Reviens quand ton coach aura publié la prochaine séance." />
          )}
        </div>
      </section>

      <section className="mt-5">
        <h3 className="mb-3 text-lg font-black">Semaine</h3>
        <div className="grid grid-cols-3 gap-2">
        <SmallStat label="Plan" value={`${progressTotals.completionRate}%`} />
        <SmallStat label="Temps" value={`${Math.round(progressTotals.completedMinutes / 60)} h`} />
        <SmallStat label="Exos" value={progressTotals.completedExercises} />
        </div>
      </section>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-black">Blocs</h3>
          <span className="text-sm font-bold text-white/55">{blocks.length}</span>
        </div>
        <div className="space-y-3">
          {blocks.map((block, index) => (
            <div key={block.id} className="grid min-w-0 grid-cols-[32px_1fr] gap-3 rounded-2xl border border-white/10 bg-[var(--color-athlete-panel)] p-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--color-athlete-panel-2)] text-xs font-black text-white/72">{index + 1}</div>
              <div className="min-w-0">
                <div className="truncate font-black">{block.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-white/55">
                  <span>{block.duration} min</span>
                  {block.volume > 0 && <span>{block.volume} reps</span>}
                  <BlockTypeBadge type={block.type} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h3 className="mb-3 text-lg font-black">Historique recent</h3>
        <div className="space-y-3">
          {recentCompletions.map((completion) => (
            <div key={completion.sessionId} className="rounded-2xl border border-white/10 bg-white/6 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-black">{completion.title}</div>
                  <div className="mt-1 text-sm text-white/55">{completion.focus}</div>
                </div>
                <span className="shrink-0 rounded-full bg-[var(--color-success)] px-2.5 py-1 text-xs font-black text-white">{completion.status === "COMPLETED" ? "Fait" : completion.status}</span>
              </div>
              <div className="mt-3 text-xs font-bold text-white/38">{completion.completedAt ? formatMontrealDate(completion.completedAt, { day: "2-digit", month: "short" }) : "En cours"} - {completion.duration} min</div>
            </div>
          ))}
          {recentCompletions.length === 0 && <EmptyState className="border-white/10 bg-white/6" title="Aucun historique" description="Tes séances terminées apparaîtront ici." />}
        </div>
      </section>
    </AthleteShell>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Waves; label: string; value: string | number }) {
  return (
    <div className="border-r border-white/10 p-4 last:border-r-0">
      <Icon className="mb-3 h-5 w-5 text-white/55" />
      <div className="text-2xl font-black">{value}</div>
      <div className="text-[10px] font-bold uppercase leading-tight text-white/38">{label}</div>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-2xl border border-white/10 bg-white/6 p-3"><div className="text-[10px] font-bold uppercase text-white/38">{label}</div><div className="mt-2 text-2xl font-black">{value}</div></div>;
}
