import Link from "next/link";
import type { BlockType, CompletionStatus, SessionStatus } from "@prisma/client";
import { ArrowRight, CalendarPlus, Clock3, Dumbbell, FileText, Printer, Users } from "lucide-react";
import { CoachShell } from "@/components/coach/coach-shell";
import { AthleteAvatarGroup } from "@/components/coach/athlete-avatar-group";
import { BlockTypeBadge } from "@/components/training/block-type-badge";
import { StatusPill } from "@/components/training/status-pill";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { athletes, demoSession, weekSessions } from "@/lib/data";
import { requireCoach } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { addMontrealDays, formatMontrealDate, formatMontrealTime, sameMontrealDay, startOfMontrealDay, startOfMontrealWeek } from "@/lib/timezone";

export const dynamic = "force-dynamic";

type DashboardSession = {
  id: string;
  title: string;
  focus: string;
  date: Date;
  duration: number;
  status: SessionStatus | string;
  groupName: string;
  blocks: Array<{ type: BlockType | string; estimatedVolume: number; assignments: Array<{ athleteId: string }> }>;
  completions: Array<{ status: CompletionStatus | string }>;
};

type AvatarAthlete = { id: string; firstName: string; lastName: string; avatar?: string | null };

export default async function CoachDashboard() {
  const { user, clubId } = await requireCoach();

  if (clubId === "dev-club") {
    return <DemoCoachDashboard userName={`${user.firstName} ${user.lastName}`} />;
  }

  const today = new Date();
  const weekStart = startOfMontrealWeek(today);
  const weekEnd = addMontrealDays(weekStart, 7);
  const dayStart = startOfMontrealDay(today);
  const dayEnd = addMontrealDays(dayStart, 1);

  const [activeAthletes, rawSessions, recentEvents, recentCompletions] = await Promise.all([
    prisma.athlete.findMany({
      where: { clubId, active: true },
      include: { user: true, group: true },
      orderBy: { user: { firstName: "asc" } }
    }),
    prisma.trainingSession.findMany({
      where: { week: { clubId }, date: { gte: weekStart, lt: weekEnd } },
      orderBy: { date: "asc" },
      include: {
        week: { include: { group: true } },
        blocks: { orderBy: { position: "asc" }, include: { assignments: true } },
        completions: true
      }
    }),
    prisma.appEvent.findMany({
      where: { OR: [{ clubId }, { clubId: null }] },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { user: true }
    }),
    prisma.athleteSessionCompletion.findMany({
      where: { session: { week: { clubId } } },
      orderBy: [{ completedAt: "desc" }, { startedAt: "desc" }],
      take: 5,
      include: { athlete: { include: { user: true } }, session: true }
    })
  ]);

  const sessions: DashboardSession[] = rawSessions.map((session) => ({
    id: session.id,
    title: session.title,
    focus: session.focus,
    date: session.date,
    duration: session.duration,
    status: session.status,
    groupName: session.week.group.name,
    blocks: session.blocks,
    completions: session.completions
  }));
  const todaySessions = sessions.filter((session) => session.date >= dayStart && session.date < dayEnd);
  const primarySession = pickPrimarySession(todaySessions, sessions, today);
  const activeSessionIds = new Set(sessions.filter((session) => session.completions.some((completion) => completion.status === "IN_PROGRESS")).map((session) => session.id));
  const weekStats = getWeekStats(sessions);
  const groups = summarizeGroups(activeAthletes);
  const dashboardAthletes = activeAthletes.map((athlete) => ({
    id: athlete.id,
    firstName: athlete.user.firstName,
    lastName: athlete.user.lastName,
    avatar: athlete.user.avatar
  }));
  const recentActivity = [
    ...recentCompletions.map((completion) => ({
      key: `completion-${completion.athleteId}-${completion.sessionId}`,
      label: `${completion.athlete.user.firstName} ${completion.athlete.user.lastName}`,
      detail: `${completionStatusLabel(completion.status)} - ${completion.session.title}`,
      date: completion.completedAt ?? completion.startedAt
    })),
    ...recentEvents.map((event) => ({
      key: `event-${event.id}`,
      label: event.message,
      detail: event.user?.email ?? event.type,
      date: event.createdAt
    }))
  ].filter((item): item is { key: string; label: string; detail: string; date: Date } => Boolean(item.date)).sort((a, b) => Number(b.date) - Number(a.date)).slice(0, 6);

  return (
    <CoachShell active="Dashboard">
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="text-sm font-black uppercase text-[var(--color-brand-strong)]">Aujourd&apos;hui</p>
          <h1 className="mt-2 text-4xl font-black tracking-normal text-[var(--color-ink)]">{user.club?.name ?? "Club"}</h1>
          <p className="mt-2 text-[var(--color-ink-muted)]">La prochaine action, les groupes concernes et l&apos;etat reel de la semaine.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link href="/coach/athletes"><Users className="h-4 w-4" /> Athlètes</Link></Button>
          <Button asChild variant="action"><Link href="/coach/sessions/new"><CalendarPlus className="h-4 w-4" /> Nouvelle séance</Link></Button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.45fr_0.85fr]">
        <TodayCard session={primarySession} activeSessionIds={activeSessionIds} athletes={dashboardAthletes} />
        <Card>
          <CardHeader><CardTitle>Lecture rapide</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <StatTile label="Séances semaine" value={weekStats.total} detail={`${weekStats.ready} publiées`} icon={CalendarPlus} />
            <StatTile label="En cours" value={weekStats.inProgress} detail="retours athletes ouverts" icon={Clock3} />
            <StatTile label="Terminées" value={weekStats.completed} detail="statut séance" icon={FileText} />
            <StatTile label="Athlètes actifs" value={activeAthletes.length} detail={`${groups.length} groupes`} icon={Users} />
          </CardContent>
        </Card>
      </div>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="text-xl font-black">Semaine</h2>
          <WeekSelector sessions={sessions} />
        </div>
        <div className="grid gap-3 lg:grid-cols-7">
          {weekDays(weekStart).map((day) => <WeekDayCard key={day.key} day={day} sessions={sessions.filter((session) => sameMontrealDay(session.date, day.date))} activeSessionIds={activeSessionIds} />)}
        </div>
      </section>

      <div className="mt-6 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader><CardTitle>Groupes et athletes</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {groups.map((group) => (
              <div key={group.name} className="rounded-2xl bg-[var(--color-surface-raised)] p-4">
                <div className="flex items-center justify-between gap-3">
                <div><div className="font-black">{group.name}</div><div className="text-sm text-[var(--color-ink-muted)]">{group.count} athlètes actifs</div></div>
                  <AthleteAvatarGroup ids={group.ids} athletes={dashboardAthletes} limit={4} />
                </div>
              </div>
            ))}
            {groups.length === 0 && <EmptyState title="Aucun athlete actif" description="Importe ou ajoute des athletes pour suivre les groupes du jour." action={<Button asChild><Link href="/coach/athletes">Ouvrir les athletes</Link></Button>} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Activite recente</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {recentActivity.map((item) => (
              <div key={item.key} className="flex items-start justify-between gap-4 rounded-2xl border border-[var(--color-border)] p-3">
                <div><div className="font-bold">{item.label}</div><div className="text-sm text-[var(--color-ink-muted)]">{item.detail}</div></div>
                <span className="shrink-0 text-xs font-bold text-[var(--color-ink-soft)]">{formatMontrealDate(item.date, { day: "2-digit", month: "short" })}</span>
              </div>
            ))}
            {recentActivity.length === 0 && <EmptyState title="Aucune activite recente" description="Les completions et evenements apparaitront ici des qu'ils existent." />}
          </CardContent>
        </Card>
      </div>

      <section className="mt-6 grid gap-3 md:grid-cols-4">
        <Shortcut href="/coach/sessions/new" label="Créer une séance" icon={CalendarPlus} primary />
        <Shortcut href="/coach/groups" label="Groupes" icon={Dumbbell} />
        <Shortcut href="/coach/athletes" label="Athlètes" icon={Users} />
        <Shortcut href={primarySession ? `/coach/sessions/${primarySession.id}/print` : "/coach/sessions"} label="Impression" icon={Printer} />
      </section>
    </CoachShell>
  );
}

