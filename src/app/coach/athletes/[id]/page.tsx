import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BrainCircuit, CalendarClock, Dumbbell, Eye, Plus, ShieldAlert, Sparkles, Target, Trash2, Trophy, Waves, X } from "lucide-react";
import { deleteAthlete, updateAthleteDiveFamily } from "@/app/coach/athletes/actions";
import { CoachShell } from "@/components/coach/coach-shell";
import { CompetitionDiveEditor } from "@/components/coach/competition-dive-editor";
import { ProgressChart } from "@/components/athlete/progress-chart";
import { TechniqueDetails } from "@/components/athlete/technique-details";
import { StatusPill } from "@/components/training/status-pill";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { athletes as demoAthletes } from "@/lib/data";
import { requireCoach } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { getAthleteProgressTotals, type AthleteProgressTotals } from "@/lib/athlete-session";
import { countPoolContexts } from "@/lib/pool-list";
import { getAthleteSessionPreviewStats, type AthleteSessionPreviewStats } from "@/lib/monitoring";
import { addMontrealDays, formatMontrealCountdown, formatMontrealDate, parseMontrealSessionDate, startOfMontrealDay } from "@/lib/timezone";

export const dynamic = "force-dynamic";

type AthleteProfile = {
  id: string;
  firstName: string;
  lastName: string;
  avatar?: string | null;
  level: string;
  active: boolean;
  groupName: string;
  birthDate?: Date | null;
  volume: number;
  completedSessions: number;
  nextSession?: { id: string; title: string; date: Date; status: string };
  recentSessions: Array<{ id: string; title: string; date: Date; status: string; rating?: string | null; note?: string | null; poolPlanned: number; poolActual: number; blocks: Array<{ id: string; title: string; planned: number; actual: number }> }>;
  skills: Array<{ code: string; name: string; status: string; progress: number; trainings: number; repetitions: number }>;
  planningEvents: Array<{ id: string; title: string; type: string; startsAt: Date; endsAt: Date | null; location?: string | null }>;
  nextCompetition?: { title: string; startsAt: Date; endsAt: Date | null };
  competitionDives: Array<{ id: string; height: "ONE_METER" | "THREE_METER" | "PLATFORM" | "CUSTOM"; code: string; difficulty: number | null }>;
  diveNotes: Array<{ id: string; code: string; name: string; height: string; note: string; updatedAt: Date; sessionId: string; sessionTitle: string; sessionDate: Date }>;
  progress: Pick<AthleteProgressTotals, "chartData" | "sessionChartData" | "weeklyChartData" | "monthlyChartData" | "skillData" | "skillDives">;
  previewStats: AthleteSessionPreviewStats;
  attendance: { seasonLabel: string; absent: number; total: number; rate: number; months: Array<{ label: string; absent: number; total: number; rate: number }> };
};

