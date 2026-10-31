import Link from "@/components/ui/app-link";
import { CalendarDays, CalendarPlus, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Dumbbell, Edit, MapPin, Printer, Trophy, Users, Waves, XCircle } from "lucide-react";
import { CoachShell } from "@/components/coach/coach-shell";
import { PlanningEventForm } from "@/components/coach/planning-event-form";
import { PlanningEventEditor } from "@/components/coach/planning-event-editor";
import { CancelPlannedTrainingButton } from "@/components/coach/cancel-planned-training-button";
import { DismissCancelledTrainingButton } from "@/components/coach/dismiss-cancelled-training-button";
import { BlockTypeBadge } from "@/components/training/block-type-badge";
import { StatusPill } from "@/components/training/status-pill";
import { Button } from "@/components/ui/button";
import { athletes as demoAthletes, demoSession, weekSessions } from "@/lib/data";
import { requireCoach } from "@/lib/current-user";
import { query } from "@/lib/db";
import { addMontrealDays, formatMontrealDate, formatMontrealTime, parseMontrealSessionDate, sameMontrealDay, startOfMontrealWeek, toMontrealDateInputValue, toMontrealDateTimeInputValue } from "@/lib/timezone";

export const dynamic = "force-dynamic";

type PlanningSession = {
  id: string;
  title: string;
  date: Date;
  duration: number;
  status: string;
  blocks: Array<{ type: string; estimatedVolume: number; assignments: Array<{ athleteId: string }> }>;
  completions: Array<{ status: string }>;
  planningEventId: string | null;
};

type PlanningEvent = {
  id: string;
  type: string;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  duration: number | null;
  location: string | null;
  notes: string | null;
  cancelledAt: Date | null;
  groupId: string | null;
  athleteId: string | null;
  groupName: string | null;
  athleteName: string | null;
};

type PlanningTarget = {
  id: string;
  label: string;
  kind: "group" | "athlete";
};

type PlanningMode = "week" | "month";

type PlanningPeriod = {
  mode: PlanningMode;
  weekStart: Date;
  rangeStart: Date;
  rangeEnd: Date;
  monthKey: string;
};

type PlanningSearchParams = {
  view?: string | string[];
  week?: string | string[];
  month?: string | string[];
  selected?: string | string[];
};

export default async function PlanningPage({ searchParams }: { searchParams: Promise<PlanningSearchParams> }) {
  const params = await searchParams;
  const { clubId, coach } = await requireCoach();
  const weekStartsOn = coach.weekStartsOn === 0 ? 0 : 1;
  const defaultView = coach.planningDefaultView === "month" ? "month" : "week";
  const period = getPlanningPeriod(params, defaultView, weekStartsOn);
  const selectedDate = parseSelectedDate(getFirstParam(params.selected));
  if (clubId === "dev-club") {
    return <DemoPlanningPage period={period} weekStartsOn={weekStartsOn} selectedDate={selectedDate} />;
  }

  const [sessionRows,eventRows,groupsResult,athleteRows]=await Promise.all([
    query<{id:string;title:string;date:Date;duration:number;status:string;planningEventId:string|null}>(`SELECT s.id,s.title,s.date,s.duration,s.status,s."planningEventId" FROM "TrainingSession" s JOIN "TrainingWeek" w ON w.id=s."weekId" WHERE w."clubId"=$1 AND s."calendarHiddenAt" IS NULL AND s.date >= $2 AND s.date < $3 ORDER BY s.date`,[clubId,period.rangeStart,period.rangeEnd]),
    query<{id:string;type:string;title:string;startsAt:Date;endsAt:Date|null;duration:number|null;location:string|null;notes:string|null;cancelledAt:Date|null;groupId:string|null;athleteId:string|null;groupName:string|null;firstName:string|null;lastName:string|null}>(`SELECT e.id,e.type,e.title,e."startsAt",e."endsAt",e.duration,e.location,e.notes,e."cancelledAt",e."groupId",e."athleteId",g.name AS "groupName",u."firstName",u."lastName" FROM "PlanningEvent" e LEFT JOIN "TrainingGroup" g ON g.id=e."groupId" LEFT JOIN "Athlete" a ON a.id=e."athleteId" LEFT JOIN "User" u ON u.id=a."userId" WHERE e."clubId"=$1 AND e."coachCalendarHiddenAt" IS NULL AND e."startsAt"<$3 AND ((e."endsAt" IS NOT NULL AND e."endsAt">=$2) OR (e."endsAt" IS NULL AND e."startsAt">=$2)) ORDER BY e."startsAt"`,[clubId,period.rangeStart,period.rangeEnd]),
    query<{id:string;name:string}>(`SELECT id,name FROM "TrainingGroup" WHERE "clubId"=$1 ORDER BY name`,[clubId]),
    query<{id:string;firstName:string;lastName:string}>(`SELECT a.id,u."firstName",u."lastName" FROM "Athlete" a JOIN "User" u ON u.id=a."userId" WHERE a."clubId"=$1 AND a.active=true ORDER BY u."firstName"`,[clubId])
  ]);
  const [blockRows,assignmentRows,completionRows]=await Promise.all([
    query<{id:string;sessionId:string;type:string;estimatedVolume:number}>(`SELECT b.id,b."sessionId",b.type,b."estimatedVolume" FROM "SessionBlock" b WHERE b."sessionId"=ANY($1::text[]) ORDER BY b.position`,[sessionRows.rows.map(s=>s.id)]),
    query<{sessionBlockId:string;athleteId:string}>(`SELECT "sessionBlockId","athleteId" FROM "SessionBlockAssignment" WHERE "sessionBlockId"=ANY($1::text[])`,[sessionRows.rows.map(s=>s.id)]),
    query<{sessionId:string;status:string}>(`SELECT "sessionId",status FROM "AthleteSessionCompletion" WHERE "sessionId"=ANY($1::text[])`,[sessionRows.rows.map(s=>s.id)])
  ]);
  const blocksBySession=new Map<string,PlanningSession["blocks"]>();
  for(const block of blockRows.rows){const blocks=blocksBySession.get(block.sessionId)??[];blocks.push({type:block.type,estimatedVolume:block.estimatedVolume,assignments:assignmentRows.rows.filter(a=>a.sessionBlockId===block.id).map(a=>({athleteId:a.athleteId}))});blocksBySession.set(block.sessionId,blocks);}
  const sessions: PlanningSession[] = sessionRows.rows.map((session) => ({
    id: session.id,
    title: session.title,
    date: session.date,
    duration: session.duration,
    status: session.status,
    blocks: blocksBySession.get(session.id)??[],
    completions: completionRows.rows.filter(c=>c.sessionId===session.id),
    planningEventId: session.planningEventId
  }));
  const linkedEventIds = new Set(sessions.map((session) => session.planningEventId).filter(Boolean));
  const events: PlanningEvent[] = eventRows.rows.filter((event) => !linkedEventIds.has(event.id)).map((event) => ({
    id: event.id,
    type: event.type,
    title: event.title,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    duration: event.duration,
    location: event.location,
    notes: event.notes,
    cancelledAt: event.cancelledAt,
    groupId: event.groupId,
    athleteId: event.athleteId,
    groupName: event.groupName,
    athleteName: event.athleteId ? `${event.firstName} ${event.lastName}` : null
  }));
  const groups=groupsResult.rows;
  const targets: PlanningTarget[] = [
    ...groups.map((group) => ({ id: group.id, label: group.name, kind: "group" as const })),
    ...athleteRows.rows.map((athlete) => ({ id: athlete.id, label: `${athlete.firstName} ${athlete.lastName}`, kind: "athlete" as const }))
  ];

  return <PlanningView period={period} sessions={sessions} events={events} targets={targets} weekStartsOn={weekStartsOn} selectedDate={selectedDate} />;
}