function DemoCoachDashboard({ userName }: { userName: string }) {
  const weekStart = startOfMontrealWeek(new Date());
  const sessions = weekSessions.filter((session) => session.title).map((session, index) => ({
    id: index === 1 ? "demo" : `demo-${index}`,
    title: session.title,
    focus: session.focus,
    date: addMontrealDays(weekStart, index),
    duration: session.duration,
    status: session.status === "Brouillon" ? "DRAFT" : session.status === "Complete" ? "COMPLETED" : "READY",
    groupName: demoSession.group,
    blocks: demoSession.blocks.map((block) => ({ type: block.type, estimatedVolume: block.volume, assignments: block.assignedTo.map((athleteId) => ({ athleteId })) })),
    completions: []
  })) satisfies DashboardSession[];
  const primarySession = sessions.find((session) => session.title === demoSession.title) ?? sessions[0];
  const activeSessionIds = new Set<string>();

  return (
    <CoachShell active="Dashboard">
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="text-sm font-black uppercase text-[var(--color-brand-strong)]">Aujourd&apos;hui</p>
          <h1 className="mt-2 text-4xl font-black tracking-normal text-[var(--color-ink)]">Club Mustang</h1>
          <p className="mt-2 text-[var(--color-ink-muted)]">Mode demo local pour {userName}.</p>
        </div>
        <Button asChild variant="action"><Link href="/coach/sessions/demo"><CalendarPlus className="h-4 w-4" /> Voir la séance demo</Link></Button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.45fr_0.85fr]">
        <TodayCard session={primarySession} activeSessionIds={activeSessionIds} athletes={athletes} demo />
        <Card>
          <CardHeader><CardTitle>Lecture rapide</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <StatTile label="Séances semaine" value={sessions.length} detail={`${sessions.filter((session) => session.status === "READY").length} publiées`} icon={CalendarPlus} />
            <StatTile label="En cours" value={0} detail="demo locale" icon={Clock3} />
            <StatTile label="Terminées" value={sessions.filter((session) => session.status === "COMPLETED").length} detail="statut séance" icon={FileText} />
            <StatTile label="Athlètes actifs" value={athletes.length} detail="1 groupe" icon={Users} />
          </CardContent>
        </Card>
      </div>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="text-xl font-black">Semaine</h2>
          <WeekSelector sessions={sessions} />
        </div>
        <div className="grid gap-3 lg:grid-cols-7">
          {weekDays(weekStart).map((day) => <WeekDayCard key={day.key} day={day} sessions={sessions.filter((session) => sameMontrealDay(session.date, day.date))} activeSessionIds={activeSessionIds} demo />)}
        </div>
      </section>

      <div className="mt-6 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader><CardTitle>Groupes et athletes</CardTitle></CardHeader>
          <CardContent>
            <div className="rounded-2xl bg-[var(--color-surface-raised)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div><div className="font-black">{demoSession.group}</div><div className="text-sm text-[var(--color-ink-muted)]">{athletes.length} athlètes actifs</div></div>
                <AthleteAvatarGroup ids={athletes.map((athlete) => athlete.id)} limit={4} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Activite recente</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {[
              ["Séance demo ouverte", demoSession.title],
              ["Plan demo disponible", `${demoSession.blocks.length} blocs`]
            ].map(([label, detail]) => (
              <div key={label} className="rounded-2xl border border-[var(--color-border)] p-3"><div className="font-bold">{label}</div><div className="text-sm text-[var(--color-ink-muted)]">{detail}</div></div>
            ))}
          </CardContent>
        </Card>
      </div>

      <section className="mt-6 grid gap-3 md:grid-cols-4">
        <Shortcut href="/coach/sessions/new" label="Créer une séance" icon={CalendarPlus} primary />
        <Shortcut href="/coach/groups" label="Groupes" icon={Dumbbell} />
        <Shortcut href="/coach/athletes" label="Athlètes" icon={Users} />
        <Shortcut href="/coach/sessions/demo/print" label="Impression" icon={Printer} />
      </section>
    </CoachShell>
  );
}