export default async function AthleteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, { clubId }] = await Promise.all([params, requireCoach()]);

  if (clubId === "dev-club") {
    return <DemoAthleteDetailPage id={id} />;
  }

  const athlete = await prisma.athlete.findFirst({
    where: { id, clubId },
    include: {
      user: true,
      group: true,
      completions: {
        orderBy: [{ completedAt: "desc" }, { startedAt: "desc" }],
        take: 8,
        include: {
          session: {
            include: {
              blocks: {
                orderBy: { position: "asc" },
                include: {
                  assignments: { select: { athleteId: true } },
                  drylandExercises: true,
                  poolTraining: { include: { sections: { include: { dives: true } } } }
                }
              }
            }
          }
        }
      },
      diveLogs: { where: { session: { week: { clubId } } }, include: { poolDive: true, session: true } },
      exerciseLogs: { where: { session: { week: { clubId } } }, select: { sessionId: true, exerciseId: true, completed: true } },
      diveNotes: {
        where: { poolDive: { poolSection: { poolTraining: { block: { session: { week: { clubId } } } } } } },
        orderBy: { updatedAt: "desc" },
        select: {
          poolDiveId: true,
          note: true,
          updatedAt: true,
          poolDive: {
            select: {
              diveCode: true,
              diveName: true,
              poolSection: {
                select: {
                  height: true,
                  poolTraining: { select: { block: { select: { session: { select: { id: true, title: true, date: true } } } } } }
                }
              }
            }
          }
        }
      },
      skills: { include: { skill: true }, orderBy: { progress: "desc" } },
      planningEvents: { where: { startsAt: { gte: startOfMontrealDay() } }, orderBy: { startsAt: "asc" }, take: 6 },
      competitionDives: { orderBy: [{ height: "asc" }, { position: "asc" }, { createdAt: "asc" }] }
    }
  });

  if (!athlete) {
    notFound();
  }

  const nextSession = await prisma.trainingSession.findFirst({
    where: {
      week: { clubId },
      status: "READY",
      date: { gte: startOfMontrealDay() },
      blocks: { some: { assignments: { some: { athleteId: athlete.id } } } }
    },
    orderBy: { date: "asc" },
    select: { id: true, title: true, date: true, status: true }
  });
  const nextCompetition = await prisma.planningEvent.findFirst({
    where: {
      clubId,
      type: "COMPETITION",
      startsAt: { gte: startOfMontrealDay() },
      OR: [{ athleteId: athlete.id }, ...(athlete.groupId ? [{ groupId: athlete.groupId }] : []), { athleteId: null, groupId: null }]
    },
    orderBy: { startsAt: "asc" },
    select: { title: true, startsAt: true, endsAt: true }
  });
  const [progress, previewStats] = await Promise.all([
    getAthleteProgressTotals(athlete.id),
    getAthleteSessionPreviewStats(athlete.userId)
  ]);
  const today = startOfMontrealDay();
  const seasonStartYear = today.getMonth() >= 8 ? today.getFullYear() : today.getFullYear() - 1;
  const seasonStart = parseMontrealSessionDate(`${seasonStartYear}-09-01`, "00:00");
  const attendanceSessions = await prisma.trainingSession.findMany({ where: { week: { clubId }, status: { not: "NOT_DONE" }, date: { gte: seasonStart, lt: addMontrealDays(today, 1) }, blocks: { some: { assignments: { some: { athleteId: athlete.id } } } } }, select: { id: true, date: true } });
  const attendanceAbsences = await prisma.athleteSessionAbsence.findMany({ where: { athleteId: athlete.id, sessionId: { in: attendanceSessions.map((session) => session.id) } }, select: { sessionId: true } });
  const absenceIds = new Set(attendanceAbsences.map((absence) => absence.sessionId));
  const monthCount = (today.getMonth() - 8 + 12) % 12 + 1;
  const attendanceMonths = Array.from({ length: monthCount }, (_, index) => {
    const monthOffset = 8 + index;
    const year = seasonStartYear + Math.floor(monthOffset / 12);
    const month = monthOffset % 12;
    const sessions = attendanceSessions.filter((session) => session.date.getFullYear() === year && session.date.getMonth() === month);
    const absent = sessions.filter((session) => absenceIds.has(session.id)).length;
    const total = sessions.length;
    return { label: new Intl.DateTimeFormat("fr-CA", { month: "long" }).format(new Date(year, month, 1)), absent, total, rate: total ? Math.round(absent / total * 100) : 0 };
  });

  const profile: AthleteProfile = {
    id: athlete.id,
    firstName: athlete.user.firstName,
    lastName: athlete.user.lastName,
    avatar: athlete.user.avatar,
    level: athlete.level,
    active: athlete.active,
    groupName: athlete.group?.name ?? "Sans groupe",
    birthDate: athlete.birthDate,
    volume: athlete.diveLogs.reduce((sum, log) => sum + log.repetitionsCompleted, 0),
    completedSessions: athlete.completions.filter((completion) => completion.status === "COMPLETED").length,
    nextSession: nextSession ?? undefined,
    recentSessions: athlete.completions.map((completion) => ({
      id: completion.sessionId,
      title: completion.session.title,
      date: completion.session.date,
      status: completion.status,
      rating: completion.rating,
      note: completion.note,
      poolPlanned: completion.session.blocks
        .filter((block) => block.assignments.some((assignment) => assignment.athleteId === athlete.id))
        .flatMap((block) => block.poolTraining?.sections.flatMap((section) => section.dives.map((dive) => dive.repetitions * Math.max(1, countPoolContexts(section.label ?? section.height))) ?? []) ?? [])
        .reduce((sum, reps) => sum + reps, 0),
      poolActual: athlete.diveLogs
        .filter((log) => log.sessionId === completion.sessionId)
        .reduce((sum, log) => sum + log.repetitionsCompleted, 0),
      blocks: completion.session.blocks
        .filter((block) => block.assignments.some((assignment) => assignment.athleteId === athlete.id))
        .map((block) => {
          const dives = block.poolTraining?.sections.flatMap((section) => section.dives.map((dive) => ({
            ...dive,
            plannedRepetitions: dive.repetitions * Math.max(1, countPoolContexts(section.label ?? section.height))
          }))) ?? [];
          const exercises = block.drylandExercises;
          const planned = dives.reduce((sum, dive) => sum + dive.plannedRepetitions, 0)
            + exercises.reduce((sum, item) => sum + (item.sets ?? 1) * (item.reps ?? 0), 0);
          const actual = dives.reduce((sum, dive) => sum + (athlete.diveLogs.find((log) => log.sessionId === completion.sessionId && log.poolDiveId === dive.id)?.repetitionsCompleted ?? 0), 0)
            + exercises.reduce((sum, item) => sum + (athlete.exerciseLogs.find((log) => log.sessionId === completion.sessionId && log.exerciseId === item.exerciseId)?.completed ? (item.sets ?? 1) * (item.reps ?? 0) : 0), 0);
          return { id: block.id, title: block.title, planned, actual };
        })
    })),
    skills: athlete.skills.map((item) => ({
      code: item.skill.code,
      name: item.skill.name,
      status: item.status,
      progress: item.progress,
      trainings: item.trainings,
      repetitions: item.repetitions
    })),
    planningEvents: athlete.planningEvents.map((event) => ({
      id: event.id,
      title: event.title,
      type: event.type,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      location: event.location
    })),
    nextCompetition: nextCompetition ?? undefined,
    competitionDives: athlete.competitionDives.map((dive) => ({
      id: dive.id,
      height: dive.height,
      code: dive.diveCode,
      difficulty: dive.difficulty
    })),
    diveNotes: athlete.diveNotes.map((item) => ({
      id: item.poolDiveId,
      code: item.poolDive.diveCode,
      name: item.poolDive.diveName,
      height: item.poolDive.poolSection.height,
      note: item.note,
      updatedAt: item.updatedAt,
      sessionId: item.poolDive.poolSection.poolTraining.block.session.id,
      sessionTitle: item.poolDive.poolSection.poolTraining.block.session.title,
      sessionDate: item.poolDive.poolSection.poolTraining.block.session.date
    })),
    progress,
    previewStats,
    attendance: { seasonLabel: `${seasonStartYear}-${seasonStartYear + 1}`, absent: attendanceAbsences.length, total: attendanceSessions.length, rate: attendanceSessions.length ? Math.round(attendanceAbsences.length / attendanceSessions.length * 100) : 0, months: attendanceMonths }
  };

  return <AthleteDetail profile={profile} />;
}