function DemoPlanningPage({ period, weekStartsOn, selectedDate }: { period: PlanningPeriod; weekStartsOn: 0 | 1; selectedDate: string | null }) {
  const sessions = weekSessions.filter((session) => session.title).map((session, index) => ({
    id: index === 1 ? "demo" : `demo-${index}`,
    title: session.title,
    date: addMontrealDays(period.weekStart, index),
    duration: session.duration,
    status: session.status === "Brouillon" ? "DRAFT" : session.status === "Complete" ? "COMPLETED" : "READY",
    blocks: demoSession.blocks.map((block) => ({ type: block.type, estimatedVolume: block.volume, assignments: block.assignedTo.map((athleteId) => ({ athleteId })) })),
    completions: [],
    planningEventId: null
  })) satisfies PlanningSession[];
  const events: PlanningEvent[] = [
    {
      id: "demo-event-competition",
      type: "COMPETITION",
      title: "Invitation provinciale",
      startsAt: addMontrealDays(period.weekStart, 4),
      endsAt: addMontrealDays(period.weekStart, 5),
      duration: 180,
      location: "Centre aquatique",
      notes: "Liste finale des plongeons a confirmer.",
      cancelledAt: null,
      groupId: "provincial",
      athleteId: null,
      groupName: "Provincial",
      athleteName: null
    },
    {
      id: "demo-event-camp",
      type: "CAMP",
      title: "Camp technique",
      startsAt: addMontrealDays(period.weekStart, 2),
      endsAt: null,
      duration: 240,
      location: "Bassin principal",
      notes: null,
      cancelledAt: null,
      groupId: "provincial",
      athleteId: null,
      groupName: "Provincial",
      athleteName: null
    }
  ];
  const targets: PlanningTarget[] = [
    { id: "provincial", label: "Provincial", kind: "group" },
    ...demoAthletes.map((athlete) => ({ id: athlete.id, label: `${athlete.firstName} ${athlete.lastName}`, kind: "athlete" as const }))
  ];

  return <PlanningView period={period} sessions={sessions} events={events} targets={targets} weekStartsOn={weekStartsOn} selectedDate={selectedDate} demo />;
}

