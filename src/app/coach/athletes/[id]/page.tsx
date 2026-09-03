import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BrainCircuit, CalendarClock, Dumbbell, ShieldAlert, Sparkles, Target, Trash2, Trophy, Waves } from "lucide-react";
import { deleteAthlete } from "@/app/coach/athletes/actions";
import { CoachShell } from "@/components/coach/coach-shell";
import { StatusPill } from "@/components/training/status-pill";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { athletes as demoAthletes } from "@/lib/data";
import { requireCoach } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { formatMontrealDate, parseMontrealSessionDate, startOfMontrealDay } from "@/lib/timezone";

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
  recentSessions: Array<{ id: string; title: string; date: Date; status: string; rating?: string | null; note?: string | null }>;
  skills: Array<{ code: string; name: string; status: string; progress: number; trainings: number; repetitions: number }>;
  planningEvents: Array<{ id: string; title: string; type: string; startsAt: Date; location?: string | null }>;
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
        include: { session: true }
      },
      diveLogs: { where: { session: { week: { clubId } } }, include: { poolDive: true, session: true } },
      skills: { include: { skill: true }, orderBy: { progress: "desc" } },
      planningEvents: { where: { startsAt: { gte: startOfMontrealDay() } }, orderBy: { startsAt: "asc" }, take: 6 }
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
      note: completion.note
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
      location: event.location
    }))
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
          { id: "demo", title: athlete.lastSession, date: parseMontrealSessionDate("2026-08-25"), status: "COMPLETED", rating: "Stable", note: "Placeholder demo." },
          { id: "demo-2", title: "Dryland power", date: parseMontrealSessionDate("2026-08-22"), status: "COMPLETED", rating: "Bon effort", note: null }
        ],
        skills: [
          { code: "201B", name: "Arriere carpe", status: "DEVELOPING", progress: 68, trainings: 8, repetitions: 31 },
          { code: "301C", name: "Retour groupe", status: "LEARNING", progress: 44, trainings: 5, repetitions: 18 },
          { code: "101C", name: "Avant groupe", status: "MASTERED", progress: 92, trainings: 16, repetitions: 70 }
        ],
        planningEvents: [
          { id: "event-demo", title: "Camp technique", type: "CAMP", startsAt: parseMontrealSessionDate("2026-08-27"), location: "Bassin principal" }
        ]
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
          </CardContent>
        </Card>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <DiveIqCard icon={<BrainCircuit className="h-5 w-5" />} label="DiveIQ readiness" value={diveIq.readiness} detail="Placeholder temporaire basé sur l'historique local." />
        <DiveIqCard icon={<ShieldAlert className="h-5 w-5" />} label="Risque charge" value={diveIq.risk} detail="Placeholder temporaire, aucune analyse médicale." />
        <DiveIqCard icon={<Sparkles className="h-5 w-5" />} label="Suggestion" value={diveIq.suggestion} detail="À remplacer par DiveIQ quand l'intégration sera disponible." />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader><CardTitle>Historique récent</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {profile.recentSessions.map((session) => (
              <Link key={`${session.id}-${session.date.toISOString()}`} href={demo ? "/coach/sessions/demo" : `/coach/sessions/${session.id}`} className="block rounded-[var(--radius-ui)] border border-[var(--color-border)] p-4 transition hover:border-[var(--color-brand)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-black text-[var(--color-ink)]">{session.title}</div>
                    <div className="mt-1 text-sm font-semibold text-[var(--color-ink-muted)]">{formatMontrealDate(session.date, { weekday: "short", day: "2-digit", month: "short" })}</div>
                  </div>
                  <StatusPill status={session.status} />
                </div>
                {(session.rating || session.note) && <p className="mt-3 text-sm leading-6 text-[var(--color-ink-muted)]">{session.rating ?? "Sans rating"}{session.note ? ` · ${session.note}` : ""}</p>}
              </Link>
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
                <LinkedItem key={event.id} icon={<Trophy className="h-4 w-4" />} title={event.title} detail={`${formatMontrealDate(event.startsAt)} · ${event.type}${event.location ? ` · ${event.location}` : ""}`} />
              ))}
              {!profile.nextSession && profile.planningEvents.length === 0 && <p className="text-sm font-semibold text-[var(--color-ink-muted)]">Aucun événement à venir lié à cet athlète.</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </CoachShell>
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
