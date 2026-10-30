import Link from "@/components/ui/app-link";
import { redirect } from "next/navigation";
import { ArrowRight, AlertCircle, CalendarDays, CalendarPlus, ChevronRight, Clock3, ListChecks, Timer, Users, ClipboardCheck, CircleCheck, CircleX, Clock4, FileText } from "lucide-react";
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
    query<SessionRow>(`SELECT s.id,s.title,s.date,COALESCE(pe.duration,s.duration) AS duration,s.status,s."planningEventId",g.name AS "groupName" FROM "TrainingSession" s JOIN "TrainingWeek" w ON w.id=s."weekId" JOIN "TrainingGroup" g ON g.id=w."groupId" LEFT JOIN "PlanningEvent" pe ON pe.id=s."planningEventId" WHERE w."clubId"=$1 AND s."calendarHiddenAt" IS NULL AND s.date >= $2 AND s.date < $3 ORDER BY s.date`,[clubId,weekStart,weekEnd]),
    query<DashboardSchedule>(`SELECT e.id,e.title,e."startsAt",COALESCE(e.duration,s.duration) AS duration,e.location,COALESCE(e."groupId",a."groupId") AS "groupId",g.name AS "groupName",e."athleteId",s.id AS "sessionId",s.status AS "sessionStatus" FROM "PlanningEvent" e LEFT JOIN "Athlete" a ON a.id=e."athleteId" LEFT JOIN "TrainingGroup" g ON g.id=COALESCE(e."groupId",a."groupId") LEFT JOIN "TrainingSession" s ON s."planningEventId"=e.id WHERE e."clubId"=$1 AND e.type='TRAINING_SCHEDULE' AND e."cancelledAt" IS NULL AND e."calendarHiddenAt" IS NULL AND e."startsAt">=$2 AND e."startsAt"<$3 ORDER BY e."startsAt"`,[clubId,weekStart,weekEnd]),
    query<{athleteId:string;sessionId:string;status:string;completedAt:Date|null;startedAt:Date|null;firstName:string;lastName:string;title:string}>(`SELECT c."athleteId",c."sessionId",c.status,c."completedAt",c."startedAt",u."firstName",u."lastName",s.title FROM "AthleteSessionCompletion" c JOIN "TrainingSession" s ON s.id=c."sessionId" LEFT JOIN "PlanningEvent" pe ON pe.id=s."planningEventId" JOIN "TrainingWeek" w ON w.id=s."weekId" JOIN "Athlete" a ON a.id=c."athleteId" JOIN "User" u ON u.id=a."userId" WHERE w."clubId"=$1 AND s.date >= $2 AND s.date < $3 AND c.status IN ('IN_PROGRESS','SKIPPED') AND (c.status='SKIPPED' OR s.date + (COALESCE(pe.duration,s.duration) + 30) * INTERVAL '1 minute' > $4) ORDER BY s.date DESC,u."firstName" ASC`,[clubId,weekStart,weekEnd,today]),
    query<SessionRow>(`SELECT s.id,s.title,s.date,COALESCE(pe.duration,s.duration) AS duration,s.status,s."planningEventId",g.name AS "groupName" FROM "TrainingSession" s JOIN "TrainingWeek" w ON w.id=s."weekId" JOIN "TrainingGroup" g ON g.id=w."groupId" LEFT JOIN "PlanningEvent" pe ON pe.id=s."planningEventId" WHERE w."clubId"=$1 AND s."calendarHiddenAt" IS NULL AND s.status NOT IN ('COMPLETED','CANCELLED') AND s.date>$2 AND s.date<$3 ORDER BY s.date ASC LIMIT 1`,[clubId,today,weekEnd]),
    query<SessionRow>(`SELECT s.id,s.title,s.date,COALESCE(pe.duration,s.duration) AS duration,s.status,s."planningEventId",g.name AS "groupName" FROM "TrainingSession" s JOIN "TrainingWeek" w ON w.id=s."weekId" JOIN "TrainingGroup" g ON g.id=w."groupId" LEFT JOIN "PlanningEvent" pe ON pe.id=s."planningEventId" WHERE w."clubId"=$1 AND s."calendarHiddenAt" IS NULL AND s.status <> 'CANCELLED' AND s.date<=$2 AND (s.status='COMPLETED' OR (s.status IN ('READY','IN_PROGRESS') AND s.date + (COALESCE(pe.duration,s.duration) + 30) * INTERVAL '1 minute' <= $2)) ORDER BY s.date DESC LIMIT 1`,[clubId,today]),
  ]);
  const athleteAvatarUrls = await resolveAvatarUrls(athleteRows.rows.map((athlete) => athlete.avatar));
  const activeAthletes=athleteRows.rows.map((a,index)=>({id:a.id,user:{firstName:a.firstName,lastName:a.lastName,avatar:athleteAvatarUrls[index]},group:a.groupName?{id:a.groupId!,name:a.groupName}:null}));
  const rawSessions=await loadDashboardSessions([...weekSessionRows.rows,...nextRows.rows,...latestRows.rows]);
  const sessions: DashboardSession[] = rawSessions.map(toDashboardSession).map((session) => (
    (session.status === "READY" || session.status === "IN_PROGRESS") && shouldCompleteSession(session.date, session.duration, today)
      ? { ...session, status: "COMPLETED" }
      : session
  ));
  const effectiveSessionStatus = new Map(sessions.map((session) => [session.id, session.status]));
  const schedules = scheduleRows.rows.map((schedule) => schedule.sessionId && effectiveSessionStatus.has(schedule.sessionId)
    ? { ...schedule, sessionStatus: effectiveSessionStatus.get(schedule.sessionId)! }
    : schedule);
  const recentCompletions=completionRows.rows;
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
  const scheduledAthleteIds = new Set(weekAssignments.filter((session) => session.status !== "CANCELLED").flatMap((session) => uniqueAssignedIds(session.blocks)));
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
      <div className="mb-5 px-1 print:hidden">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-[var(--color-navy)] sm:text-4xl">Bonjour {user.firstName},</h1>
          <p className="mt-1 text-base font-medium text-[var(--color-ink-muted)]">Voici ce qui se passe avec tes groupes cette semaine.</p>
        </div>
      </div>

      <div className="grid gap-4 print:hidden lg:grid-cols-2">
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
          <h1 className="text-3xl font-black tracking-tight text-[var(--color-navy)] sm:text-4xl">Bonjour {userName.split(" ")[0]},</h1>
          <p className="mt-1 text-base font-medium text-[var(--color-ink-muted)]">Voici ce qui se passe avec tes groupes cette semaine.</p>
        </div>
      </div>

      <div className="grid gap-4 print:hidden lg:grid-cols-2">
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
      <Card className="min-h-[301px] overflow-hidden border-[#082e50] bg-[var(--color-navy)] text-white">
        <CardContent className="flex min-h-[280px] flex-col justify-center p-6">
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
    <Card className="relative h-full min-h-[301px] overflow-hidden rounded-[14px] border-[#082e50] bg-[radial-gradient(ellipse_at_96%_0%,rgba(8,181,200,.34),transparent_36%),linear-gradient(112deg,#071a38_0%,#07345d_58%,#063e70_100%)] text-white shadow-[0_10px_26px_rgba(3,27,54,.12)]">
      <CardContent className="relative flex min-h-[301px] flex-col p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-[.04em] text-[#16d9e5]">{recent ? "Dernière séance" : "Prochaine séance"}</p>
        </div>
        <h2 className="mt-2 text-[1.75rem] font-extrabold leading-tight text-white sm:text-[2rem]">{session.title}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm font-medium text-[#e4effa] sm:text-[15px]">
          <CalendarDays className="h-[22px] w-[22px] shrink-0 text-white" />
          <span>{capitalizeFirst(formatMontrealDate(session.date, { weekday: "long", day: "numeric", month: "short", year: "numeric" }))}</span>
          <span aria-hidden="true" className="hidden h-5 w-px bg-white/35 sm:block" />
          <Clock3 className="h-[22px] w-[22px] shrink-0 text-white" />
          <span>{formatMontrealTime(session.date)} – {formatMontrealTime(addMinutes(session.date, session.duration))} ({session.duration} min)</span>
        </div>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {uniqueBlockTypes(session.blocks).map((type) => <BlockTypeBadge key={String(type)} type={String(type)} className="min-h-11 rounded-full border border-white/10 bg-white/10 px-3 text-sm font-semibold text-white [&_svg]:text-[#32d6e6]" />)}
          </div>
          <AthleteAvatarGroup ids={assignedIds} athletes={athletes} limit={5} size="large" />
        </div>
        <div aria-hidden="true" className="my-4 h-px w-full bg-sky-100/20 sm:my-4" />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="grid w-full grid-cols-2 gap-x-3 gap-y-3 sm:w-auto sm:flex sm:flex-1 sm:items-center sm:gap-0">
            <FooterMetric icon={Users} value={assignedIds.length} label="athlètes" />
            <span aria-hidden="true" className="hidden h-12 w-px bg-sky-100/25 sm:block" />
            <FooterMetric icon={ListChecks} value={session.blocks.length} label="blocs" />
            <span aria-hidden="true" className="hidden h-12 w-px bg-sky-100/25 sm:block" />
            <FooterMetric icon={Timer} value={new Intl.NumberFormat("fr-CA").format(volume)} label="plongeons" />
          </div>
          <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:ml-auto sm:w-auto sm:justify-end sm:gap-3">
            <StatusPill status={String(effectiveStatus)} className={effectiveStatus === "COMPLETED" ? "min-h-8 border border-emerald-100/25 bg-emerald-300/15 px-3 text-emerald-100" : "min-h-8 px-3"} />
            <Button asChild variant="outline" className="h-14 min-h-14 w-full justify-between rounded-xl border border-blue-300/80 bg-blue-500/10 px-4 text-sm font-bold text-white transition-colors motion-reduce:transition-none hover:border-blue-200 hover:bg-blue-500/20 hover:text-white sm:w-auto sm:min-w-[190px]">
              <Link href={action.href}><span className="inline-flex items-center gap-2"><FileText className="h-4 w-4" />{action.label}</span><ArrowRight className="h-4 w-4" /></Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function WeekDayCard({ day, sessions, schedules, demo = false }: { day: { key: number; label: string; date: Date }; sessions: DashboardSession[]; schedules: DashboardSchedule[]; demo?: boolean }) {
  const isToday = sameMontrealDay(day.date, new Date());
  const cancelled = sessions.filter((session) => session.status === "CANCELLED").length + schedules.filter((schedule) => schedule.sessionStatus === "CANCELLED").length;
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
              <div key={session.id} className={`rounded-lg border p-2.5 ${completed ? "border-emerald-200 bg-emerald-50/80" : session.status === "CANCELLED" ? "border-rose-200 bg-rose-50/80" : session.status === "DRAFT" ? "border-amber-200 bg-amber-50/80" : "border-sky-200 bg-sky-50/80"}`}>
                <div className="text-[10px] font-black text-[var(--color-brand-strong)]">{formatMontrealTime(session.date)}</div>
                <Link href={demo ? "/coach/sessions/demo" : `/coach/sessions/${session.id}`} className="mt-1 block text-xs font-black leading-snug hover:text-[var(--color-brand-strong)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">{session.title}</Link>
                <div className="mt-1 text-[10px] leading-tight text-[var(--color-ink-muted)]">{session.groupName}</div>
                <div className="mt-1.5 flex flex-wrap gap-1">{uniqueBlockTypes(session.blocks).map((type) => <BlockTypeBadge key={String(type)} type={String(type)} className="px-1.5 py-0.5 text-[9px]" />)}</div>
                <div className={`mt-2 flex items-center gap-1.5 text-[10px] font-bold ${completed ? "text-emerald-700" : session.status === "CANCELLED" || session.status === "NOT_DONE" ? "text-rose-700" : session.status === "DRAFT" ? "text-amber-800" : "text-sky-800"}`}>{completed ? <CircleCheck className="h-3.5 w-3.5"/> : session.status === "CANCELLED" ? <CircleX className="h-3.5 w-3.5"/> : <Clock3 className="h-3.5 w-3.5"/>}{completed ? "Séance terminée" : session.status === "CANCELLED" ? "Séance annulée" : session.status === "NOT_DONE" ? "Séance non tenue" : session.status === "DRAFT" ? "Brouillon à publier" : session.status === "IN_PROGRESS" ? "Séance en cours" : "Séance planifiée"}</div>
              </div>
            );
          })}
          {schedules.map((schedule) => <div key={schedule.id} className={`rounded-lg border p-2.5 ${schedule.sessionStatus === "COMPLETED" ? "border-emerald-200 bg-emerald-50/80" : schedule.sessionStatus === "CANCELLED" ? "border-rose-200 bg-rose-50/80" : "border-sky-200 bg-sky-50/80"}`}>
            <div className="text-[10px] font-black text-[var(--color-brand-strong)]">{formatMontrealTime(schedule.startsAt)}</div>
            <Link href={schedule.sessionId ? `/coach/sessions/${schedule.sessionId}` : "/coach/planning"} className="mt-1 block text-xs font-black leading-snug hover:text-[var(--color-brand-strong)]">{schedule.title}</Link>
            <div className="mt-1 text-[10px] leading-tight text-[var(--color-ink-muted)]">{schedule.groupName ?? "Club complet"}{schedule.location ? ` · ${schedule.location}` : ""}</div>
            <div className={`mt-2 flex items-center gap-1.5 text-[10px] font-bold ${schedule.sessionStatus === "COMPLETED" ? "text-emerald-700" : schedule.sessionStatus === "CANCELLED" ? "text-rose-700" : "text-sky-800"}`}>{schedule.sessionStatus === "COMPLETED" ? <CircleCheck className="h-3.5 w-3.5"/> : schedule.sessionStatus === "CANCELLED" ? <CircleX className="h-3.5 w-3.5"/> : <Clock3 className="h-3.5 w-3.5"/>}{schedule.sessionStatus === "COMPLETED" ? "Séance terminée" : schedule.sessionStatus === "CANCELLED" ? "Séance annulée" : schedule.sessionId ? "Séance planifiée" : "Entraînement à préparer"}</div>
          </div>)}
          {sessions.length === 0 && schedules.length === 0 && <div className="flex min-h-14 items-center justify-center rounded-lg border border-dashed border-[var(--color-border-strong)] px-2 py-3 text-center text-[11px] font-semibold text-[var(--color-ink-soft)]">Aucune séance prévue</div>}
          {cancelled > 0 && <span className="sr-only">{cancelled} séance{cancelled === 1 ? "" : "s"} annulée{cancelled === 1 ? "" : "s"}</span>}
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
  const plannedSessions = weekSessions.filter((session) => !session.planningEventId && session.status !== "CANCELLED");
  const plannedSchedules = weekSchedules.filter((schedule) => schedule.sessionStatus !== "CANCELLED");
  const sessionCount = plannedSessions.length + plannedSchedules.length;
  const expectedAthletes = new Set(weekSessions.filter((session) => session.status !== "CANCELLED").flatMap((item) => uniqueAssignedIds(item.blocks)));
  for (const schedule of plannedSchedules) {
    if (schedule.athleteId) expectedAthletes.add(schedule.athleteId);
    else activeAthletes.filter((athlete) => !schedule.groupId || athlete.group?.id === schedule.groupId).forEach((athlete) => expectedAthletes.add(athlete.id));
  }
  const athleteCount = expectedAthletes.size;
  const completedCount = plannedSessions.filter((session) => session.status === "COMPLETED").length + plannedSchedules.filter((schedule) => schedule.sessionStatus === "COMPLETED").length;
  const progress = sessionCount ? Math.round(completedCount / sessionCount * 100) : 0;
  const today = new Date();
  const crossesYear = new Set(weekDays(weekStart, weekStartsOn).map((day) => formatMontrealDate(day.date, { year: "numeric" }))).size > 1;
  return (
    <Card className="flex min-h-[301px] flex-col rounded-[14px] border border-[#d7e4ec] bg-white shadow-[0_3px_15px_rgba(30,75,120,.035)]">
      <CardHeader className="px-5 pb-1 pt-5"><CardTitle className="text-[25px] font-bold leading-tight tracking-[-.02em] text-[var(--color-navy)]">Cette semaine</CardTitle></CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 px-5 pb-5 pt-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="flex min-h-[76px] items-center gap-3 rounded-xl bg-[#f3f7fb] px-3.5 py-3"><CalendarPlus aria-hidden="true" className="h-7 w-7 shrink-0 text-[#0797b1]"/><div><strong className="block text-[30px] font-bold leading-none tabular-nums text-[#102b50]">{sessionCount}</strong><span className="text-sm text-[#647895]">séances planifiées</span></div></div>
            <div className="flex min-h-[76px] items-center gap-3 rounded-xl bg-[#f3f7fb] px-3.5 py-3"><Users aria-hidden="true" className="h-7 w-7 shrink-0 text-[#0797b1]"/><div><strong className="block text-[30px] font-bold leading-none tabular-nums text-[#102b50]">{athleteCount}</strong><span className="text-sm text-[#647895]">athlètes attendus</span></div></div>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between gap-2 text-sm font-semibold text-[#233c5b]"><span className="flex items-center gap-2"><Timer aria-hidden="true" className="h-4 w-4 text-[#0797b1]"/>Progression de la semaine</span><span className="shrink-0 tabular-nums">{completedCount} / {sessionCount} séances</span></div>
            <div role="progressbar" aria-label="Séances terminées cette semaine" aria-valuenow={completedCount} aria-valuemin={0} aria-valuemax={sessionCount} className="h-2.5 overflow-hidden rounded-full bg-[#e7edf3]"><div className="h-full rounded-full bg-[#24c8a5] transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${progress}%` }} /></div>
          </div>
          {sessionCount === 0 && <p className="-mt-1 text-xs text-[var(--color-ink-muted)]">Aucune séance planifiée cette semaine.</p>}
          <div className="-mx-1 overflow-x-auto pb-1" aria-label="Jours de la semaine">
            <div className="grid min-w-[455px] grid-cols-7 gap-2 2xl:min-w-0">
            {weekDays(weekStart, weekStartsOn).map((day) => {
              const daySessions = weekSessions.filter((session) => !session.planningEventId && sameMontrealDay(session.date, day.date));
              const daySchedules = weekSchedules.filter((schedule) => sameMontrealDay(schedule.startsAt, day.date));
              const plannedCount = daySessions.filter((session) => session.status !== "CANCELLED").length + daySchedules.filter((schedule) => schedule.sessionStatus !== "CANCELLED").length;
              const completedCountForDay = daySessions.filter((session) => session.status === "COMPLETED").length + daySchedules.filter((schedule) => schedule.sessionStatus === "COMPLETED").length;
              const cancelledCount = daySessions.filter((session) => session.status === "CANCELLED").length + daySchedules.filter((schedule) => schedule.sessionStatus === "CANCELLED").length;
              const isToday = sameMontrealDay(day.date, today);
              const indicator = completedCountForDay ? "completed" : plannedCount ? "planned" : cancelledCount ? "cancelled" : "empty";
              const stateLabel = indicator === "completed" ? `${completedCountForDay} séance${completedCountForDay === 1 ? "" : "s"} terminée${completedCountForDay === 1 ? "" : "s"}` : indicator === "planned" ? `${plannedCount} séance${plannedCount === 1 ? "" : "s"} planifiée${plannedCount === 1 ? "" : "s"}` : indicator === "cancelled" ? `${cancelledCount} séance${cancelledCount === 1 ? "" : "s"} annulée${cancelledCount === 1 ? "" : "s"}` : "Aucune séance";
              return <Link key={day.key} href={`#day-${day.key}`} aria-label={`${day.label} ${formatMontrealDate(day.date, { day: "numeric", month: "long", ...(crossesYear ? { year: "numeric" as const } : {}) })} : ${stateLabel}. Ouvrir le planning du jour.`} className={`flex min-h-[76px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-center transition-colors motion-reduce:transition-none ${isToday ? "border-blue-500 bg-[#f0f7ff] text-blue-800 shadow-[0_0_0_1px_#3b82f6]" : "border-[#dce6ef] bg-white text-[#62748b] hover:border-blue-300 hover:bg-blue-50/40"}`}><span className="text-[11px] font-bold uppercase tracking-wide">{day.label.slice(0, 3)}</span><span className={`text-xs font-bold tabular-nums ${isToday ? "text-blue-700" : "text-[#314a67]"}`}>{formatMontrealDate(day.date, { day: "numeric", month: "short", ...(crossesYear ? { year: "2-digit" as const } : {}) })}</span>{indicator === "completed" ? <CircleCheck aria-hidden="true" className="h-4 w-4 text-emerald-600"/> : indicator === "planned" ? <Clock3 aria-hidden="true" className="h-4 w-4 text-sky-600"/> : indicator === "cancelled" ? <CircleX aria-hidden="true" className="h-4 w-4 text-rose-500"/> : <span aria-hidden="true" className="h-2 w-2 rounded-full bg-slate-300"/>}</Link>;
            })}
            </div>
          </div>
      </CardContent>
    </Card>
  );
}

function FooterMetric({ icon: Icon, value, label }: { icon: typeof Users; value: string | number; label: string }) {
  return <div className="flex min-w-0 items-center gap-2 sm:flex-1 sm:px-3 first:sm:pl-0 last:sm:pr-0"><Icon className="h-6 w-6 shrink-0 text-[#12d5e6]"/><div className="min-w-0"><div className="text-[1.55rem] font-bold leading-none text-white">{value}</div><div className="mt-1 text-[13px] leading-none text-[#d2e1ef]">{label}</div></div></div>;
}

function capitalizeFirst(value: string) {
  return value ? `${value[0].toLocaleUpperCase()}${value.slice(1)}` : value;
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
  const upcoming = sessions.filter((session) => session.date >= now && !["COMPLETED", "IN_PROGRESS", "CANCELLED", "NOT_DONE"].includes(session.status)).sort((left, right) => left.date.getTime() - right.date.getTime())[0];
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