function PlanningView({ period, sessions, events, targets, weekStartsOn, selectedDate, demo = false }: { period: PlanningPeriod; sessions: PlanningSession[]; events: PlanningEvent[]; targets: PlanningTarget[]; weekStartsOn: 0 | 1; selectedDate: string | null; demo?: boolean }) {
  const activeSessionIds = new Set(sessions.filter((session) => session.status === "READY" && session.completions.some((completion) => completion.status === "IN_PROGRESS")).map((session) => session.id));
  const completedCount = sessions.filter((session) => session.status === "COMPLETED").length;
  const publishedCount = sessions.filter((session) => session.status === "READY").length;

  return (
    <CoachShell active="Calendrier">
      <section aria-label="En-tête du calendrier" className="mb-5 grid grid-cols-1 gap-x-6 gap-y-4 rounded-[24px] bg-[#eaf5fc] px-5 py-5 sm:px-7 sm:py-6 lg:grid-cols-2 lg:items-start lg:px-8 lg:py-7">
        <div className="order-1 min-w-0">
          <h1 className="text-[34px] font-black leading-[1.05] tracking-[-.03em] text-[#10264d] sm:text-[42px]">Calendrier</h1>
          <p className="mt-1.5 text-lg font-semibold capitalize text-[#6b82a5] sm:text-[21px]">{periodLabel(period)}</p>
        </div>
        <div className="order-2 lg:justify-self-end">
          <PlanningEventForm targets={targets} demo={demo} prominent />
        </div>
        <div className="order-3 flex w-fit max-w-full rounded-full border border-[#dce7f2] bg-white p-1 shadow-[0_2px_8px_rgba(28,72,116,.035)]">
          <PlanningModeLink mode="week" active={period.mode === "week"} period={period} weekStartsOn={weekStartsOn}>Semaine</PlanningModeLink>
          <PlanningModeLink mode="month" active={period.mode === "month"} period={period} weekStartsOn={weekStartsOn}>Mois</PlanningModeLink>
        </div>

        {period.mode === "week" ? (
          <div className="order-4 flex flex-wrap items-center gap-2 lg:justify-self-end">
            <Button asChild variant="outline" size="default" className="whitespace-nowrap border-[#dce7f2] bg-white shadow-[0_2px_8px_rgba(28,72,116,.035)] hover:border-[#b8d2ee] hover:bg-[#fafdff]"><Link href={planningHref("week", addMontrealDays(period.weekStart, -7), weekStartsOn)}><ChevronLeft aria-hidden="true" className="h-4 w-4" /> Semaine précédente</Link></Button>
            <Button asChild variant="outline" size="default" className="whitespace-nowrap border-[#dce7f2] bg-white shadow-[0_2px_8px_rgba(28,72,116,.035)] hover:border-[#b8d2ee] hover:bg-[#fafdff]"><Link href="/coach/planning?view=week">Aujourd&apos;hui</Link></Button>
            <Button asChild variant="outline" size="default" className="whitespace-nowrap border-[#dce7f2] bg-white shadow-[0_2px_8px_rgba(28,72,116,.035)] hover:border-[#b8d2ee] hover:bg-[#fafdff]"><Link href={planningHref("week", addMontrealDays(period.weekStart, 7), weekStartsOn)}>Semaine suivante <ChevronRight aria-hidden="true" className="h-4 w-4" /></Link></Button>
          </div>
        ) : (
          <div className="order-4 flex flex-wrap items-center gap-2 lg:justify-self-end">
            <Button asChild variant="outline" size="default" className="whitespace-nowrap border-[#dce7f2] bg-white shadow-[0_2px_8px_rgba(28,72,116,.035)] hover:border-[#b8d2ee] hover:bg-[#fafdff]"><Link href={planningHref("month", addMontrealMonths(period.rangeStart, -1), weekStartsOn)}><ChevronLeft aria-hidden="true" className="h-4 w-4" /> Mois précédent</Link></Button>
            <Button asChild variant="outline" size="default" className="whitespace-nowrap border-[#dce7f2] bg-white shadow-[0_2px_8px_rgba(28,72,116,.035)] hover:border-[#b8d2ee] hover:bg-[#fafdff]"><Link href="/coach/planning?view=month">Aujourd&apos;hui</Link></Button>
            <Button asChild variant="outline" size="default" className="whitespace-nowrap border-[#dce7f2] bg-white shadow-[0_2px_8px_rgba(28,72,116,.035)] hover:border-[#b8d2ee] hover:bg-[#fafdff]"><Link href={planningHref("month", addMontrealMonths(period.rangeStart, 1), weekStartsOn)}>Mois suivant <ChevronRight aria-hidden="true" className="h-4 w-4" /></Link></Button>
          </div>
        )}
      </section>

      {period.mode === "month" ? (
        <MonthCalendar period={period} sessions={sessions} events={events} targets={targets} selectedDate={selectedDate} demo={demo} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-soft)]">
          <div className="grid min-w-[980px] grid-cols-7 gap-px bg-[var(--color-border)]">
          {weekDays(period.weekStart).map((day) => (
            <DayColumn
              key={day.key}
              day={day}
              sessions={sessions.filter((session) => sameMontrealDay(session.date, day.date))}
              events={events.filter((event) => planningEventCoversDay(event, day.date))}
              targets={targets}
              activeSessionIds={activeSessionIds}
              demo={demo}
            />
          ))}
          </div>
        </div>
      )}

      <section aria-label="Légende et résumé du calendrier" className="mt-5 flex flex-col gap-5 rounded-2xl border border-[#e0eaf2] bg-white p-5 shadow-[0_5px_20px_rgba(28,72,116,.045)] sm:p-6 lg:flex-row lg:items-center lg:gap-6">
        <div className="min-w-0 flex-1">
          <h2 className="text-xs font-black uppercase tracking-[.1em] text-[#52677f]">Légende</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:gap-4">
            <LegendItem color="bg-emerald-400" label="Terminée" description="Séance réalisée" />
            <LegendItem color="bg-sky-400" label="Publiée" description="Visible aux athlètes" />
            <LegendItem color="bg-[#ff806d]" label="Compétition" description="Événement de compétition" />
            <LegendItem color="bg-slate-300" label="Jour libre" description="Aucun événement" />
          </div>
        </div>
        <div aria-hidden="true" className="hidden h-12 w-px shrink-0 bg-[#dce7f1] lg:block" />
        <div role="group" aria-label="Totaux de la période affichée" className="grid gap-2 sm:grid-cols-3 lg:w-auto lg:shrink-0">
          <SummaryCount icon={CalendarDays} tone="blue" label="événements" value={sessions.length + events.length} />
          <SummaryCount icon={CheckCircle2} tone="green" label="terminés" value={completedCount} />
          <SummaryCount icon={Clock3} tone="blue" label="publiés" value={publishedCount} />
        </div>
      </section>
    </CoachShell>
  );
}