function DemoAthleteDetailPage({ id }: { id: string }) {
  const athlete = demoAthletes.find((item) => item.id === id);
  if (!athlete) {
    notFound();
  }

  return (
    <AthleteDetail
      profile={{
        id: athlete.id,
        firstName: athlete.firstName,
        lastName: athlete.lastName,
        avatar: athlete.avatar,
        level: athlete.level,
        active: athlete.status !== "surveiller",
        groupName: "Provincial",
        birthDate: parseMontrealSessionDate("2010-04-12"),
        volume: athlete.recentVolume,
        completedSessions: 6,
        nextSession: { id: "demo", title: athlete.lastSession, date: parseMontrealSessionDate("2026-08-25"), status: "READY" },
        recentSessions: [
          { id: "demo", title: athlete.lastSession, date: parseMontrealSessionDate("2026-08-25"), status: "COMPLETED", rating: "Stable", note: "Placeholder demo.", poolPlanned: 12, poolActual: athlete.recentVolume, blocks: [{ id: "demo-block", title: "Bassin · technique", planned: 12, actual: athlete.recentVolume }] },
          { id: "demo-2", title: "Dryland power", date: parseMontrealSessionDate("2026-08-22"), status: "COMPLETED", rating: "Bon effort", note: null, poolPlanned: 0, poolActual: 0, blocks: [{ id: "demo-block-2", title: "Préparation physique", planned: 72, actual: 60 }] }
        ],
        skills: [
          { code: "201B", name: "Arriere carpe", status: "DEVELOPING", progress: 68, trainings: 8, repetitions: 31 },
          { code: "301C", name: "Retour groupe", status: "LEARNING", progress: 44, trainings: 5, repetitions: 18 },
          { code: "101C", name: "Avant groupe", status: "MASTERED", progress: 92, trainings: 16, repetitions: 70 }
        ],
        planningEvents: [
          { id: "event-demo", title: "Camp technique", type: "CAMP", startsAt: parseMontrealSessionDate("2026-08-27"), endsAt: null, location: "Bassin principal" }
        ],
        competitionDives: [
          { id: "competition-1", height: "ONE_METER", code: "203C", difficulty: 2 },
          { id: "competition-2", height: "ONE_METER", code: "201B", difficulty: 1.6 },
          { id: "competition-3", height: "THREE_METER", code: "405C", difficulty: 3.1 }
        ],
        diveNotes: [],
        progress: {
          chartData: [
            { name: "18 août", volume: 22 },
            { name: "20 août", volume: 31 },
            { name: "22 août", volume: 27 },
            { name: "25 août", volume: 36 }
          ],
          sessionChartData: [
            { name: "18 août", volume: 22, finalRating: "Bien" },
            { name: "20 août", volume: 31, finalRating: "Très bien" },
            { name: "22 août", volume: 27, finalRating: "Moyen" },
            { name: "25 août", volume: 36, finalRating: "Bien" }
          ],
          weeklyChartData: [{ name: "Sem. 18 août", volume: 29 }],
          monthlyChartData: [{ name: "août 2026", volume: 29 }],
          skillData: [
            { name: "Avant", volume: 31 },
            { name: "Arriere", volume: 18 },
            { name: "Renverse", volume: 12 },
            { name: "Retourne", volume: 8 },
            { name: "Vrille", volume: 0 },
            { name: "Equilibre", volume: 0 }
          ],
          skillDives: [
            { category: "Arriere", code: "201B", name: "Arriere carpe", height: "ONE_METER", volume: 18 },
            { category: "Renverse", code: "301C", name: "Retour groupe", height: "THREE_METER", volume: 12 },
            { category: "Avant", code: "101C", name: "Avant groupe", height: "ONE_METER", volume: 31 }
          ]
        },
        previewStats: { total: 4, today: 1, days: Array.from({ length: 7 }, (_, index) => ({ date: parseMontrealSessionDate(`2026-08-${String(18 + index).padStart(2, "0")}`), count: index === 1 ? 1 : index === 3 ? 2 : 0 })) },
        attendance: { seasonLabel: "2026-2027", absent: 1, total: 8, rate: 13, months: [] }
      }}
      demo
    />
  );
}