function TodayCard({ session, activeSessionIds, athletes, demo = false }: { session?: DashboardSession; activeSessionIds: Set<string>; athletes: AvatarAthlete[]; demo?: boolean }) {
  if (!session) {
    return (
      <Card className="overflow-hidden border-[var(--color-navy)] bg-[var(--color-navy)] text-white">
        <CardContent className="p-6">
          <p className="text-sm font-black uppercase text-[var(--color-brand)]">Aujourd&apos;hui</p>
          <h2 className="mt-4 text-4xl font-black leading-none text-white">Aucune séance planifiée</h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-white/62">Le planning du jour est vide. Prépare une séance pour donner au groupe une prochaine action claire.</p>
          <Button asChild variant="action" size="lg" className="mt-6"><Link href="/coach/sessions/new"><CalendarPlus className="h-5 w-5" /> Préparer la séance</Link></Button>
        </CardContent>
      </Card>
    );
  }

  const effectiveStatus = activeSessionIds.has(session.id) ? "IN_PROGRESS" : session.status;
  const action = getPrimaryAction(session, effectiveStatus, demo);
  const assignedIds = uniqueAssignedIds(session.blocks);
  const volume = session.blocks.reduce((sum, block) => sum + block.estimatedVolume, 0);

  return (
    <Card className="overflow-hidden border-[var(--color-navy)] bg-[var(--color-navy)] text-white">
      <CardContent className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <StatusPill status={String(effectiveStatus)} />
          <span className="text-sm font-bold text-white/55">{formatMontrealTime(session.date)}</span>
        </div>
        <h2 className="mt-5 max-w-2xl text-4xl font-black leading-none text-white md:text-5xl">{session.title}</h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-white/68">{session.groupName} - {session.focus}</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          <DarkMetric label="Duree" value={`${session.duration} min`} />
          <DarkMetric label="Athletes" value={assignedIds.length} />
          <DarkMetric label="Volume" value={volume} />
          <DarkMetric label="Blocs" value={session.blocks.length} />
        </div>
        <div className="mt-5 flex flex-wrap gap-2">{uniqueBlockTypes(session.blocks).map((type) => <BlockTypeBadge key={String(type)} type={String(type)} />)}</div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <AthleteAvatarGroup ids={assignedIds} athletes={athletes} limit={6} />
          <Button asChild variant="action" size="lg" className="min-w-48">
            <Link href={action.href}>{action.label} <ArrowRight className="h-5 w-5" /></Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function WeekSelector({ sessions }: { sessions: DashboardSession[] }) {
  return (
    <div className="hidden gap-1 rounded-2xl bg-white p-1 text-white shadow-sm md:flex">
      {["L", "M", "M", "J", "V", "S", "D"].map((label, index) => {
        const hasSession = sessions.some((session) => (session.date.getDay() || 7) === index + 1);
        return <a key={`${label}-${index}`} href={`#day-${index + 1}`} className={`flex h-9 w-9 items-center justify-center rounded-xl text-xs font-black text-white [color:white] transition focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${hasSession ? "bg-[var(--color-navy)]" : "bg-[var(--color-navy)]/45 hover:bg-[var(--color-navy)]/70"}`}>{label}</a>;
      })}
    </div>
  );
}

function WeekDayCard({ day, sessions, activeSessionIds, demo = false }: { day: { key: number; label: string; date: Date }; sessions: DashboardSession[]; activeSessionIds: Set<string>; demo?: boolean }) {
  return (
    <Card id={`day-${day.key}`} className="min-h-44 scroll-mt-28">
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div><div className="font-black">{day.label}</div><div className="text-xs font-bold text-[var(--color-ink-soft)]">{formatMontrealDate(day.date, { day: "2-digit", month: "short" })}</div></div>
          <span className="text-xs font-black text-[var(--color-ink-soft)]">{sessions.length || "Repos"}</span>
        </div>
        <div className="space-y-3">
          {sessions.map((session) => {
            const status = activeSessionIds.has(session.id) ? "IN_PROGRESS" : session.status;
            return (
              <div key={session.id} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3">
                <StatusPill status={String(status)} />
                <Link href={demo ? "/coach/sessions/demo" : `/coach/sessions/${session.id}`} className="mt-2 block font-black leading-tight hover:text-[var(--color-brand-strong)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">{session.title}</Link>
                <p className="mt-1 line-clamp-2 text-sm text-[var(--color-ink-muted)]">{session.focus}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">{uniqueBlockTypes(session.blocks).map((type) => <BlockTypeBadge key={String(type)} type={String(type)} className="px-2" />)}</div>
              </div>
            );
          })}
          {sessions.length === 0 && <div className="rounded-2xl border border-dashed border-[var(--color-border-strong)] p-4 text-sm font-semibold text-[var(--color-ink-soft)]">Aucune séance</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function StatTile({ label, value, detail, icon: Icon }: { label: string; value: string | number; detail: string; icon: typeof CalendarPlus }) {
  return (
    <div className="rounded-2xl bg-[var(--color-surface-raised)] p-4">
      <div className="flex items-center justify-between"><span className="text-xs font-black uppercase text-[var(--color-ink-muted)]">{label}</span><Icon className="h-4 w-4 text-[var(--color-brand-strong)]" /></div>
      <div className="mt-3 text-3xl font-black">{value}</div>
      <div className="mt-1 text-sm text-[var(--color-ink-muted)]">{detail}</div>
    </div>
  );
}

function DarkMetric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-2xl bg-white/8 p-4"><div className="text-xs font-bold uppercase text-white/45">{label}</div><div className="mt-1 text-2xl font-black">{value}</div></div>;
}

function Shortcut({ href, label, icon: Icon, primary = false }: { href: string; label: string; icon: typeof CalendarPlus; primary?: boolean }) {
  return (
    <Button asChild variant={primary ? "action" : "outline"} className="justify-between">
      <Link href={href}><span className="inline-flex items-center gap-2"><Icon className="h-4 w-4" /> {label}</span><ArrowRight className="h-4 w-4" /></Link>
    </Button>
  );
}

function getPrimaryAction(session: DashboardSession, status: SessionStatus | string, demo: boolean) {
  const base = demo ? "/coach/sessions/demo" : `/coach/sessions/${session.id}`;
  if (status === "DRAFT") return { label: "Preparer", href: `${base}/edit` };
  if (status === "IN_PROGRESS") return { label: "Poursuivre", href: base };
  return { label: "Ouvrir", href: base };
}

function pickPrimarySession(todaySessions: DashboardSession[], sessions: DashboardSession[], today: Date) {
  return todaySessions.find((session) => session.completions.some((completion) => completion.status === "IN_PROGRESS")) ?? todaySessions.find((session) => session.date >= today) ?? todaySessions[0] ?? sessions.find((session) => session.date >= today) ?? sessions[0];
}

function getWeekStats(sessions: DashboardSession[]) {
  return {
    total: sessions.length,
    ready: sessions.filter((session) => session.status === "READY").length,
    completed: sessions.filter((session) => session.status === "COMPLETED").length,
    inProgress: sessions.filter((session) => session.completions.some((completion) => completion.status === "IN_PROGRESS")).length
  };
}

function summarizeGroups(activeAthletes: Array<{ id: string; group: { name: string } | null }>) {
  const groups = new Map<string, { name: string; count: number; ids: string[] }>();
  for (const athlete of activeAthletes) {
    const name = athlete.group?.name ?? "Sans groupe";
    const group = groups.get(name) ?? { name, count: 0, ids: [] };
    group.count += 1;
    group.ids.push(athlete.id);
    groups.set(name, group);
  }
  return Array.from(groups.values());
}

function uniqueAssignedIds(blocks: DashboardSession["blocks"]) {
  return Array.from(new Set(blocks.flatMap((block) => block.assignments.map((assignment) => assignment.athleteId))));
}

function uniqueBlockTypes(blocks: DashboardSession["blocks"]) {
  return Array.from(new Set(blocks.map((block) => block.type)));
}

function completionStatusLabel(status: CompletionStatus | string) {
  if (status === "COMPLETED") return "Séance terminée";
  if (status === "IN_PROGRESS") return "Séance en cours";
  if (status === "SKIPPED") return "Séance ignorée";
  return "Séance assignée";
}

function weekDays(weekStart: Date) {
  return ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"].map((label, index) => ({ key: index + 1, label, date: addMontrealDays(weekStart, index) }));
}