function LegendItem({ color, label, description }: { color: string; label: string; description: string }) {
  return <span className="inline-flex min-w-0 items-start gap-2.5"><span aria-hidden="true" className={`mt-1 h-3 w-3 shrink-0 rounded-full ${color}`} /><span className="min-w-0"><strong className="block text-sm leading-5 text-[#14284e]">{label}</strong><span className="block text-xs font-medium leading-5 text-[#71839a]">{description}</span></span></span>;
}

function SummaryCount({ icon: Icon, tone, label, value }: { icon: React.ElementType; tone: "blue" | "green"; label: string; value: number }) {
  const colors = tone === "green"
    ? "bg-emerald-50 text-emerald-700"
    : label === "publiés"
      ? "bg-blue-50 text-blue-700"
      : "bg-[#f3f7fc] text-[#1767d2]";
  return <div className={`flex min-h-12 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-bold whitespace-nowrap ${colors}`}>
    <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
    <span className="text-base font-black tabular-nums">{value}</span>
    <span>{label}</span>
  </div>;
}

function PlanningModeLink({ mode, active, period, weekStartsOn, children }: { mode: PlanningMode; active: boolean; period: PlanningPeriod; weekStartsOn: 0 | 1; children: React.ReactNode }) {
  return (
    <Link
      href={planningHref(mode, period.mode === "week" ? period.weekStart : period.rangeStart, weekStartsOn)}
      className={`inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-bold transition-colors duration-[var(--duration-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1685f7] focus-visible:ring-offset-2 ${active ? "bg-[#0969ef] text-white shadow-[0_5px_14px_rgba(9,105,239,.22)]" : "text-[#52677f] hover:bg-[#f4f8fd] hover:text-[#10264d]"}`}
      aria-current={active ? "page" : undefined}
    >
      {children}
    </Link>
  );
}

function DayColumn({ day, sessions, events, activeSessionIds, targets, demo }: { day: { key: number | string; label: string; date: Date }; sessions: PlanningSession[]; events: PlanningEvent[]; activeSessionIds: Set<string>; targets: PlanningTarget[]; demo: boolean }) {
  return (
    <div className={`min-h-[420px] bg-white ${sameMontrealDay(day.date, new Date()) ? "bg-[#f0f7ff]" : ""}`}>
      <div className={`sticky top-0 z-10 flex min-h-[64px] flex-col items-center justify-center border-b px-2 py-2 text-center ${sameMontrealDay(day.date, new Date()) ? "border-[#badcff] bg-[#eaf4ff] text-[#075fc5]" : "border-[var(--color-border)] bg-[var(--color-surface-raised)]"}`}>
          <div>
            <div className="text-sm font-black">{day.label}</div>
            <div className="text-xs font-bold text-[var(--color-ink-soft)]">{formatMontrealDate(day.date, { day: "2-digit", month: "short" })}</div>
          </div>
      </div>

        <div className="space-y-2 p-2">
          {sessions.map((session) => <PlanningSessionCard key={session.id} session={session} active={activeSessionIds.has(session.id)} demo={demo} />)}
          {events.map((event) => <PlanningEventCard key={event.id} event={event} targets={targets} demo={demo} />)}
          {sessions.length === 0 && events.length === 0 && (
            <div className="flex min-h-28 flex-col items-center justify-center rounded-xl border border-dashed border-[#cbd8e4] bg-white/70 p-3 text-center">
              <div className="text-xs font-black text-[var(--color-ink-muted)]">Jour libre</div>
              <PlanningEventForm targets={targets} demo={demo} triggerLabel="Ajouter un événement" defaultStartsAt={`${toMontrealDateInputValue(day.date)}T09:00`} />
            </div>
          )}
        </div>
    </div>
  );
}