function AthleteDetail({ profile, demo = false }: { profile: AthleteProfile; demo?: boolean }) {
  const fullName = `${profile.firstName} ${profile.lastName}`;
  const diveIq = getDiveIqPlaceholders(profile);

  return (
    <CoachShell active="Athletes">
      <div className="mb-6">
        <Button asChild variant="outline" size="sm"><Link href="/coach/athletes"><ArrowLeft className="h-4 w-4" /> Athlètes</Link></Button>
      </div>

      <div className="mb-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="overflow-hidden">
          <div className="h-2 bg-[var(--color-brand)]" />
          <CardContent className="p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <Avatar className="h-20 w-20 border border-[var(--color-border)]">
                  <AvatarImage src={profile.avatar ?? undefined} />
                  <AvatarFallback>{profile.firstName[0]}{profile.lastName[0]}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="text-sm font-black uppercase text-[var(--color-brand-strong)]">Fiche athlète</p>
                  <h1 className="mt-1 truncate text-3xl font-black">{fullName}</h1>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant="outline">{profile.groupName}</Badge>
                    <Badge variant={profile.active ? "success" : "outline"}>{profile.active ? "Actif" : "Inactif"}</Badge>
                    <Badge variant="outline">{profile.level}</Badge>
                  </div>
                </div>
              </div>
              {profile.nextSession && (
                <Button asChild variant="action">
                  <Link href={demo ? "/coach/sessions/demo" : `/coach/sessions/${profile.nextSession.id}`}>Prochaine séance</Link>
                </Button>
              )}
              <form action={demo ? undefined : deleteAthlete}>
                <input type="hidden" name="athleteId" value={profile.id} />
                <Button type="submit" variant="outline" disabled={demo} className="text-[var(--color-danger)] hover:border-[var(--color-danger)]">
                  <Trash2 className="h-4 w-4" /> Supprimer
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Repères</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <Metric icon={<Dumbbell className="h-4 w-4" />} label="Séances complétées" value={profile.completedSessions} />
            <Metric icon={<Waves className="h-4 w-4" />} label="Volume réalisé" value={`${profile.volume} reps`} />
            <Metric icon={<CalendarClock className="h-4 w-4" />} label="Naissance" value={profile.birthDate ? formatMontrealDate(profile.birthDate) : "Non indiquée"} />
            <Metric icon={<Trophy className="h-4 w-4" />} label="Prochaine compétition" value={profile.nextCompetition ? formatMontrealCountdown(profile.nextCompetition.startsAt) : "Aucune prévue"} />
          </CardContent>
        </Card>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <DiveIqCard icon={<BrainCircuit className="h-5 w-5" />} label="DiveIQ readiness" value={diveIq.readiness} detail="Placeholder temporaire basé sur l'historique local." />
        <DiveIqCard icon={<ShieldAlert className="h-5 w-5" />} label="Risque charge" value={diveIq.risk} detail="Placeholder temporaire, aucune analyse médicale." />
        <DiveIqCard icon={<Sparkles className="h-5 w-5" />} label="Suggestion" value={diveIq.suggestion} detail="À remplacer par DiveIQ quand l'intégration sera disponible." />
      </div>

      <PreviewStatsCard stats={profile.previewStats} />

      <AttendanceCard attendance={profile.attendance} />

      <AthleteProgress profile={profile} />

      <CompetitionDiveEditor athleteId={profile.id} dives={profile.competitionDives} demo={demo} />

      <DiveNotesCard notes={profile.diveNotes} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader><CardTitle>Historique récent</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {profile.recentSessions.map((session) => (
              <div key={`${session.id}-${session.date.toISOString()}`} className="rounded-[var(--radius-ui)] border border-[var(--color-border)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-black text-[var(--color-ink)]">{session.title}</div>
                    <div className="mt-1 text-sm font-semibold text-[var(--color-ink-muted)]">{formatMontrealDate(session.date, { weekday: "short", day: "2-digit", month: "short" })}</div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2"><StatusPill status={session.status} />{session.poolPlanned > 0 && <span className="rounded-full bg-[var(--block-pool-bg)] px-3 py-1.5 text-xs font-black text-[var(--block-pool-fg)]">Piscine · {session.poolActual} / {session.poolPlanned} reps</span>}<Button asChild size="sm" variant="outline"><Link href={demo ? "/coach/sessions/demo" : `/coach/sessions/${session.id}`}>Ouvrir</Link></Button></div>
                </div>
                {(session.rating || session.note) && <p className="mt-3 text-sm leading-6 text-[var(--color-ink-muted)]">{session.rating ?? "Sans rating"}{session.note ? ` · ${session.note}` : ""}</p>}
                {session.blocks.length > 0 && <details className="group mt-3 rounded-xl bg-[var(--color-surface-raised)] px-3 py-2"><summary className="cursor-pointer list-none text-sm font-bold text-[var(--color-brand-strong)] marker:hidden">Afficher détails séance</summary><div className="mt-3 space-y-2">{session.blocks.map((block) => <div key={block.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm"><span className="font-bold">{block.title}</span><span className="font-black text-[var(--color-ink-muted)]">{block.actual} / {block.planned} reps réalisées</span></div>)}</div></details>}
              </div>
            ))}
            {profile.recentSessions.length === 0 && <p className="text-sm font-semibold text-[var(--color-ink-muted)]">Aucun historique enregistré.</p>}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Compétences</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {profile.skills.map((skill) => (
                <div key={`${skill.code}-${skill.name}`} className="rounded-[var(--radius-ui)] bg-[var(--color-surface-raised)] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-black">{skill.code} · {skill.name}</div>
                    <Badge variant="outline">{skill.status}</Badge>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                    <div className="h-full rounded-full bg-[var(--color-brand)]" style={{ width: `${Math.min(100, skill.progress)}%` }} />
                  </div>
                  <div className="mt-2 text-xs font-bold text-[var(--color-ink-muted)]">{skill.progress}% · {skill.trainings} entraînements · {skill.repetitions} reps</div>
                </div>
              ))}
              {profile.skills.length === 0 && <p className="text-sm font-semibold text-[var(--color-ink-muted)]">Aucune compétence suivie pour l’instant.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Planning lié</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {profile.nextSession && (
                <LinkedItem icon={<Target className="h-4 w-4" />} title={profile.nextSession.title} detail={`${formatMontrealDate(profile.nextSession.date)} · séance`} />
              )}
              {profile.planningEvents.map((event) => (
                <LinkedItem key={event.id} icon={<Trophy className="h-4 w-4" />} title={event.title} detail={`${event.endsAt ? `Du ${formatMontrealDate(event.startsAt)} au ${formatMontrealDate(event.endsAt)}` : formatMontrealDate(event.startsAt)} · ${event.type}${event.location ? ` · ${event.location}` : ""}`} />
              ))}
              {!profile.nextSession && profile.planningEvents.length === 0 && <p className="text-sm font-semibold text-[var(--color-ink-muted)]">Aucun événement à venir lié à cet athlète.</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </CoachShell>
  );
}

function AttendanceCard({ attendance }: { attendance: AthleteProfile["attendance"] }) {
  return <Card className="mb-6">
    <CardHeader><CardTitle>Absences · saison {attendance.seasonLabel}</CardTitle><p className="text-sm text-[var(--color-ink-muted)]">{attendance.absent} absence{attendance.absent === 1 ? "" : "s"} sur {attendance.total} entraînements planifiés · {attendance.rate}%</p></CardHeader>
    <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {attendance.months.map((month) => <div key={month.label} className="flex items-center justify-between rounded-xl bg-[var(--color-surface-raised)] p-3"><span className="font-bold capitalize">{month.label}</span><span className="text-sm font-semibold text-[var(--color-ink-muted)]">{month.absent}/{month.total} · {month.rate}%</span></div>)}
      {attendance.months.length === 0 && <p className="text-sm text-[var(--color-ink-muted)]">Aucun entraînement terminé dans la saison.</p>}
    </CardContent>
  </Card>;
}

function PreviewStatsCard({ stats }: { stats: AthleteSessionPreviewStats }) {
  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2"><Eye className="h-5 w-5 text-[var(--color-brand-strong)]" /> Aperçus des entraînements</CardTitle>
            <p className="mt-1 text-sm leading-6 text-[var(--color-ink-muted)]">Consultations de cet athlète pendant la semaine en cours.</p>
          </div>
          <div className="text-right"><div className="text-3xl font-black">{stats.total}</div><div className="text-xs font-bold text-[var(--color-ink-muted)]">cette semaine</div></div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 rounded-xl bg-[var(--color-surface-raised)] px-3 py-2 text-sm font-bold text-[var(--color-ink-muted)]">{stats.today} consultation{stats.today > 1 ? "s" : ""} aujourd’hui</div>
        <div className="grid grid-cols-7 gap-2" aria-label="Consultations d’aperçu par jour">
          {stats.days.map((day) => (
            <div key={day.date.toISOString()} className="text-center">
              <div className="text-[10px] font-black uppercase text-[var(--color-ink-muted)]">{formatMontrealDate(day.date, { weekday: "short" }).replace(".", "")}</div>
              <div className="mt-1 text-xs font-bold text-[var(--color-ink-soft)]">{formatMontrealDate(day.date, { day: "numeric" })}</div>
              <div className={`mx-auto mt-2 flex h-9 w-9 items-center justify-center rounded-lg text-sm font-black ${day.count > 0 ? "bg-[var(--color-brand)] text-white" : "bg-[var(--color-surface-raised)] text-[var(--color-ink-muted)]"}`}>{day.count}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DiveNotesCard({ notes }: { notes: AthleteProfile["diveNotes"] }) {
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Commentaires sur les plongeons</CardTitle>
        <p className="text-sm leading-6 text-[var(--color-ink-muted)]">Les notes personnelles laissées par l’athlète, regroupées par plongeon.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {notes.map((item) => (
          <div key={item.id} className="rounded-[var(--radius-ui)] border border-[var(--color-border)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-black">{item.code} <span className="font-semibold text-[var(--color-ink-muted)]">· {item.name}</span></div>
                <div className="mt-1 text-sm font-semibold text-[var(--color-ink-muted)]">{item.height.replace("_", " ")} · {item.sessionTitle} · {formatMontrealDate(item.sessionDate, { weekday: "short", day: "2-digit", month: "short" })}</div>
              </div>
              <div className="text-xs font-bold text-[var(--color-ink-muted)]">Modifiée le {formatMontrealDate(item.updatedAt)}</div>
            </div>
            <p className="mt-3 whitespace-pre-line text-sm leading-6 text-[var(--color-ink)]">{item.note}</p>
          </div>
        ))}
        {notes.length === 0 && <p className="text-sm font-semibold text-[var(--color-ink-muted)]">Aucun commentaire de plongeon pour l’instant.</p>}
      </CardContent>
    </Card>
  );
}

const progressTechnique = [
  { label: "Avant", color: "#ed163d", icon: "waves" },
  { label: "Arriere", color: "#ff4b68", icon: "activity" },
  { label: "Renverse", color: "#bd0d2d", icon: "waves" },
  { label: "Retourne", color: "#ff6b83", icon: "waves" },
  { label: "Vrille", color: "#bd0d2d", icon: "goal" },
  { label: "Equilibre", color: "#ed163d", icon: "goal" }
] as const;

function AthleteProgress({ profile }: { profile: AthleteProfile }) {
  const technique = progressTechnique.map((item) => ({
    ...item,
    dives: profile.progress.skillData.find((entry) => entry.name === item.label)?.volume ?? 0
  }));

  return (
    <div className="coach-athlete-progress mb-6 grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,.9fr)]">
      <Card>
        <CardHeader><CardTitle>Tendance</CardTitle><p className="text-sm leading-6 text-[var(--color-ink-muted)]">Volume d’entraînement dans le temps</p></CardHeader>
        <CardContent><ProgressChart data={profile.progress.chartData} sessionData={profile.progress.sessionChartData} weeklyData={profile.progress.weeklyChartData} monthlyData={profile.progress.monthlyChartData} /></CardContent>
      </Card>
      <Card>
        <CardContent className="p-5"><TechniqueDetails technique={technique} skillDives={profile.progress.skillDives} athleteId={profile.id} updateFamilyAction={updateAthleteDiveFamily} /></CardContent>
      </Card>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--radius-ui)] bg-[var(--color-surface-raised)] p-3">
      <span className="flex items-center gap-2 text-sm font-bold text-[var(--color-ink-muted)]">{icon}{label}</span>
      <span className="text-right font-black">{value}</span>
    </div>
  );
}

function DiveIqCard({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--block-pool-bg)] text-[var(--block-pool-fg)]">{icon}</div>
        <div className="text-xs font-black uppercase text-[var(--color-brand-strong)]">{label}</div>
        <div className="mt-2 text-2xl font-black">{value}</div>
        <p className="mt-2 text-sm leading-6 text-[var(--color-ink-muted)]">{detail}</p>
      </CardContent>
    </Card>
  );
}

function LinkedItem({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return (
    <div className="rounded-[var(--radius-ui)] border border-[var(--color-border)] p-3">
      <div className="flex items-center gap-2 font-black">{icon}{title}</div>
      <div className="mt-1 text-sm font-semibold text-[var(--color-ink-muted)]">{detail}</div>
    </div>
  );
}

function getDiveIqPlaceholders(profile: AthleteProfile) {
  const readiness = profile.volume > 140 ? "Élevée" : profile.volume > 80 ? "Stable" : "À bâtir";
  const risk = profile.completedSessions > 5 ? "Normal" : "Données limitées";
  const suggestion = profile.skills.some((skill) => skill.progress < 50) ? "Revoir les bases ciblées" : "Maintenir la progression";

  return { readiness, risk, suggestion };
}
