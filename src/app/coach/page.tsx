import Link from "next/link";
import { ArrowRight, CalendarDays, CalendarPlus, Check, ChevronRight, Clock3, ListChecks, Plus, Printer, Timer, Trophy, Users } from "lucide-react";
import { CoachShell } from "@/components/coach/coach-shell";
import { AthleteAvatarGroup } from "@/components/coach/athlete-avatar-group";
import { BlockTypeBadge } from "@/components/training/block-type-badge";
import { StatusPill } from "@/components/training/status-pill";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { athletes, demoSession, weekSessions } from "@/lib/data";
import { requireCoach } from "@/lib/current-user";
import { query } from "@/lib/db";
import { resolveAvatarUrls } from "@/lib/avatar-storage";
import { addMontrealDays, formatMontrealCountdown, formatMontrealDate, formatMontrealTime, sameMontrealDay, startOfMontrealDay, startOfMontrealWeek } from "@/lib/timezone";

export const dynamic = "force-dynamic";

type DashboardSession = {
  id: string;
  title: string;
  focus: string;
  date: Date;
  duration: number;
  status: string;
  groupName: string;
  blocks: Array<{ type: string; estimatedVolume: number; assignments: Array<{ athleteId: string }> }>;
  completions: Array<{ status: string }>;
  planningEventId: string | null;
};
type DashboardSchedule = { id: string; title: string; startsAt: Date; duration: number | null; location: string | null; groupName: string | null; sessionId: string | null };
type SessionRow = {id:string;title:string;focus:string;date:Date;duration:number;status:string;planningEventId:string|null;groupName:string};
type CompetitionRow = { title: string; startsAt: Date; targetGroupId: string | null; targetGroupName: string | null };
type GroupCompetition = { groupName: string; title: string; startsAt: Date };

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

  const [athleteRows, weekSessionRows, scheduleRows, eventRows, completionRows, nextRows, latestRows, competitionRows] = await Promise.all([
    query<{id:string;firstName:string;lastName:string;avatar:string|null;groupId:string|null;groupName:string|null}>(`SELECT a.id,u."firstName",u."lastName",u.avatar,g.id AS "groupId",g.name AS "groupName" FROM "Athlete" a JOIN "User" u ON u.id=a."userId" LEFT JOIN "TrainingGroup" g ON g.id=a."groupId" WHERE a."clubId"=$1 AND a.active=true ORDER BY u."firstName"`,[clubId]),
    query<SessionRow>(`SELECT s.id,s.title,s.focus,s.date,COALESCE(pe.duration,s.duration) AS duration,s.status,s."planningEventId",g.name AS "groupName" FROM "TrainingSession" s JOIN "TrainingWeek" w ON w.id=s."weekId" JOIN "TrainingGroup" g ON g.id=w."groupId" LEFT JOIN "PlanningEvent" pe ON pe.id=s."planningEventId" WHERE w."clubId"=$1 AND s.date >= $2 AND s.date < $3 ORDER BY s.date`,[clubId,weekStart,weekEnd]),
    query<{id:string;title:string;startsAt:Date;duration:number|null;location:string|null;groupName:string|null;sessionId:string|null}>(`SELECT e.id,e.title,e."startsAt",e.duration,e.location,g.name AS "groupName",s.id AS "sessionId" FROM "PlanningEvent" e LEFT JOIN "TrainingGroup" g ON g.id=e."groupId" LEFT JOIN "TrainingSession" s ON s."planningEventId"=e.id WHERE e."clubId"=$1 AND e.type='TRAINING_SCHEDULE' AND e."startsAt">=$2 AND e."startsAt"<$3 ORDER BY e."startsAt"`,[clubId,weekStart,weekEnd]),
    query<{id:string;message:string;type:string;createdAt:Date;email:string|null}>(`SELECT e.id,e.message,e.type,e."createdAt",u.email FROM "AppEvent" e LEFT JOIN "User" u ON u.id=e."userId" WHERE e."clubId"=$1 OR e."clubId" IS NULL ORDER BY e."createdAt" DESC LIMIT 5`,[clubId]),
    query<{athleteId:string;sessionId:string;status:string;completedAt:Date|null;startedAt:Date|null;firstName:string;lastName:string;title:string}>(`SELECT c."athleteId",c."sessionId",c.status,c."completedAt",c."startedAt",u."firstName",u."lastName",s.title FROM "AthleteSessionCompletion" c JOIN "TrainingSession" s ON s.id=c."sessionId" JOIN "TrainingWeek" w ON w.id=s."weekId" JOIN "Athlete" a ON a.id=c."athleteId" JOIN "User" u ON u.id=a."userId" WHERE w."clubId"=$1 ORDER BY c."completedAt" DESC,c."startedAt" DESC LIMIT 5`,[clubId]),
    query<SessionRow>(`SELECT s.id,s.title,s.focus,s.date,COALESCE(pe.duration,s.duration) AS duration,s.status,s."planningEventId",g.name AS "groupName" FROM "TrainingSession" s JOIN "TrainingWeek" w ON w.id=s."weekId" JOIN "TrainingGroup" g ON g.id=w."groupId" LEFT JOIN "PlanningEvent" pe ON pe.id=s."planningEventId" WHERE w."clubId"=$1 AND s.date>$2 ORDER BY s.date ASC LIMIT 1`,[clubId,today]),
    query<SessionRow>(`SELECT s.id,s.title,s.focus,s.date,COALESCE(pe.duration,s.duration) AS duration,s.status,s."planningEventId",g.name AS "groupName" FROM "TrainingSession" s JOIN "TrainingWeek" w ON w.id=s."weekId" JOIN "TrainingGroup" g ON g.id=w."groupId" LEFT JOIN "PlanningEvent" pe ON pe.id=s."planningEventId" WHERE w."clubId"=$1 AND s.date<=$2 ORDER BY s.date DESC LIMIT 1`,[clubId,today]),
    query<CompetitionRow>(`SELECT e.title,e."startsAt",COALESCE(g.id,a."groupId") AS "targetGroupId",COALESCE(g.name,ag.name) AS "targetGroupName" FROM "PlanningEvent" e LEFT JOIN "TrainingGroup" g ON g.id=e."groupId" LEFT JOIN "Athlete" a ON a.id=e."athleteId" LEFT JOIN "TrainingGroup" ag ON ag.id=a."groupId" WHERE e."clubId"=$1 AND e.type='COMPETITION' AND e."startsAt">=$2 ORDER BY e."startsAt" ASC`,[clubId,today])
  ]);
  const athleteAvatarUrls = await resolveAvatarUrls(athleteRows.rows.map((athlete) => athlete.avatar));
  const activeAthletes=athleteRows.rows.map((a,index)=>({id:a.id,user:{firstName:a.firstName,lastName:a.lastName,avatar:athleteAvatarUrls[index]},group:a.groupName?{id:a.groupId!,name:a.groupName}:null}));
  const rawSessions=await loadDashboardSessions([...weekSessionRows.rows,...nextRows.rows,...latestRows.rows]);
  const nextScheduledSession=nextRows.rows[0]?rawSessions.find(s=>s.id===nextRows.rows[0].id):null;
  const latestScheduledSession=latestRows.rows[0]?rawSessions.find(s=>s.id===latestRows.rows[0].id):null;
  const schedules=scheduleRows.rows;
  const recentEvents=eventRows.rows;
  const recentCompletions=completionRows.rows;

  const sessions: DashboardSession[] = rawSessions.map(toDashboardSession);
  const todaySessions = sessions.filter((session) => session.date >= dayStart && session.date < dayEnd);
  const primarySession = pickPrimarySession(
    todaySessions,
    nextScheduledSession ? toDashboardSession(nextScheduledSession) : undefined,
    latestScheduledSession ? toDashboardSession(latestScheduledSession) : undefined
  );
  const activeSessionIds = new Set(sessions.filter((session) => session.completions.some((completion) => completion.status === "IN_PROGRESS")).map((session) => session.id));
  const groups = summarizeGroups(activeAthletes);
  const groupCompetitions: GroupCompetition[] = groups.flatMap((group) => {
    const event = competitionRows.rows.find((item) => !item.targetGroupId || item.targetGroupId === group.id);
    return event ? [{ groupName: group.name, title: event.title, startsAt: event.startsAt }] : [];
  });
  const dashboardAthletes = activeAthletes.map((athlete) => ({
    id: athlete.id,
    firstName: athlete.user.firstName,
    lastName: athlete.user.lastName,
    avatar: athlete.user.avatar
  }));
  const recentActivity = [
    ...recentCompletions.map((completion) => ({
      key: `completion-${completion.athleteId}-${completion.sessionId}`,
      label: `${completion.firstName} ${completion.lastName}`,
      detail: `${completionStatusLabel(completion.status)} - ${completion.title}`,
      date: completion.completedAt ?? completion.startedAt
    })),
    ...recentEvents.map((event) => ({
      key: `event-${event.id}`,
      label: event.message,
      detail: event.email ?? event.type,
      date: event.createdAt
    }))
  ].filter((item): item is { key: string; label: string; detail: string; date: Date } => Boolean(item.date)).sort((a, b) => Number(b.date) - Number(a.date)).slice(0, 6);

  return (
    <CoachShell active="Dashboard">
      <div className="mb-4 flex flex-col justify-between gap-4 rounded-2xl border border-white/80 bg-white/65 px-5 py-4 shadow-[var(--shadow-card)] md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-[var(--color-navy)]">Bonjour {user.firstName}</h1>
          <p className="mt-0.5 text-sm font-medium text-[var(--color-ink-muted)]">{user.club?.name ?? "Club"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-2 hidden items-center gap-2 text-xs font-bold text-[var(--color-ink-muted)] sm:flex"><CalendarDays className="h-4 w-4"/>{formatMontrealDate(today, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
          <Button asChild variant="outline"><Link href="/coach/athletes"><Users className="h-4 w-4" /> Athlètes</Link></Button>
          <Button asChild variant="action"><Link href="/coach/sessions/new"><Plus className="h-4 w-4" /> Créer une séance</Link></Button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.45fr_0.85fr]">
        <TodayCard session={primarySession} activeSessionIds={activeSessionIds} athletes={dashboardAthletes} />
        <QuickReadCard sessions={sessions} groupCompetitions={groupCompetitions} />
      </div>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between gap-4 px-1">
          <h2 className="text-lg font-black tracking-tight">Planning de la semaine</h2>
          <Link href="/coach/planning" className="inline-flex items-center gap-1 text-xs font-black text-[var(--color-brand-strong)] hover:underline">Voir le planning complet <ArrowRight className="h-3.5 w-3.5"/></Link>
        </div>
        <div className="rounded-2xl border border-white/80 bg-white/70 p-2 shadow-[var(--shadow-card)]"><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
          {weekDays(weekStart).map((day) => <WeekDayCard key={day.key} day={day} sessions={sessions.filter((session) => !session.planningEventId && sameMontrealDay(session.date, day.date))} schedules={schedules.filter((schedule) => sameMontrealDay(schedule.startsAt, day.date))} activeSessionIds={activeSessionIds} />)}
        </div></div>
      </section>

      <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_1fr_0.72fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-3"><CardTitle className="text-base">Groupes et athlètes</CardTitle><Link className="text-xs font-black text-[var(--color-brand-strong)]" href="/coach/groups">Tous les groupes <ArrowRight className="inline h-3 w-3"/></Link></CardHeader>
          <CardContent className="space-y-3">
            {groups.map((group) => (
              <Link href="/coach/groups" key={group.name} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3 transition hover:border-[var(--color-brand)]">
                <div className="flex items-center justify-between gap-3">
                <div><div className="text-sm font-black">{group.name}</div><div className="text-xs text-[var(--color-ink-muted)]">{group.count} athlètes actifs</div></div>
                </div>
                  <AthleteAvatarGroup ids={group.ids} athletes={dashboardAthletes} limit={4} /><ChevronRight className="h-4 w-4 shrink-0 text-[var(--color-ink-soft)]"/>
              </Link>
            ))}
            {groups.length === 0 && <EmptyState title="Aucun athlete actif" description="Importe ou ajoute des athletes pour suivre les groupes du jour." action={<Button asChild><Link href="/coach/athletes">Ouvrir les athletes</Link></Button>} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between pb-3"><CardTitle className="text-base">Activité récente</CardTitle><Link className="text-xs font-black text-[var(--color-brand-strong)]" href="/coach/sessions">Voir toute l&apos;activité <ArrowRight className="inline h-3 w-3"/></Link></CardHeader>
          <CardContent className="space-y-3">
            {recentActivity.map((item) => (
              <div key={item.key} className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--block-pool-bg)] text-[var(--color-brand-strong)]"><Check className="h-4 w-4"/></span>
                <div className="min-w-0 flex-1"><div className="truncate text-xs font-black">{item.label}</div><div className="truncate text-[11px] text-[var(--color-ink-muted)]">{item.detail}</div></div>
                <span className="shrink-0 text-[10px] font-bold text-[var(--color-ink-soft)]">{formatMontrealDate(item.date, { day: "2-digit", month: "short" })}</span>
              </div>
            ))}
            {recentActivity.length === 0 && <EmptyState title="Aucune activite recente" description="Les completions et evenements apparaitront ici des qu'ils existent." />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Accès rapide</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Shortcut href="/coach/sessions/new" label="Créer une séance" icon={CalendarPlus} primary />
            <Shortcut href="/coach/athletes" label="Voir les athlètes" icon={Users} />
            <Shortcut href={primarySession ? `/coach/sessions/${primarySession.id}/print` : "/coach/sessions"} label="Impression" icon={Printer} />
          </CardContent>
        </Card>
      </div>
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
    ,planningEventId: null
  })) satisfies DashboardSession[];
  const now = new Date();
  const todaySessions = sessions.filter((session) => sameMontrealDay(session.date, now));
  const primarySession = pickPrimarySession(
    todaySessions,
    sessions.find((session) => session.date > now),
    [...sessions].filter((session) => session.date <= now).sort((a, b) => b.date.getTime() - a.date.getTime())[0]
  );
  const activeSessionIds = new Set<string>();

  return (
    <CoachShell active="Dashboard">
      <div className="mb-4 flex flex-col justify-between gap-4 rounded-2xl border border-white/80 bg-white/65 px-5 py-4 shadow-[var(--shadow-card)] md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-[var(--color-navy)]">Bonjour {userName.split(" ")[0]}</h1>
          <p className="mt-0.5 text-sm font-medium text-[var(--color-ink-muted)]">Club Mustang · Mode démo</p>
        </div>
        <div className="flex flex-wrap items-center gap-2"><div className="mr-2 hidden items-center gap-2 text-xs font-bold text-[var(--color-ink-muted)] sm:flex"><CalendarDays className="h-4 w-4"/>{formatMontrealDate(new Date(), { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div><Button asChild variant="outline"><Link href="/coach/athletes"><Users className="h-4 w-4"/>Athlètes</Link></Button><Button asChild variant="action"><Link href="/coach/sessions/demo"><Plus className="h-4 w-4"/>Créer une séance</Link></Button></div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.45fr_0.85fr]">
        <TodayCard session={primarySession} activeSessionIds={activeSessionIds} athletes={athletes} demo />
        <QuickReadCard sessions={sessions} groupCompetitions={[{groupName:"Groupe pilote",title:"Invitation provinciale",startsAt:addMontrealDays(startOfMontrealWeek(new Date()),4)}]} />
      </div>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between gap-4 px-1">
          <h2 className="text-lg font-black tracking-tight">Planning de la semaine</h2>
          <Link href="/coach/planning" className="inline-flex items-center gap-1 text-xs font-black text-[var(--color-brand-strong)] hover:underline">Voir le planning complet <ArrowRight className="h-3.5 w-3.5"/></Link>
        </div>
        <div className="rounded-2xl border border-white/80 bg-white/70 p-2 shadow-[var(--shadow-card)]"><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
          {weekDays(weekStart).map((day) => <WeekDayCard key={day.key} day={day} sessions={sessions.filter((session) => sameMontrealDay(session.date, day.date))} schedules={[]} activeSessionIds={activeSessionIds} demo />)}
        </div></div>
      </section>

      <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_1fr_0.72fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-3"><CardTitle className="text-base">Groupes et athlètes</CardTitle><Link className="text-xs font-black text-[var(--color-brand-strong)]" href="/coach/groups">Tous les groupes <ArrowRight className="inline h-3 w-3"/></Link></CardHeader>
          <CardContent>
            <Link href="/coach/groups" className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3"><div><div className="text-sm font-black">{demoSession.group}</div><div className="text-xs text-[var(--color-ink-muted)]">{athletes.length} athlètes actifs</div></div><AthleteAvatarGroup ids={athletes.map((athlete) => athlete.id)} limit={4} /><ChevronRight className="h-4 w-4 text-[var(--color-ink-soft)]"/></Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-3"><CardTitle className="text-base">Activité récente</CardTitle><Link className="text-xs font-black text-[var(--color-brand-strong)]" href="/coach/sessions">Voir toute l&apos;activité <ArrowRight className="inline h-3 w-3"/></Link></CardHeader>
          <CardContent className="space-y-3">
            {[
              ["Séance demo ouverte", demoSession.title],
              ["Plan demo disponible", `${demoSession.blocks.length} blocs`]
            ].map(([label, detail]) => (
              <div key={label} className="flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--block-pool-bg)] text-[var(--color-brand-strong)]"><Check className="h-4 w-4"/></span><div><div className="text-xs font-black">{label}</div><div className="text-[11px] text-[var(--color-ink-muted)]">{detail}</div></div></div>
            ))}
          </CardContent>
        </Card>
        <Card><CardHeader className="pb-3"><CardTitle className="text-base">Accès rapide</CardTitle></CardHeader><CardContent className="space-y-2"><Shortcut href="/coach/sessions/demo" label="Créer une séance" icon={CalendarPlus} primary/><Shortcut href="/coach/athletes" label="Voir les athlètes" icon={Users}/><Shortcut href="/coach/sessions/demo/print" label="Impression" icon={Printer}/></CardContent></Card>
      </div>
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
      <Card className="relative overflow-hidden border-[var(--color-navy)] bg-[radial-gradient(ellipse_at_75%_5%,rgba(0,178,204,.38),transparent_42%),linear-gradient(115deg,#061626_0%,#0a243b_58%,#0b3c53_100%)] text-white">
      <CardContent className="relative p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] font-black uppercase tracking-wide text-[var(--color-brand)]">Prochaine séance</p>
          <div className="flex items-center gap-2"><StatusPill status={String(effectiveStatus)} /><span className="text-xs font-bold text-white/65">{formatMontrealDate(session.date,{weekday:"short",day:"numeric",month:"short"})} · {formatMontrealTime(session.date)}</span></div>
        </div>
        <h2 className="mt-2 max-w-2xl text-3xl font-black leading-tight text-white sm:text-4xl">{session.title}</h2>
        <p className="mt-1 text-sm text-white/75">{[session.groupName, session.focus].filter(Boolean).join(" · ")}</p>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <DarkMetric icon={Clock3} label="Durée" value={`${session.duration} min`} />
          <DarkMetric icon={Users} label="Athlètes" value={assignedIds.length} />
          <DarkMetric icon={Timer} label="Volume" value={volume} />
          <DarkMetric icon={ListChecks} label="Blocs" value={session.blocks.length} />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3"><AthleteAvatarGroup ids={assignedIds} athletes={athletes} limit={6} /><div className="flex flex-wrap gap-1.5">{uniqueBlockTypes(session.blocks).map((type) => <BlockTypeBadge key={String(type)} type={String(type)} />)}</div></div>
          <Button asChild variant="action" size="default" className="min-w-36">
            <Link href={action.href}>{action.label} <ArrowRight className="h-5 w-5" /></Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function WeekDayCard({ day, sessions, schedules, activeSessionIds, demo = false }: { day: { key: number; label: string; date: Date }; sessions: DashboardSession[]; schedules: DashboardSchedule[]; activeSessionIds: Set<string>; demo?: boolean }) {
  const isToday = sameMontrealDay(day.date, new Date());
  return (
    <Card id={`day-${day.key}`} className={`min-h-36 scroll-mt-28 rounded-xl ${isToday ? "border-[var(--color-action)] bg-[#fff9f7] shadow-[0_0_0_1px_var(--color-action)]" : "bg-white"}`}>
      <CardContent className="p-2.5">
        <div className="mb-2 flex items-start justify-between gap-1.5">
          <div className="min-w-0"><div className="truncate text-xs font-black">{day.label}</div><div className="text-[10px] font-bold text-[var(--color-ink-soft)]">{formatMontrealDate(day.date, { day: "2-digit", month: "short" })}</div></div>
          <span className="shrink-0 text-[10px] font-bold text-[var(--color-ink-soft)]">{sessions.length + schedules.length || "Repos"}</span>
        </div>
        <div className="space-y-3">
          {sessions.map((session) => {
            return (
              <div key={session.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-2">
                <div className="text-[10px] font-black text-[var(--color-brand-strong)]">{formatMontrealTime(session.date)}</div>
                <Link href={demo ? "/coach/sessions/demo" : `/coach/sessions/${session.id}`} className="mt-0.5 block text-[11px] font-black leading-tight hover:text-[var(--color-brand-strong)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">{session.title}</Link>
                {session.focus && <p className="mt-0.5 line-clamp-2 text-[10px] leading-tight text-[var(--color-ink-muted)]">{session.focus}</p>}
                <div className="mt-1.5 flex flex-wrap gap-1">{uniqueBlockTypes(session.blocks).map((type) => <BlockTypeBadge key={String(type)} type={String(type)} className="px-1.5 py-0.5 text-[9px]" />)}</div>
              </div>
            );
          })}
          {schedules.map((schedule) => <div key={schedule.id} className="rounded-lg border border-[var(--color-brand)]/25 bg-[var(--color-surface-raised)] p-2">
            <div className="text-[10px] font-black text-[var(--color-brand-strong)]">{formatMontrealTime(schedule.startsAt)}</div>
            {schedule.sessionId ? <Link href={`/coach/sessions/${schedule.sessionId}`} className="mt-0.5 block text-[11px] font-black leading-tight hover:text-[var(--color-brand-strong)]">{schedule.title}</Link> : <div className="mt-0.5 text-[11px] font-black leading-tight">{schedule.title}</div>}
            <div className="mt-1 text-[10px] leading-tight text-[var(--color-ink-muted)]">{schedule.groupName ?? "Club complet"}{schedule.location ? ` · ${schedule.location}` : ""}</div>
            <div className="mt-1 text-[9px] font-bold text-[var(--color-action-strong)]">{schedule.sessionId ? "Séance planifiée" : "Entraînement à faire"}</div>
          </div>)}
          {sessions.length === 0 && schedules.length === 0 && <div className="rounded-lg border border-dashed border-[var(--color-border-strong)] p-2.5 text-[10px] font-semibold text-[var(--color-ink-soft)]">Aucun horaire ni séance</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function QuickReadCard({ sessions, groupCompetitions }: {
  sessions: DashboardSession[];
  groupCompetitions: GroupCompetition[];
}) {
  const weekStart = startOfMontrealWeek(new Date());
  const weekEnd = addMontrealDays(weekStart, 7);
  const weekSessions = sessions.filter((item) => item.date >= weekStart && item.date < weekEnd);
  const sessionCount = weekSessions.length;
  const athleteCount = new Set(weekSessions.flatMap((item) => uniqueAssignedIds(item.blocks))).size;
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3"><CardTitle className="text-base">Cette semaine</CardTitle></CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2.5 rounded-xl bg-[var(--color-surface-raised)] p-3"><CalendarPlus className="h-6 w-6 shrink-0 text-[var(--color-brand-strong)]"/><div><strong className="block text-2xl leading-none">{sessionCount}</strong><span className="text-[11px] text-[var(--color-ink-muted)]">séances planifiées</span></div></div>
            <div className="flex items-center gap-2.5 rounded-xl bg-[var(--color-surface-raised)] p-3"><Users className="h-6 w-6 shrink-0 text-[var(--color-brand-strong)]"/><div><strong className="block text-2xl leading-none">{athleteCount}</strong><span className="text-[11px] text-[var(--color-ink-muted)]">athlètes attendus</span></div></div>
          </div>
          <div className="border-t border-[var(--color-border)] pt-3">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-black uppercase text-[var(--color-brand-strong)]"><Timer className="h-4 w-4"/>Temps avant compétition</div>
            {groupCompetitions.length ? <div className="flex flex-wrap gap-2">{groupCompetitions.map((competition) => <div key={competition.groupName} className="min-w-0 flex-1 rounded-lg bg-[var(--color-surface-raised)] px-2 py-1.5"><p className="truncate text-[11px] font-black">{competition.groupName}</p><p className="truncate text-[10px] text-[var(--color-ink-muted)]">{competition.title}</p><p className="mt-0.5 flex items-center gap-1 text-[11px] font-black text-[var(--color-brand-strong)]"><Trophy className="h-3 w-3 shrink-0 text-amber-500"/>{formatMontrealCountdown(competition.startsAt)}</p></div>)}</div> : <p className="text-xs text-[var(--color-ink-muted)]">Aucune compétition à venir pour les groupes.</p>}
          </div>
      </CardContent>
    </Card>
  );
}

function DarkMetric({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: string | number }) {
  return <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/7 px-3 py-2"><Icon className="h-5 w-5 shrink-0 text-[var(--color-brand)]"/><div className="min-w-0"><div className="text-[10px] font-bold text-white/60">{label}</div><div className="truncate text-sm font-black text-white">{value}</div></div></div>;
}

function Shortcut({ href, label, icon: Icon, primary = false }: { href: string; label: string; icon: typeof CalendarPlus; primary?: boolean }) {
  return (
    <Button asChild variant={primary ? "action" : "outline"} className="w-full justify-between text-xs">
      <Link href={href}><span className="inline-flex items-center gap-2"><Icon className="h-4 w-4" /> {label}</span><ArrowRight className="h-4 w-4" /></Link>
    </Button>
  );
}

function getPrimaryAction(session: DashboardSession, status: string, demo: boolean) {
  const base = demo ? "/coach/sessions/demo" : `/coach/sessions/${session.id}`;
  if (status === "DRAFT") return { label: "Preparer", href: `${base}/edit` };
  if (status === "IN_PROGRESS") return { label: "Poursuivre", href: base };
  return { label: "Ouvrir", href: base };
}

function pickPrimarySession(todaySessions: DashboardSession[], nextSession?: DashboardSession, latestSession?: DashboardSession) {
  return todaySessions.find((session) => session.completions.some((completion) => completion.status === "IN_PROGRESS")) ?? nextSession ?? latestSession;
}

function toDashboardSession(session: {
  id: string;
  title: string;
  focus: string;
  date: Date;
  duration: number;
  status: string;
  week: { group: { name: string } };
  blocks: DashboardSession["blocks"];
  completions: DashboardSession["completions"];
  planningEventId: string | null;
}): DashboardSession {
  return {
    id: session.id,
    title: session.title,
    focus: session.focus,
    date: session.date,
    duration: session.duration,
    status: session.status,
    groupName: session.week.group.name,
    blocks: session.blocks,
    completions: session.completions,
    planningEventId: session.planningEventId
  };
}

async function loadDashboardSessions(rows: SessionRow[]) {
  const uniqueRows=Array.from(new Map(rows.map(row=>[row.id,row])).values());
  const sessionIds=uniqueRows.map(row=>row.id);
  if(sessionIds.length===0)return [] as Array<SessionRow & {week:{group:{name:string}};blocks:DashboardSession["blocks"];completions:DashboardSession["completions"]}>;
  const blockRows=await query<{id:string;sessionId:string;type:string;estimatedVolume:number;position:number}>(`SELECT id,"sessionId",type,"estimatedVolume",position FROM "SessionBlock" WHERE "sessionId"=ANY($1::text[]) ORDER BY position`,[sessionIds]);
  const blockIds=blockRows.rows.map(row=>row.id);
  const [assignmentRows,completionRows]=await Promise.all([
    query<{sessionBlockId:string;athleteId:string}>(`SELECT "sessionBlockId","athleteId" FROM "SessionBlockAssignment" WHERE "sessionBlockId"=ANY($1::text[])`,[blockIds]),
    query<{sessionId:string;status:string}>(`SELECT "sessionId",status FROM "AthleteSessionCompletion" WHERE "sessionId"=ANY($1::text[])`,[sessionIds])
  ]);
  return uniqueRows.map(row=>({
    ...row,
    week:{group:{name:row.groupName}},
    blocks:blockRows.rows.filter(block=>block.sessionId===row.id).map(block=>({type:block.type,estimatedVolume:block.estimatedVolume,assignments:assignmentRows.rows.filter(a=>a.sessionBlockId===block.id).map(a=>({athleteId:a.athleteId}))})),
    completions:completionRows.rows.filter(completion=>completion.sessionId===row.id).map(completion=>({status:completion.status}))
  }));
}

function summarizeGroups(activeAthletes: Array<{ id: string; group: { id: string; name: string } | null }>) {
  const groups = new Map<string, { id: string; name: string; count: number; ids: string[] }>();
  for (const athlete of activeAthletes) {
    const name = athlete.group?.name ?? "Sans groupe";
    const id = athlete.group?.id ?? "";
    const group = groups.get(name) ?? { id, name, count: 0, ids: [] };
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

function completionStatusLabel(status: string) {
  if (status === "COMPLETED") return "Séance terminée";
  if (status === "IN_PROGRESS") return "Séance en cours";
  if (status === "SKIPPED") return "Séance ignorée";
  return "Séance assignée";
}

function weekDays(weekStart: Date) {
  return ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"].map((label, index) => ({ key: index + 1, label, date: addMontrealDays(weekStart, index) }));
}