function MonthCalendar({ period, sessions, events, targets, selectedDate, demo }: { period: PlanningPeriod; sessions: PlanningSession[]; events: PlanningEvent[]; targets: PlanningTarget[]; selectedDate: string | null; demo: boolean }) {
  const days = monthCalendarDays(period.rangeStart, period.rangeEnd, 1);
  const today = new Date();
  const monthDays = days.filter((day) => day.inMonth);
  const hasMonthItems = sessions.length > 0 || events.length > 0;

  return (
    <div>
      <div className="hidden overflow-hidden rounded-[20px] border border-[#dce7f1] bg-white shadow-[0_8px_30px_rgba(28,72,116,.055)] lg:block">
        <div className="grid grid-cols-7 border-b border-[#e4ebf3] bg-[#fbfdff]">
          {["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"].map((day) => (
            <div key={day} className="px-2 py-3.5 text-center text-sm font-black text-[#14284e]">{day}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
          const daySessions = sessions.filter((session) => sameMontrealDay(session.date, day.date));
          const dayEvents = events.filter((event) => planningEventCoversDay(event, day.date));
          const isToday = sameMontrealDay(day.date, today);
          const isSelected = selectedDate ? selectedDate === day.key : isToday;
          return (
            <div key={day.key} className={`group flex min-h-[156px] min-w-0 flex-col overflow-hidden border-b border-r border-[#e4ebf3] p-2 ${!day.inMonth ? "bg-[#fbfcfe]" : isSelected ? "bg-[#edf6ff]" : "bg-white"}`}>
              <div className="mb-1.5 flex items-center justify-between gap-1">
                <Link href={monthDateHref(day.date)} aria-current={isSelected ? "date" : undefined} aria-label={`Sélectionner le ${formatMontrealDate(day.date, { weekday: "long", day: "numeric", month: "long" })}`} className={`inline-flex min-h-8 min-w-8 items-center rounded-full px-2 text-sm font-semibold transition-colors hover:bg-[#eaf2fb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1685f7] ${!day.inMonth ? "text-[#9aa9bd]" : isSelected ? "bg-[#dceeff] font-black text-[#0879ed]" : "text-[#14284e]"}`}>
                  {formatMontrealDate(day.date, { day: "numeric" })}{!day.inMonth && <span className="ml-1 text-xs">{formatMontrealDate(day.date, { month: "short" }).replace(".", "")}</span>}
                </Link>
                <PlanningEventForm targets={targets} demo={demo} triggerLabel="+" defaultStartsAt={`${toMontrealDateInputValue(day.date)}T09:00`} />
              </div>
              <div className="min-w-0 flex-1 space-y-1 overflow-hidden">
                {daySessions.slice(0, 2).map((session) => <MonthSessionItem key={session.id} session={session} demo={demo} />)}
                {dayEvents.slice(0, 2).map((event) => <MonthEventItem key={event.id} event={event} targets={targets} demo={demo} />)}
                {daySessions.length + dayEvents.length > 4 && <div className="truncate px-1 text-xs font-bold text-[#61748f]">+{daySessions.length + dayEvents.length - 4} autres</div>}
              </div>
            </div>
          );
          })}
        </div>
      </div>

      <div className="space-y-2 lg:hidden">
        {monthDays.map((day) => {
          const daySessions = sessions.filter((session) => sameMontrealDay(session.date, day.date));
          const dayEvents = events.filter((event) => planningEventCoversDay(event, day.date));
          const isToday = sameMontrealDay(day.date, today);
          const isSelected = selectedDate ? selectedDate === day.key : isToday;
          return (
            <section key={day.key} className={`rounded-2xl border p-3 ${isSelected ? "border-[#b8dbff] bg-[#f0f7ff]" : "border-[#e1eaf2] bg-white"}`}>
              <div className="mb-2 flex items-center justify-between">
                <h3 className={`text-sm font-black capitalize ${isSelected ? "text-[#0879ed]" : "text-[#14284e]"}`}>
                  <Link href={monthDateHref(day.date)} aria-current={isSelected ? "date" : undefined} className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1685f7]">{formatMontrealDate(day.date, { weekday: "long", day: "numeric", month: "long" })}{isToday ? " · Aujourd’hui" : ""}</Link>
                </h3>
                <PlanningEventForm targets={targets} demo={demo} triggerLabel="+ Ajouter" defaultStartsAt={`${toMontrealDateInputValue(day.date)}T09:00`} />
              </div>
              {daySessions.length + dayEvents.length === 0 ? <p className="text-xs text-[#7d8da3]">Aucun événement prévu</p> : <div className="grid gap-2 sm:grid-cols-2">
                {daySessions.map((session) => <MonthSessionItem key={session.id} session={session} demo={demo} />)}
                {dayEvents.map((event) => <MonthEventItem key={event.id} event={event} targets={targets} demo={demo} />)}
              </div>}
            </section>
          );
        })}
        {!hasMonthItems && <p className="rounded-2xl border border-dashed border-[#cbd8e4] bg-white p-5 text-center text-sm font-medium text-[#61748f]">Aucun événement ce mois-ci. Utilisez « + Ajouter » sur une journée pour planifier une activité.</p>}
      </div>
    </div>
  );
}

