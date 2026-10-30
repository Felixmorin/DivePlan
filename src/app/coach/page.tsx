import Link from "@/components/ui/app-link";
import { redirect } from "next/navigation";
import { ArrowRight, AlertCircle, CalendarDays, CalendarPlus, ChevronRight, Clock3, ListChecks, Timer, Users, ClipboardCheck, CircleCheck, Clock4 } from "lucide-react";
import { CoachShell } from "@/components/coach/coach-shell";
import { AthleteAvatarGroup } from "@/components/coach/athlete-avatar-group";
import { PrintButton } from "@/components/coach/print-button";
import { BlockTypeBadge } from "@/components/training/block-type-badge";
import { StatusPill } from "@/components/training/status-pill";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { athletes, demoSession, weekSessions } from "@/lib/data";
import { requireCoach } from "@/lib/current-user";
import { query } from "@/lib/db";
import { resolveAvatarUrls } from "@/lib/avatar-storage";
import { shouldCompleteSession } from "@/lib/session-status";
import { addMontrealDays, formatMontrealDate, formatMontrealTime, sameMontrealDay, startOfMontrealWeek } from "@/lib/timezone";

export const dynamic = "force-dynamic";

type DashboardSession = {
  id: string;
  title: string;
  date: Date;
  duration: number;
  status: string;
  groupName: string;
  blocks: Array<{ type: string; estimatedVolume: number; assignments: Array<{ athleteId: string }> }>;
  completions: Array<{ status: string }>;
  planningEventId: string | null;
};
type DashboardSchedule = { id: string; title: string; startsAt: Date; duration: number | null; location: string | null; groupId: string | null; groupName: string | null; athleteId: string | null; sessionId: string | null; sessionStatus: string | null };
type SessionRow = {id:string;title:string;date:Date;duration:number;status:string;planningEventId:string|null;groupName:string};
type GroupRow = { id: string; name: string };

type AvatarAthlete = { id: string; firstName: string; lastName: string; avatar?: string | null };
type DashboardAlert = { id: string; title: string; detail: string; href: string; tone: "rose" | "amber" | "cyan" };