function PlanningSessionCard({ session, active, demo }: { session: PlanningSession; active: boolean; demo: boolean }) {
  const status = session.status === "COMPLETED" ? "COMPLETED" : active ? "IN_PROGRESS" : session.status;
  const href = demo ? "/coach/sessions/demo" : `/coach/sessions/${session.id}`;
  const editHref = demo ? "/coach/sessions/demo/edit" : `/coach/sessions/${session.id}/edit`;
  const printHref = demo ? "/coach/sessions/demo/print" : `/coach/sessions/${session.id}/print`;
  const athleteCount = uniqueAssignedIds(session.blocks).length;
  const volume = session.blocks.reduce((sum, block) => sum + block.estimatedVolume, 0);

  return (
    <article className={`rounded-2xl border p-3 transition duration-[var(--duration-fast)] hover:-translate-y-0.5 ${statusTone(status)}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusPill status={String(status)} />
        <span className="text-xs font-bold text-[var(--color-ink-soft)]">{formatMontrealTime(session.date)}</span>
      </div>
      <Link href={href} className="mt-3 block font-black leading-tight hover:text-[var(--color-brand-strong)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">{session.title}</Link>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs font-bold text-[var(--color-ink-muted)]">
        <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> {session.duration}</span>
        <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {athleteCount}</span>
        <span className="inline-flex items-center gap-1"><Waves className="h-3.5 w-3.5" /> {volume}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">{uniqueBlockTypes(session.blocks).map((type) => <BlockTypeBadge key={String(type)} type={String(type)} className="px-2" />)}</div>
      <div className="mt-4 flex gap-2">
        <Button asChild size="sm" variant="outline"><Link href={editHref}><Edit className="h-4 w-4" /> Modifier</Link></Button>
        <Button asChild size="icon" variant="outline" className="h-9 min-h-9 w-9" aria-label="Imprimer"><Link href={printHref}><Printer className="h-4 w-4" /></Link></Button>
      </div>
      {!demo && session.status === "CANCELLED" && <div className="mt-2 flex justify-end"><DismissCancelledTrainingButton sessionId={session.id} /></div>}
    </article>
  );
}

function PlanningEventCard({ event, targets, demo }: { event: PlanningEvent; targets: PlanningTarget[]; demo: boolean }) {
  const target = event.groupId ? `group:${event.groupId}` : event.athleteId ? `athlete:${event.athleteId}` : "club";
  return (
    <article className={`rounded-2xl border p-3 ${eventTone(event.type, Boolean(event.cancelledAt))}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-black ${event.cancelledAt ? "bg-red-100 text-red-800" : "bg-white/70"}`}>{event.cancelledAt ? <XCircle className="h-3.5 w-3.5" /> : <Trophy className="h-3.5 w-3.5" />} {event.cancelledAt ? "Annulé" : eventTypeLabel(event.type)}</span>
        <div className="flex items-center gap-1"><span className="text-xs font-bold">{formatMontrealTime(event.startsAt)}</span>{!event.cancelledAt && <PlanningEventEditor event={{ ...event, startsAt: toMontrealDateTimeInputValue(event.startsAt), endsAt: event.endsAt ? toMontrealDateTimeInputValue(event.endsAt) : "", target }} targets={targets} />}</div>
      </div>
      <div className="mt-3 font-black leading-tight">{event.title}</div>
      <div className="mt-2 space-y-1 text-xs font-bold opacity-80">
        {event.duration && <div><Clock3 className="mr-1 inline h-3.5 w-3.5" /> {event.duration} min</div>}
        {event.location && <div><MapPin className="mr-1 inline h-3.5 w-3.5" /> {event.location}</div>}
        <div>{event.athleteName ?? event.groupName ?? "Club complet"}</div>
      </div>
      {event.notes && <p className="mt-2 text-sm leading-5 opacity-80">{event.notes}</p>}
      {event.type === "TRAINING_SCHEDULE" && event.cancelledAt && !demo && <div className="mt-3 flex justify-end"><DismissCancelledTrainingButton eventId={event.id} /></div>}
      {event.type === "TRAINING_SCHEDULE" && !event.cancelledAt && <div className="mt-3 space-y-2">
        <Button asChild size="sm" variant="outline" className="w-full justify-between"><Link href={demo ? "/coach/sessions/demo" : `/coach/sessions/new?planningEventId=${event.id}`}>{demo ? "Voir la séance démo" : "Créer la séance"}<CalendarPlus className="h-4 w-4" /></Link></Button>
        {!demo && !event.cancelledAt && event.startsAt > new Date() && <CancelPlannedTrainingButton eventId={event.id} />}
      </div>}
    </article>
  );
}

function MonthSessionItem({ session, demo }: { session: PlanningSession; demo: boolean }) {
  const href = demo ? "/coach/sessions/demo" : `/coach/sessions/${session.id}`;
  const completed = session.status === "COMPLETED";
  const cancelled = session.status === "CANCELLED";
  const status = completed ? "Terminée" : session.status === "DRAFT" ? "Brouillon" : cancelled ? "Annulée" : "Publiée";
  const tone = completed ? "border-emerald-100 bg-emerald-50 text-emerald-950" : session.status === "DRAFT" ? "border-amber-100 bg-amber-50 text-amber-950" : cancelled ? "border-rose-100 bg-rose-50 text-rose-950" : "border-blue-100 bg-blue-50 text-blue-950";
  const iconTone = completed ? "text-emerald-600" : cancelled ? "text-rose-600" : "text-blue-600";
  const statusToneClass = completed ? "bg-emerald-100 text-emerald-800" : cancelled ? "bg-rose-100 text-rose-800" : session.status === "DRAFT" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800";
  return (
    <div>
      <Link href={href} aria-label={`${session.title}, ${formatMontrealTime(session.date)}, ${status}`} className={`flex min-h-12 min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-lg border px-2 py-1.5 text-xs font-bold leading-tight transition-colors hover:brightness-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1685f7] ${tone}`}>
        {session.blocks.some((block) => block.type === "DRYLAND") ? <Dumbbell aria-hidden="true" className={`h-4 w-4 shrink-0 ${iconTone}`} /> : <Waves aria-hidden="true" className={`h-4 w-4 shrink-0 ${iconTone}`} />}
        <span className="min-w-0 flex-1 overflow-hidden">
          <span className="block truncate">{session.title}</span>
          <span className="block truncate text-[10px] font-medium opacity-75">{formatMontrealTime(session.date)} – {formatMontrealTime(new Date(session.date.getTime() + session.duration * 60_000))}</span>
        </span>
        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${statusToneClass}`}>{status}</span>
      </Link>
      {!demo && session.status === "CANCELLED" && <div className="mt-1 flex justify-end"><DismissCancelledTrainingButton sessionId={session.id} compact /></div>}
    </div>
  );
}

function MonthEventItem({ event, targets, demo }: { event: PlanningEvent; targets: PlanningTarget[]; demo: boolean }) {
  const target = event.groupId ? `group:${event.groupId}` : event.athleteId ? `athlete:${event.athleteId}` : "club";
  const tone = event.type === "COMPETITION" ? "border-rose-200 bg-rose-50 text-rose-950" : event.cancelledAt ? "border-rose-200 bg-rose-50 text-rose-950" : "border-blue-100 bg-blue-50 text-blue-950";
  const Icon = event.type === "COMPETITION" ? Trophy : event.type === "CAMP" ? Dumbbell : CalendarDays;
  const endTime = event.endsAt ? formatMontrealTime(event.endsAt) : event.duration ? formatMontrealTime(new Date(event.startsAt.getTime() + event.duration * 60_000)) : null;
  const eventCard = (
    <span className={`flex min-h-12 min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-lg border px-2 py-1.5 text-xs font-bold leading-tight transition-[background-color,border-color] duration-150 hover:border-[#9cc8f5] ${tone}`}>
      <Icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${event.type === "COMPETITION" || event.cancelledAt ? "text-rose-600" : "text-blue-600"}`} />
      <span className="min-w-0 flex-1 overflow-hidden">
        <span className="block truncate">{event.title}</span>
        <span className="block truncate text-[10px] font-medium opacity-75">{formatMontrealTime(event.startsAt)}{endTime ? ` – ${endTime}` : ""}</span>
      </span>
      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${event.type === "COMPETITION" ? "bg-rose-100 text-rose-800" : "bg-blue-100 text-blue-800"}`}>{event.cancelledAt ? "Annulé" : eventTypeLabel(event.type)}</span>
    </span>
  );

  return (
    <div className="min-w-0 overflow-hidden">
      {event.cancelledAt ? eventCard : <PlanningEventEditor fullCard event={{ ...event, startsAt: toMontrealDateTimeInputValue(event.startsAt), endsAt: event.endsAt ? toMontrealDateTimeInputValue(event.endsAt) : "", target }} targets={targets}>{eventCard}</PlanningEventEditor>}
      {event.type === "TRAINING_SCHEDULE" && !event.cancelledAt && <div className="mt-1 flex flex-col items-start gap-1">
        <Link href={demo ? "/coach/sessions/demo" : `/coach/sessions/new?planningEventId=${event.id}`} className="inline-flex min-h-8 items-center gap-1 text-[11px] font-black underline">{demo ? "Séance démo" : "Créer la séance"}</Link>
        {!demo && event.startsAt > new Date() && <CancelPlannedTrainingButton eventId={event.id} compact />}
      </div>}
      {event.type === "TRAINING_SCHEDULE" && event.cancelledAt && !demo && <div className="mt-1 flex justify-end"><DismissCancelledTrainingButton eventId={event.id} compact /></div>}
    </div>
  );
}
function statusTone(status: string) {
  if (status === "DRAFT") return "border-[var(--block-dryland-fg)]/20 bg-[var(--block-dryland-bg)]/45";
  if (status === "IN_PROGRESS") return "border-[var(--color-action)] bg-white";
  if (status === "COMPLETED") return "border-[var(--color-success)]/25 bg-[var(--color-success-soft)]/55";
  if (status === "NOT_DONE") return "border-[var(--color-danger)]/20 bg-[var(--color-danger)]/10";
  if (status === "CANCELLED") return "border-[var(--color-danger)]/20 bg-[var(--color-danger)]/10";
  return "border-[var(--block-pool-fg)]/20 bg-[var(--block-pool-bg)]/45";
}