export default async function CoachDashboard() {
  const { user, coach, clubId } = await requireCoach();
  const dashboardAccess = await query<{ enabled: boolean }>(`SELECT enabled FROM "CoachFeatureAccess" WHERE "userId" = $1 AND "featureId" = 'dashboard'`, [user.id]);
  if (dashboardAccess.rows[0]?.enabled === false) redirect("/coach/access-denied");

  if (clubId === "dev-club") {
    return <DemoCoachDashboard userName={`${user.firstName} ${user.lastName}`} />;
  }


  const today = new Date();
  const weekStartsOn = coach.weekStartsOn === 0 ? 0 : 1;
  const weekStart = startOfMontrealWeek(today, weekStartsOn);
  const weekEnd = addMontrealDays(weekStart, 7);

  const [athleteRows, groupRows, weekSessionRows, scheduleRows, completionRows, nextRows, latestRows] = await Promise.all([
    query<{id:string;firstName:string;lastName:string;avatar:string|null;groupId:string|null;groupName:string|null}>(`SELECT a.id,u."firstName",u."lastName",u.avatar,g.id AS "groupId",g.name AS "groupName" FROM "Athlete" a JOIN "User" u ON u.id=a."userId" LEFT JOIN "TrainingGroup" g ON g.id=a."groupId" WHERE a."clubId"=$1 AND a.active=true ORDER BY u."firstName"`,[clubId]),
    query<GroupRow>(`SELECT id,name FROM "TrainingGroup" WHERE "clubId"=$1 ORDER BY name`, [clubId]),
    query<SessionRow>(`SELECT s.id,s.title,s.date,COALESCE(pe.duration,s.duration) AS duration,s.status,s."planningEventId",g.name AS "groupName" FROM "TrainingSession" s JOIN "TrainingWeek" w ON w.id=s."weekId" JOIN "TrainingGroup" g ON g.id=w."groupId" LEFT JOIN "PlanningEvent" pe ON pe.id=s."planningEventId" WHERE w."clubId"=$1 AND s."calendarHiddenAt" IS NULL AND s.status <> 'CANCELLED' AND s.date >= $2 AND s.date < $3 ORDER BY s.date`,[clubId,weekStart,weekEnd]),
    query<DashboardSchedule>(`SELECT e.id,e.title,e."startsAt",COALESCE(e.duration,s.duration) AS duration,e.location,COALESCE(e."groupId",a."groupId") AS "groupId",g.name AS "groupName",e."athleteId",s.id AS "sessionId",s.status AS "sessionStatus" FROM "PlanningEvent" e LEFT JOIN "Athlete" a ON a.id=e."athleteId" LEFT JOIN "TrainingGroup" g ON g.id=COALESCE(e."groupId",a."groupId") LEFT JOIN "TrainingSession" s ON s."planningEventId"=e.id WHERE e."clubId"=$1 AND e.type='TRAINING_SCHEDULE' AND e."cancelledAt" IS NULL AND e."calendarHiddenAt" IS NULL AND e."startsAt">=$2 AND e."startsAt"<$3 ORDER BY e."startsAt"`,[clubId,weekStart,weekEnd]),
    query<{athleteId:string;sessionId:string;status:string;completedAt:Date|null;startedAt:Date|null;firstName:string;lastName:string;title:string}>(`SELECT c."athleteId",c."sessionId",c.status,c."completedAt",c."startedAt",u."firstName",u."lastName",s.title FROM "AthleteSessionCompletion" c JOIN "TrainingSession" s ON s.id=c."sessionId" LEFT JOIN "PlanningEvent" pe ON pe.id=s."planningEventId" JOIN "TrainingWeek" w ON w.id=s."weekId" JOIN "Athlete" a ON a.id=c."athleteId" JOIN "User" u ON u.id=a."userId" WHERE w."clubId"=$1 AND s.date >= $2 AND s.date < $3 AND c.status IN ('IN_PROGRESS','SKIPPED') AND (c.status='SKIPPED' OR s.date + (COALESCE(pe.duration,s.duration) + 30) * INTERVAL '1 minute' > $4) ORDER BY s.date DESC,u."firstName" ASC`,[clubId,weekStart,weekEnd,today]),
    query<SessionRow>(`SELECT s.id,s.title,s.date,COALESCE(pe.duration,s.duration) AS duration,s.status,s."planningEventId",g.name AS "groupName" FROM "TrainingSession" s JOIN "TrainingWeek" w ON w.id=s."weekId" JOIN "TrainingGroup" g ON g.id=w."groupId" LEFT JOIN "PlanningEvent" pe ON pe.id=s."planningEventId" WHERE w."clubId"=$1 AND s."calendarHiddenAt" IS NULL AND s.status NOT IN ('COMPLETED','CANCELLED') AND s.date>$2 AND s.date<$3 ORDER BY s.date ASC LIMIT 1`,[clubId,today,weekEnd]),
    query<SessionRow>(`SELECT s.id,s.title,s.date,COALESCE(pe.duration,s.duration) AS duration,s.status,s."planningEventId",g.name AS "groupName" FROM "TrainingSession" s JOIN "TrainingWeek" w ON w.id=s."weekId" JOIN "TrainingGroup" g ON g.id=w."groupId" LEFT JOIN "PlanningEvent" pe ON pe.id=s."planningEventId" WHERE w."clubId"=$1 AND s."calendarHiddenAt" IS NULL AND s.status <> 'CANCELLED' AND s.date<=$2 AND (s.status='COMPLETED' OR (s.status IN ('READY','IN_PROGRESS') AND s.date + (COALESCE(pe.duration,s.duration) + 30) * INTERVAL '1 minute' <= $2)) ORDER BY s.date DESC LIMIT 1`,[clubId,today]),
  ]);
  const athleteAvatarUrls = await resolveAvatarUrls(athleteRows.rows.map((athlete) => athlete.avatar));
  const activeAthletes=athleteRows.rows.map((a,index)=>({id:a.id,user:{firstName:a.firstName,lastName:a.lastName,avatar:athleteAvatarUrls[index]},group:a.groupName?{id:a.groupId!,name:a.groupName}:null}));
  const rawSessions=await loadDashboardSessions([...weekSessionRows.rows,...nextRows.rows,...latestRows.rows]);
  const schedules=scheduleRows.rows;
  const recentCompletions=completionRows.rows;

  const sessions: DashboardSession[] = rawSessions.map(toDashboardSession).map((session) => (
    (session.status === "READY" || session.status === "IN_PROGRESS") && shouldCompleteSession(session.date, session.duration, today)
      ? { ...session, status: "COMPLETED" }
      : session
  ));
  const primarySession = pickPrimarySession(sessions, today);
  const isRecentSession = primarySession?.status === "COMPLETED";
  const activeSessionIds = new Set(sessions.filter((session) => sessionIsWithinActiveWindow(session, today) && (session.status === "IN_PROGRESS" || session.completions.some((completion) => completion.status === "IN_PROGRESS"))).map((session) => session.id));
  const groups = summarizeGroups(activeAthletes, groupRows.rows);
  const dashboardAthletes = activeAthletes.map((athlete) => ({
    id: athlete.id,
    firstName: athlete.user.firstName,
    lastName: athlete.user.lastName,
    avatar: athlete.user.avatar
  }));
  const weekAssignments = sessions.filter((session) => session.date >= weekStart && session.date < weekEnd);
  const scheduledAthleteIds = new Set(weekAssignments.flatMap((session) => uniqueAssignedIds(session.blocks)));
  for (const schedule of schedules) {
    const expected = schedule.athleteId ? activeAthletes.filter((athlete) => athlete.id === schedule.athleteId) : schedule.groupId ? activeAthletes.filter((athlete) => athlete.group?.id === schedule.groupId) : activeAthletes;
    expected.forEach((athlete) => scheduledAthleteIds.add(athlete.id));
  }
  const athletesWithoutSession = activeAthletes.filter((athlete) => !scheduledAthleteIds.has(athlete.id));
  const drafts = weekAssignments.filter((session) => session.status === "DRAFT");
  const followupsBySession = recentCompletions.reduce((map, completion) => {
    const entries = map.get(completion.sessionId) ?? [];
    entries.push(completion);
    map.set(completion.sessionId, entries);
    return map;
  }, new Map<string, typeof recentCompletions>());
  const dashboardAlerts: DashboardAlert[] = [
    ...(athletesWithoutSession.length ? [{ id: "athletes-without-session", title: `${athletesWithoutSession.length} athlète${athletesWithoutSession.length === 1 ? "" : "s"} sans séance cette semaine`, detail: formatAthleteNames(athletesWithoutSession.map((athlete) => athlete.user)), href: "/coach/athletes", tone: "rose" as const }] : []),
    ...Array.from(followupsBySession, ([sessionId, entries]) => ({ id: `followup-${sessionId}`, title: `${entries.length} suivi${entries.length === 1 ? "" : "s"} à compléter`, detail: `${formatAthleteNames(entries)} · ${entries[0].title}`, href: `/coach/sessions/${sessionId}`, tone: "amber" as const })),
    ...drafts.slice(0, 2).map((session) => ({ id: `draft-${session.id}`, title: "Séance à publier", detail: `${session.title} · ${formatMontrealDate(session.date, { weekday: "long", day: "numeric", month: "long" })}`, href: `/coach/sessions/${session.id}/edit`, tone: "cyan" as const })),
  ];

  return (
    <CoachShell active="Accueil" compactHeader>
      <div className="mb-5 flex flex-col justify-between gap-2 px-1 sm:flex-row sm:items-end print:hidden">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-[var(--color-navy)] sm:text-4xl">Bonjour {user.firstName} 👋</h1>
          <p className="mt-1 text-base font-medium text-[var(--color-ink-muted)]">Voici ce qui se passe avec tes groupes cette semaine.</p>
        </div>
        <p className="hidden items-center gap-2 pb-1 text-xs font-bold capitalize text-[var(--color-ink-muted)] sm:flex"><CalendarDays className="h-4 w-4"/>{formatMontrealDate(today, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
      </div>

      <div className="grid gap-4 print:hidden 2xl:grid-cols-[1.6fr_1fr]">
        <TodayCard session={primarySession} activeSessionIds={activeSessionIds} athletes={dashboardAthletes} recent={isRecentSession} />
        <QuickReadCard sessions={sessions} schedules={schedules} activeAthletes={activeAthletes} weekStart={weekStart} weekStartsOn={weekStartsOn} />
      </div>

      <section className="mt-6 print:mt-0">
        <div className="mb-3 flex items-center justify-between gap-4 px-1">
          <h2 className="text-lg font-black tracking-tight">Planning de la semaine</h2>
          <Link href="/coach/planning" className="inline-flex items-center gap-1 text-xs font-black text-[var(--color-brand-strong)] hover:underline">Voir le planning complet <ArrowRight className="h-3.5 w-3.5"/></Link>
        </div>
        <div className="rounded-2xl border border-white/80 bg-white/70 p-2 shadow-[var(--shadow-card)] print:border-0 print:shadow-none"><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7 print:grid-cols-7">
          {weekDays(weekStart, weekStartsOn).map((day) => <WeekDayCard key={day.key} day={day} sessions={sessions.filter((session) => !session.planningEventId && sameMontrealDay(session.date, day.date))} schedules={schedules.filter((schedule) => sameMontrealDay(schedule.startsAt, day.date))} />)}
        </div></div>
      </section>

      <div className="mt-4 grid gap-3 print:hidden xl:grid-cols-2 2xl:grid-cols-[1.1fr_0.9fr_0.8fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2 pb-3"><div><CardTitle className="text-base">Groupes et athlètes</CardTitle><p className="mt-1 text-[11px] text-[var(--color-ink-muted)]">{groups.length} groupes · {activeAthletes.length} athlètes actifs</p></div><Link className="shrink-0 text-xs font-black text-[var(--color-brand-strong)]" href="/coach/groups">Tous les groupes <ArrowRight className="inline h-3 w-3"/></Link></CardHeader>
          <CardContent className="space-y-3">
            {groups.map((group) => (
              <Link href={group.id ? `/coach/groups/${group.id}` : "/coach/athletes"} key={group.id || group.name} className="flex min-h-16 items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3 transition hover:border-[var(--color-brand)]">
                <div className="flex items-center justify-between gap-3">
                <div><div className="text-sm font-black">{group.name}</div><div className="text-xs text-[var(--color-ink-muted)]">{group.count} athlètes actifs</div></div>
                </div>
                  <AthleteAvatarGroup ids={group.ids} athletes={dashboardAthletes} limit={4} /><ChevronRight className="h-4 w-4 shrink-0 text-[var(--color-ink-soft)]"/>
              </Link>
            ))}
            {groups.length === 0 && <EmptyState title="Aucun athlète actif" description="Ajoutez des athlètes pour afficher les groupes et leur activité." action={<Button asChild><Link href="/coach/athletes">Ouvrir les athlètes</Link></Button>} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">À surveiller</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {dashboardAlerts.map((alert) => <Link key={alert.id} href={alert.href} className={`flex min-h-14 items-center gap-3 rounded-xl px-3 py-2 transition hover:brightness-[.98] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${alert.tone === "rose" ? "bg-rose-50" : alert.tone === "amber" ? "bg-amber-50" : "bg-cyan-50"}`}>
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white ${alert.tone === "rose" ? "bg-rose-500" : alert.tone === "amber" ? "bg-amber-500" : "bg-cyan-500"}`}>{alert.tone === "rose" ? <AlertCircle className="h-4 w-4"/> : alert.tone === "amber" ? <Clock4 className="h-4 w-4"/> : <ClipboardCheck className="h-4 w-4"/>}</span>
              <span className="min-w-0 flex-1"><strong className="block truncate text-xs">{alert.title}</strong><span className="block truncate text-[11px] text-[var(--color-ink-muted)]">{alert.detail}</span></span><ChevronRight className="h-4 w-4 shrink-0 text-[var(--color-ink-muted)]"/>
            </Link>)}
            {dashboardAlerts.length === 0 && <EmptyState title="Tout est à jour" description="Aucun athlète sans séance ni suivi ouvert pour le moment." />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Accès rapide</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Shortcut href={clubId === "dev-club" ? "/coach/sessions/demo" : "/coach/sessions/new"} label="Créer une séance" icon={CalendarPlus} primary />
            <Shortcut href="/coach/athletes" label="Voir les athlètes" icon={Users} />
            <Shortcut href="/coach/planning" label="Voir le planning" icon={CalendarDays} />
            <PrintButton label="Imprimer le planning" className="w-full justify-between text-xs" />
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
    date: addMontrealDays(weekStart, index),
    duration: session.duration,
    status: session.status === "Brouillon" ? "DRAFT" : session.status === "Complete" ? "COMPLETED" : "READY",
    groupName: demoSession.group,
    blocks: demoSession.blocks.map((block) => ({ type: block.type, estimatedVolume: block.volume, assignments: block.assignedTo.map((athleteId) => ({ athleteId })) })),
    completions: []
    ,planningEventId: null
  })) satisfies DashboardSession[];
  const now = new Date();
  const primarySession = pickPrimarySession(sessions, now);
  const isRecentSession = primarySession?.status === "COMPLETED";
  const demoAssignedIds = Array.from(new Set(sessions.flatMap((session) => uniqueAssignedIds(session.blocks))));
  const activeSessionIds = new Set<string>();

  return (
    <CoachShell active="Accueil" compactHeader>
      <div className="mb-5 flex flex-col justify-between gap-2 px-1 sm:flex-row sm:items-end print:hidden">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-[var(--color-navy)] sm:text-4xl">Bonjour {userName.split(" ")[0]} 👋</h1>
          <p className="mt-1 text-base font-medium text-[var(--color-ink-muted)]">Voici ce qui se passe avec tes groupes cette semaine.</p>
        </div>
      </div>

      <div className="grid gap-4 print:hidden 2xl:grid-cols-[1.6fr_1fr]">
        <TodayCard session={primarySession} activeSessionIds={activeSessionIds} athletes={athletes} demo recent={isRecentSession} />
        <QuickReadCard sessions={sessions} schedules={[]} activeAthletes={athletes.map((athlete) => ({ id: athlete.id, group: { id: "demo-group", name: demoSession.group } }))} weekStart={weekStart} weekStartsOn={1} />
      </div>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between gap-4 px-1">
          <h2 className="text-lg font-black tracking-tight">Planning de la semaine</h2>
          <Link href="/coach/planning" className="inline-flex items-center gap-1 text-xs font-black text-[var(--color-brand-strong)] hover:underline">Voir le planning complet <ArrowRight className="h-3.5 w-3.5"/></Link>
        </div>
        <div className="rounded-2xl border border-white/80 bg-white/70 p-2 shadow-[var(--shadow-card)] print:border-0 print:shadow-none"><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7 print:grid-cols-7">
          {weekDays(weekStart).map((day) => <WeekDayCard key={day.key} day={day} sessions={sessions.filter((session) => sameMontrealDay(session.date, day.date))} schedules={[]} demo />)}
        </div></div>
      </section>

      <div className="mt-4 grid gap-3 print:hidden xl:grid-cols-2 2xl:grid-cols-[1.1fr_0.9fr_0.8fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-3"><CardTitle className="text-base">Groupes et athlètes</CardTitle><Link className="text-xs font-black text-[var(--color-brand-strong)]" href="/coach/groups">Tous les groupes <ArrowRight className="inline h-3 w-3"/></Link></CardHeader>
          <CardContent>
            <Link href="/coach/groups" className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3"><div><div className="text-sm font-black">{demoSession.group}</div><div className="text-xs text-[var(--color-ink-muted)]">{demoAssignedIds.length} athlètes actifs</div></div><AthleteAvatarGroup ids={demoAssignedIds} athletes={athletes} limit={4} /><ChevronRight className="h-4 w-4 text-[var(--color-ink-soft)]"/></Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">À surveiller</CardTitle></CardHeader>
          <CardContent><EmptyState title="Tout est à jour" description="Aucun suivi ouvert dans les données de démonstration." /></CardContent>
        </Card>
        <Card><CardHeader className="pb-3"><CardTitle className="text-base">Accès rapide</CardTitle></CardHeader><CardContent className="space-y-2"><Shortcut href="/coach/sessions/demo" label="Créer une séance" icon={CalendarPlus} primary/><Shortcut href="/coach/athletes" label="Voir les athlètes" icon={Users}/><PrintButton label="Imprimer le planning" className="w-full justify-between text-xs" /></CardContent></Card>
      </div>
    </CoachShell>
  );
}

function TodayCard({ session, activeSessionIds, athletes, demo = false, recent = false }: { session?: DashboardSession; activeSessionIds: Set<string>; athletes: AvatarAthlete[]; demo?: boolean; recent?: boolean }) {
  if (!session) {
    return (
      <Card className="overflow-hidden border-[var(--color-navy)] bg-[var(--color-navy)] text-white">
        <CardContent className="p-6">
          <p className="text-sm font-black uppercase text-[var(--color-brand)]">Prochaine séance</p>
          <h2 className="mt-4 text-3xl font-black leading-tight text-white sm:text-4xl">Aucune séance à venir</h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-white/75">Consulte le calendrier ou crée une séance pour préparer la suite.</p>
          <Button asChild variant="action" size="lg" className="mt-6 bg-[#0969ef] shadow-none hover:bg-[#0757cc]"><Link href={demo ? "/coach/sessions/demo" : "/coach/sessions/new"}><CalendarPlus className="h-5 w-5" /> Créer une séance</Link></Button>
        </CardContent>
      </Card>
    );
  }

  const effectiveStatus = session.status === "COMPLETED" ? "COMPLETED" : activeSessionIds.has(session.id) ? "IN_PROGRESS" : session.status;
  const action = getPrimaryAction(session, effectiveStatus, demo, recent);
  const assignedIds = uniqueAssignedIds(session.blocks);
  const volume = session.blocks.reduce((sum, block) => sum + block.estimatedVolume, 0);

  return (
      <Card className="relative overflow-hidden border-[var(--color-navy)] bg-[radial-gradient(ellipse_at_75%_5%,rgba(0,178,204,.38),transparent_42%),linear-gradient(115deg,#061626_0%,#0a243b_58%,#0b3c53_100%)] text-white">
      <CardContent className="relative p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] font-black uppercase tracking-wide text-[var(--color-brand)]">{recent ? "Dernière séance terminée" : "Prochaine séance"}</p>
          <div className="flex flex-wrap items-center gap-2"><StatusPill status={String(effectiveStatus)} /><span className="text-xs font-bold text-white/75">{formatMontrealDate(session.date,{weekday:"long",day:"numeric",month:"long",year:"numeric"})} · {formatMontrealTime(session.date)} – {formatMontrealTime(addMinutes(session.date, session.duration))}</span></div>
        </div>
        <h2 className="mt-2 max-w-2xl text-3xl font-black leading-tight text-white sm:text-4xl">{session.title}</h2>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <DarkMetric icon={Clock3} label="Durée" value={`${session.duration} min`} />
          <DarkMetric icon={Users} label="Athlètes" value={assignedIds.length} />
          <DarkMetric icon={Timer} label="Plongeons" value={volume} />
          <DarkMetric icon={ListChecks} label="Blocs" value={session.blocks.length} />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3"><AthleteAvatarGroup ids={assignedIds} athletes={athletes} limit={6} /><div className="flex flex-wrap gap-1.5">{uniqueBlockTypes(session.blocks).map((type) => <BlockTypeBadge key={String(type)} type={String(type)} />)}</div></div>
          <Button asChild variant="action" size="default" className="min-h-12 min-w-36 bg-[#0969ef] shadow-none hover:bg-[#0757cc]">
            <Link href={action.href}>{action.label} <ArrowRight className="h-5 w-5" /></Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function WeekDayCard({ day, sessions, schedules, demo = false }: { day: { key: number; label: string; date: Date }; sessions: DashboardSession[]; schedules: DashboardSchedule[]; demo?: boolean }) {
  const isToday = sameMontrealDay(day.date, new Date());
  return (
    <Card id={`day-${day.key}`} className={`min-h-36 scroll-mt-28 rounded-xl transition-colors motion-reduce:transition-none ${isToday ? "border-blue-500 bg-blue-50/70 shadow-[0_0_0_1px_#3b82f6]" : "bg-white"}`}>
      <CardContent className="p-2.5">
        <div className="mb-2 flex items-start justify-between gap-1.5">
          <div className="min-w-0"><div className="truncate text-xs font-black">{day.label}</div><div className="text-[10px] font-bold text-[var(--color-ink-soft)]">{formatMontrealDate(day.date, { day: "2-digit", month: "short" })}</div></div>
          <span className="shrink-0 text-[10px] font-bold text-[var(--color-ink-soft)]">{sessions.length + schedules.length || "Repos"}</span>
        </div>
        <div className="space-y-3">
          {sessions.map((session) => {
            const completed = session.status === "COMPLETED";
            return (
              <div key={session.id} className={`rounded-lg border p-2.5 ${completed ? "border-emerald-200 bg-emerald-50/80" : session.status === "DRAFT" ? "border-amber-200 bg-amber-50/80" : "border-sky-200 bg-sky-50/80"}`}>
                <div className="text-[10px] font-black text-[var(--color-brand-strong)]">{formatMontrealTime(session.date)}</div>
                <Link href={demo ? "/coach/sessions/demo" : `/coach/sessions/${session.id}`} className="mt-1 block text-xs font-black leading-snug hover:text-[var(--color-brand-strong)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">{session.title}</Link>
                <div className="mt-1 text-[10px] leading-tight text-[var(--color-ink-muted)]">{session.groupName}</div>
                <div className="mt-1.5 flex flex-wrap gap-1">{uniqueBlockTypes(session.blocks).map((type) => <BlockTypeBadge key={String(type)} type={String(type)} className="px-1.5 py-0.5 text-[9px]" />)}</div>
                <div className={`mt-2 flex items-center gap-1.5 text-[10px] font-bold ${completed ? "text-emerald-700" : session.status === "DRAFT" ? "text-amber-800" : "text-sky-800"}`}><CircleCheck className="h-3.5 w-3.5"/>{completed ? "Séance terminée" : session.status === "DRAFT" ? "Brouillon à publier" : "Séance planifiée"}</div>
              </div>
            );
          })}
          {schedules.map((schedule) => <div key={schedule.id} className={`rounded-lg border p-2.5 ${schedule.sessionStatus === "COMPLETED" ? "border-emerald-200 bg-emerald-50/80" : "border-sky-200 bg-sky-50/80"}`}>
            <div className="text-[10px] font-black text-[var(--color-brand-strong)]">{formatMontrealTime(schedule.startsAt)}</div>
            <Link href={schedule.sessionId ? `/coach/sessions/${schedule.sessionId}` : "/coach/planning"} className="mt-1 block text-xs font-black leading-snug hover:text-[var(--color-brand-strong)]">{schedule.title}</Link>
            <div className="mt-1 text-[10px] leading-tight text-[var(--color-ink-muted)]">{schedule.groupName ?? "Club complet"}{schedule.location ? ` · ${schedule.location}` : ""}</div>
            <div className={`mt-2 flex items-center gap-1.5 text-[10px] font-bold ${schedule.sessionStatus === "COMPLETED" ? "text-emerald-700" : "text-sky-800"}`}><CircleCheck className="h-3.5 w-3.5"/>{schedule.sessionStatus === "COMPLETED" ? "Séance terminée" : schedule.sessionId ? "Séance planifiée" : "Entraînement à préparer"}</div>
          </div>)}
          {sessions.length === 0 && schedules.length === 0 && <div className="flex min-h-14 items-center justify-center rounded-lg border border-dashed border-[var(--color-border-strong)] px-2 py-3 text-center text-[11px] font-semibold text-[var(--color-ink-soft)]">Aucune séance prévue</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function QuickReadCard({ sessions, schedules, activeAthletes, weekStart, weekStartsOn }: {
  sessions: DashboardSession[];
  schedules: DashboardSchedule[];
  activeAthletes: Array<{ id: string; group: { id: string; name: string } | null }>;
  weekStart: Date;
  weekStartsOn: 0 | 1;
}) {
  const weekEnd = addMontrealDays(weekStart, 7);
  const weekSessions = sessions.filter((item) => item.date >= weekStart && item.date < weekEnd);
  const weekSchedules = schedules.filter((item) => item.startsAt >= weekStart && item.startsAt < weekEnd);
  const sessionCount = weekSessions.filter((session) => !session.planningEventId).length + weekSchedules.length;
  const expectedAthletes = new Set(weekSessions.flatMap((item) => uniqueAssignedIds(item.blocks)));
  for (const schedule of weekSchedules) {
    if (schedule.athleteId) expectedAthletes.add(schedule.athleteId);
    else activeAthletes.filter((athlete) => !schedule.groupId || athlete.group?.id === schedule.groupId).forEach((athlete) => expectedAthletes.add(athlete.id));
  }
  const athleteCount = expectedAthletes.size;
  const completedCount = weekSessions.filter((session) => session.status === "COMPLETED").length;
  const progress = sessionCount ? Math.round(completedCount / sessionCount * 100) : 0;
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3"><CardTitle className="text-base">Cette semaine</CardTitle></CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2.5 rounded-xl bg-[var(--color-surface-raised)] p-3"><CalendarPlus className="h-6 w-6 shrink-0 text-[var(--color-brand-strong)]"/><div><strong className="block text-2xl leading-none">{sessionCount}</strong><span className="text-[11px] text-[var(--color-ink-muted)]">séances planifiées</span></div></div>
            <div className="flex items-center gap-2.5 rounded-xl bg-[var(--color-surface-raised)] p-3"><Users className="h-6 w-6 shrink-0 text-[var(--color-brand-strong)]"/><div><strong className="block text-2xl leading-none">{athleteCount}</strong><span className="text-[11px] text-[var(--color-ink-muted)]">athlètes attendus</span></div></div>
          </div>
          <div className="border-t border-[var(--color-border)] pt-3">
            <div className="mb-2 flex items-center justify-between text-xs font-bold"><span className="flex items-center gap-2"><Timer className="h-4 w-4 text-[var(--color-brand-strong)]"/>Progression de la semaine</span><span>{completedCount} / {sessionCount} séances</span></div>
            <div role="progressbar" aria-label="Séances terminées cette semaine" aria-valuenow={completedCount} aria-valuemin={0} aria-valuemax={sessionCount} className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-teal-300 to-teal-400 transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${progress}%` }} /></div>
          </div>
          <div className="grid grid-cols-7 gap-1.5 pt-1">
            {weekDays(weekStart, weekStartsOn).map((day) => {
              const count = weekSessions.filter((session) => !session.planningEventId && sameMontrealDay(session.date, day.date)).length + weekSchedules.filter((schedule) => sameMontrealDay(schedule.startsAt, day.date)).length;
              const completed = weekSessions.some((session) => session.status === "COMPLETED" && sameMontrealDay(session.date, day.date));
              const isToday = sameMontrealDay(day.date, new Date());
              return <Link key={day.key} href={`#day-${day.key}`} aria-label={`${day.label} ${formatMontrealDate(day.date, { day: "numeric", month: "long" })}, ${count} séance${count === 1 ? "" : "s"}`} className={`grid min-h-16 place-items-center rounded-lg border px-1 py-2 text-center transition-colors motion-reduce:transition-none ${isToday ? "border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500" : "border-[var(--color-border)] bg-white text-[var(--color-ink-muted)] hover:border-blue-300"}`}><span className="text-[9px] font-bold uppercase">{day.label.slice(0, 3)}</span><span className="text-xs font-black">{formatMontrealDate(day.date, { day: "numeric" })}</span><span className={`h-2 w-2 rounded-full ${completed ? "bg-emerald-500" : count ? "bg-sky-400" : "bg-slate-300"}`} /></Link>;
            })}
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
    <Button asChild variant={primary ? "action" : "outline"} className={`w-full justify-between text-xs ${primary ? "bg-[#0969ef] shadow-[0_8px_20px_rgba(9,105,239,.22)] hover:bg-[#0757cc]" : ""}`}>
      <Link href={href}><span className="inline-flex items-center gap-2"><Icon className="h-4 w-4" /> {label}</span><ArrowRight className="h-4 w-4" /></Link>
    </Button>
  );
}

function getPrimaryAction(session: DashboardSession, status: string, demo: boolean, recent = false) {
  const base = demo ? "/coach/sessions/demo" : `/coach/sessions/${session.id}`;
  if (recent && status === "COMPLETED") return { label: "Consulter le bilan", href: base };
  if (status === "DRAFT") return { label: "Préparer la séance", href: `${base}/edit` };
  if (status === "IN_PROGRESS") return { label: "Poursuivre", href: base };
  return { label: "Ouvrir la séance", href: base };
}

function pickPrimarySession(sessions: DashboardSession[], now: Date) {
  const active = sessions.filter((session) => session.date <= now && sessionIsWithinActiveWindow(session, now) && (session.status === "IN_PROGRESS" || session.completions.some((completion) => completion.status === "IN_PROGRESS"))).sort((left, right) => left.date.getTime() - right.date.getTime())[0];
  const upcoming = sessions.filter((session) => session.date >= now && session.status !== "COMPLETED" && session.status !== "IN_PROGRESS").sort((left, right) => left.date.getTime() - right.date.getTime())[0];
  const recent = sessions.filter((session) => session.date <= now && session.status === "COMPLETED").sort((left, right) => right.date.getTime() - left.date.getTime())[0];
  return active ?? upcoming ?? recent;
}

function sessionIsWithinActiveWindow(session: DashboardSession, now: Date) {
  const endsAt = session.date.getTime() + (session.duration + 30) * 60_000;
  return session.date.getTime() <= now.getTime() && now.getTime() < endsAt;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function formatAthleteNames(athletes: Array<{ firstName: string; lastName: string }>) {
  const names = athletes.map((athlete) => `${athlete.firstName} ${athlete.lastName}`);
  const shownNames = names.slice(0, 3);
  const remainingCount = names.length - shownNames.length;
  return `${shownNames.join(", ")}${remainingCount > 0 ? ` et ${remainingCount} autre${remainingCount === 1 ? "" : "s"}` : ""}`;
}

function toDashboardSession(session: {
  id: string;
  title: string;
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

function summarizeGroups(activeAthletes: Array<{ id: string; group: { id: string; name: string } | null }>, groupRows: GroupRow[] = []) {
  const groups = new Map<string, { id: string; name: string; count: number; ids: string[] }>();
  for (const group of groupRows) groups.set(group.id, { id: group.id, name: group.name, count: 0, ids: [] });
  for (const athlete of activeAthletes) {
    const name = athlete.group?.name ?? "Sans groupe";
    const id = athlete.group?.id ?? "";
    const key = id || "unassigned";
    const group = groups.get(key) ?? { id, name, count: 0, ids: [] };
    group.count += 1;
    group.ids.push(athlete.id);
    groups.set(key, group);
  }
  return Array.from(groups.values());
}

function uniqueAssignedIds(blocks: DashboardSession["blocks"]) {
  return Array.from(new Set(blocks.flatMap((block) => block.assignments.map((assignment) => assignment.athleteId))));
}

function uniqueBlockTypes(blocks: DashboardSession["blocks"]) {
  return Array.from(new Set(blocks.map((block) => block.type)));
}

function weekDays(weekStart: Date, weekStartsOn: 0 | 1 = 1) {
  const labels = weekStartsOn === 0 ? ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"] : ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
  return labels.map((label, index) => ({ key: index + 1, label, date: addMontrealDays(weekStart, index) }));
}