function eventTone(type: string, cancelled = false) {
  if (cancelled) return "border-red-500/40 bg-red-500/10 text-red-800";
  if (type === "COMPETITION") return "border-amber-500/35 bg-amber-50 text-amber-950";
  if (type === "CAMP") return "border-[var(--block-dryland-fg)]/25 bg-[var(--block-dryland-bg)]/70 text-[var(--block-dryland-fg)]";
  return "border-[var(--color-brand)]/25 bg-[var(--color-surface-raised)] text-[var(--color-brand-strong)]";
}

function eventTypeLabel(type: string) {
  if (type === "COMPETITION") return "Compétition";
  if (type === "CAMP") return "Camp";
  return "Horaire";
}

function uniqueAssignedIds(blocks: PlanningSession["blocks"]) {
  return Array.from(new Set(blocks.flatMap((block) => block.assignments.map((assignment) => assignment.athleteId))));
}

function uniqueBlockTypes(blocks: PlanningSession["blocks"]) {
  return Array.from(new Set(blocks.map((block) => block.type)));
}

function weekDays(weekStart: Date) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = addMontrealDays(weekStart, index);
    const label = formatMontrealDate(date, { weekday: "long" });
    return { key: toMontrealDateInputValue(date), label: label.charAt(0).toLocaleUpperCase("fr-CA") + label.slice(1), date };
  });
}

function monthCalendarDays(monthStart: Date, monthEnd: Date, weekStartsOn: 0 | 1) {
  const calendarStart = startOfMontrealWeek(monthStart, weekStartsOn);
  const monthKey = toMonthKey(monthStart);
  return Array.from({ length: 42 }, (_, index) => {
    const date = addMontrealDays(calendarStart, index);
    return {
      key: toMontrealDateInputValue(date),
      date,
      inMonth: toMonthKey(date) === monthKey || (date >= monthStart && date < monthEnd)
    };
  });
}

function getPlanningPeriod(params: PlanningSearchParams, defaultView: PlanningMode, weekStartsOn: 0 | 1): PlanningPeriod {
  const requestedView = getFirstParam(params.view);
  const mode: PlanningMode = requestedView === "month" || requestedView === "week" ? requestedView : defaultView;
  const today = new Date();
  const weekStart = parseWeekParam(getFirstParam(params.week), weekStartsOn) ?? startOfMontrealWeek(today, weekStartsOn);
  const monthStart = parseMonthParam(getFirstParam(params.month)) ?? startOfMontrealMonth(today);

  if (mode === "month") {
    return {
      mode,
      weekStart: startOfMontrealWeek(monthStart, weekStartsOn),
      rangeStart: monthStart,
      rangeEnd: addMontrealMonths(monthStart, 1),
      monthKey: toMonthKey(monthStart)
    };
  }

  return {
    mode,
    weekStart,
    rangeStart: weekStart,
    rangeEnd: addMontrealDays(weekStart, 7),
    monthKey: toMonthKey(weekStart)
  };
}

function planningEventCoversDay(event: PlanningEvent, day: Date) {
  const dayKey = toMontrealDateInputValue(day);
  return toMontrealDateInputValue(event.startsAt) <= dayKey && toMontrealDateInputValue(event.endsAt ?? event.startsAt) >= dayKey;
}

function parseWeekParam(value: string | undefined, weekStartsOn: 0 | 1) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return startOfMontrealWeek(parseMontrealSessionDate(value, "12:00"), weekStartsOn);
}

function parseMonthParam(value?: string) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return null;
  return parseMontrealSessionDate(`${value}-01`, "00:00");
}

function startOfMontrealMonth(date: Date) {
  return parseMontrealSessionDate(`${toMonthKey(date)}-01`, "00:00");
}

function addMontrealMonths(date: Date, months: number) {
  const [year, month] = toMonthKey(date).split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + months, 1, 12, 0, 0));
  return parseMonthParam(toMonthKey(shifted)) ?? date;
}

function planningHref(mode: PlanningMode, date: Date, weekStartsOn: 0 | 1) {
  if (mode === "month") return `/coach/planning?view=month&month=${toMonthKey(date)}`;
  return `/coach/planning?view=week&week=${toMontrealDateInputValue(startOfMontrealWeek(date, weekStartsOn))}`;
}

function periodLabel(period: PlanningPeriod) {
  if (period.mode === "month") {
    return formatMontrealDate(period.rangeStart, { month: "long", year: "numeric" });
  }
  return `Semaine du ${formatMontrealDate(period.weekStart)}`;
}

function toMonthKey(date: Date) {
  return toMontrealDateInputValue(date).slice(0, 7);
}

function getFirstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function parseSelectedDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  try {
    const parsed = parseMontrealSessionDate(value, "12:00");
    return toMontrealDateInputValue(parsed) === value ? value : null;
  } catch {
    return null;
  }
}

function monthDateHref(date: Date) {
  const selected = toMontrealDateInputValue(date);
  return `/coach/planning?view=month&month=${toMonthKey(date)}&selected=${selected}`;
}
