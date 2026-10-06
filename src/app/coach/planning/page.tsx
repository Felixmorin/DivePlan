import Link from "next/link";
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, Clock3, Edit, MapPin, Printer, Trophy, Users, Waves } from "lucide-react";
import { CoachShell } from "@/components/coach/coach-shell";
import { PlanningEventForm } from "@/components/coach/planning-event-form";
import { PlanningEventEditor } from "@/components/coach/planning-event-editor";
import { BlockTypeBadge } from "@/components/training/block-type-badge";
import { StatusPill } from "@/components/training/status-pill";
import { Button } from "@/components/ui/button";
import { athletes as demoAthletes, demoSession, weekSessions } from "@/lib/data";
import { requireCoach } from "@/lib/current-user";
import { query } from "@/lib/db";
import { completeExpiredTrainingSessions } from "@/lib/session-status";
import { addMontrealDays, formatMontrealDate, formatMontrealTime, parseMontrealSessionDate, sameMontrealDay, startOfMontrealWeek, toMontrealDateInputValue, toMontrealDateTimeInputValue } from "@/lib/timezone";

export const dynamic = "force-dynamic";

type PlanningSession = {
  id: string;
  title: string;
  focus: string;
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
};

export default async function PlanningPage({ searchParams }: { searchParams: Promise<PlanningSearchParams> }) {
  const params = await searchParams;
  const { clubId, coach } = await requireCoach();
  const weekStartsOn = coach.weekStartsOn === 0 ? 0 : 1;
  const defaultView = coach.planningDefaultView === "month" ? "month" : "week";
  const period = getPlanningPeriod(params, defaultView, weekStartsOn);
  if (clubId === "dev-club") {
    return <DemoPlanningPage period={period} weekStartsOn={weekStartsOn} />;
  }
  await completeExpiredTrainingSessions();

  const [sessionRows,eventRows,groupsResult,athleteRows]=await Promise.all([
    query<{id:string;title:string;focus:string;date:Date;duration:number;status:string;planningEventId:string|null}>(`SELECT s.id,s.title,s.focus,s.date,s.duration,s.status,s."planningEventId" FROM "TrainingSession" s JOIN "TrainingWeek" w ON w.id=s."weekId" WHERE w."clubId"=$1 AND s.date >= $2 AND s.date < $3 ORDER BY s.date`,[clubId,period.rangeStart,period.rangeEnd]),
    query<{id:string;type:string;title:string;startsAt:Date;endsAt:Date|null;duration:number|null;location:string|null;notes:string|null;groupId:string|null;athleteId:string|null;groupName:string|null;firstName:string|null;lastName:string|null}>(`SELECT e.id,e.type,e.title,e."startsAt",e."endsAt",e.duration,e.location,e.notes,e."groupId",e."athleteId",g.name AS "groupName",u."firstName",u."lastName" FROM "PlanningEvent" e LEFT JOIN "TrainingGroup" g ON g.id=e."groupId" LEFT JOIN "Athlete" a ON a.id=e."athleteId" LEFT JOIN "User" u ON u.id=a."userId" WHERE e."clubId"=$1 AND e."startsAt">=$2 AND e."startsAt"<$3 ORDER BY e."startsAt"`,[clubId,period.rangeStart,period.rangeEnd]),
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
    focus: session.focus,
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

  return <PlanningView period={period} sessions={sessions} events={events} targets={targets} weekStartsOn={weekStartsOn} />;
}

function DemoPlanningPage({ period, weekStartsOn }: { period: PlanningPeriod; weekStartsOn: 0 | 1 }) {
  const sessions = weekSessions.filter((session) => session.title).map((session, index) => ({
    id: index === 1 ? "demo" : `demo-${index}`,
    title: session.title,
    focus: session.focus,
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

  return <PlanningView period={period} sessions={sessions} events={events} targets={targets} weekStartsOn={weekStartsOn} demo />;
}

function PlanningView({ period, sessions, events, targets, weekStartsOn, demo = false }: { period: PlanningPeriod; sessions: PlanningSession[]; events: PlanningEvent[]; targets: PlanningTarget[]; weekStartsOn: 0 | 1; demo?: boolean }) {
  const activeSessionIds = new Set(sessions.filter((session) => session.completions.some((completion) => completion.status === "IN_PROGRESS")).map((session) => session.id));

  return (
    <CoachShell active="Planning">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-[var(--color-brand-strong)]">Planning {period.mode === "week" ? "hebdomadaire" : "mensuel"}</p>
          <h1 className="mt-1 text-3xl font-black">Planning</h1>
          <p className="mt-1 text-sm font-medium text-[var(--color-ink-muted)]">{periodLabel(period)}</p>
        </div>
        <PlanningEventForm targets={targets} demo={demo} />
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-full border border-[var(--color-border)] bg-white p-1">
          <PlanningModeLink mode="week" active={period.mode === "week"} period={period} weekStartsOn={weekStartsOn}>Semaine</PlanningModeLink>
          <PlanningModeLink mode="month" active={period.mode === "month"} period={period} weekStartsOn={weekStartsOn}>Mois</PlanningModeLink>
        </div>

        {period.mode === "week" ? (
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm"><Link href={planningHref("week", addMontrealDays(period.weekStart, -7), weekStartsOn)}><ChevronLeft className="h-4 w-4" /> Semaine précédente</Link></Button>
            <Button asChild variant="outline" size="sm"><Link href="/coach/planning?view=week">Aujourd&apos;hui</Link></Button>
            <Button asChild variant="outline" size="sm"><Link href={planningHref("week", addMontrealDays(period.weekStart, 7), weekStartsOn)}>Semaine suivante <ChevronRight className="h-4 w-4" /></Link></Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm"><Link href={planningHref("month", addMontrealMonths(period.rangeStart, -1), weekStartsOn)}><ChevronLeft className="h-4 w-4" /> Mois précédent</Link></Button>
            <Button asChild variant="outline" size="sm"><Link href="/coach/planning?view=month">Aujourd&apos;hui</Link></Button>
            <Button asChild variant="outline" size="sm"><Link href={planningHref("month", addMontrealMonths(period.rangeStart, 1), weekStartsOn)}>Mois suivant <ChevronRight className="h-4 w-4" /></Link></Button>
            <span className="inline-flex items-center gap-2 px-2 text-sm font-bold text-[var(--color-ink-muted)]">
              <CalendarDays className="h-4 w-4" />
              {sessions.length} séance{sessions.length > 1 ? "s" : ""} · {events.length} événement{events.length > 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>

      {period.mode === "month" ? (
        <MonthCalendar period={period} sessions={sessions} events={events} activeSessionIds={activeSessionIds} targets={targets} weekStartsOn={weekStartsOn} demo={demo} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-soft)]">
          <div className="grid min-w-[980px] grid-cols-7 gap-px bg-[var(--color-border)]">
          {weekDays(period.weekStart).map((day) => (
            <DayColumn
              key={day.key}
              day={day}
              sessions={sessions.filter((session) => sameMontrealDay(session.date, day.date))}
              events={events.filter((event) => sameMontrealDay(event.startsAt, day.date))}
              targets={targets}
              activeSessionIds={activeSessionIds}
              demo={demo}
            />
          ))}
          </div>
        </div>
      )}
    </CoachShell>
  );
}

function PlanningModeLink({ mode, active, period, weekStartsOn, children }: { mode: PlanningMode; active: boolean; period: PlanningPeriod; weekStartsOn: 0 | 1; children: React.ReactNode }) {
  return (
    <Link
      href={planningHref(mode, period.mode === "week" ? period.weekStart : period.rangeStart, weekStartsOn)}
      className={`inline-flex min-h-9 items-center rounded-full px-4 text-sm font-black focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${active ? "bg-[var(--block-pool-bg)] text-[var(--block-pool-fg)] shadow-sm" : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"}`}
      aria-current={active ? "page" : undefined}
    >
      {children}
    </Link>
  );
}

function DayColumn({ day, sessions, events, activeSessionIds, targets, demo }: { day: { key: number | string; label: string; date: Date }; sessions: PlanningSession[]; events: PlanningEvent[]; activeSessionIds: Set<string>; targets: PlanningTarget[]; demo: boolean }) {
  return (
    <div className={`min-h-[420px] bg-white ${sameMontrealDay(day.date, new Date()) ? "bg-[var(--color-action)]/[0.035]" : ""}`}>
      <div className="sticky top-0 z-10 flex min-h-[58px] flex-col items-center justify-center border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] px-2 py-2 text-center">
          <div>
            <div className="text-sm font-black">{day.label}</div>
            <div className="text-xs font-bold text-[var(--color-ink-soft)]">{formatMontrealDate(day.date, { day: "2-digit", month: "short" })}</div>
          </div>
      </div>

        <div className="space-y-2 p-2">
          {sessions.map((session) => <PlanningSessionCard key={session.id} session={session} active={activeSessionIds.has(session.id)} demo={demo} />)}
          {events.map((event) => <PlanningEventCard key={event.id} event={event} targets={targets} demo={demo} />)}
          {sessions.length === 0 && events.length === 0 && (
            <div className="flex min-h-28 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-border-strong)] p-3 text-center">
              <div className="text-xs font-black text-[var(--color-ink-muted)]">Jour libre</div>
              <Link href="/coach/sessions/new" className="mt-2 inline-flex min-h-9 items-center text-xs font-bold text-[var(--color-brand-strong)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">Ajouter une séance</Link>
            </div>
          )}
        </div>
    </div>
  );
}

function MonthCalendar({ period, sessions, events, activeSessionIds, targets, weekStartsOn, demo }: { period: PlanningPeriod; sessions: PlanningSession[]; events: PlanningEvent[]; activeSessionIds: Set<string>; targets: PlanningTarget[]; weekStartsOn: 0 | 1; demo: boolean }) {
  const days = monthCalendarDays(period.rangeStart, period.rangeEnd, weekStartsOn);

  return (
    <div className="overflow-hidden rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-white shadow-[var(--shadow-soft)]">
      <div className="grid grid-cols-7 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)]">
        {(weekStartsOn === 0 ? ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"] : ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]).map((day) => (
          <div key={day} className="px-2 py-3 text-center text-xs font-black uppercase text-[var(--color-ink-muted)]">{day}</div>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-7">
        {days.map((day) => {
          const daySessions = sessions.filter((session) => sameMontrealDay(session.date, day.date));
          const dayEvents = events.filter((event) => sameMontrealDay(event.startsAt, day.date));
          return (
            <div key={day.key} className={`min-h-36 border-b border-r border-[var(--color-border)] p-2 ${day.inMonth ? "bg-white" : "bg-[var(--color-surface-raised)]/55 text-[var(--color-ink-soft)]"}`}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-black">{formatMontrealDate(day.date, { day: "2-digit" })}</div>
                  <div className="text-[11px] font-bold text-[var(--color-ink-soft)] sm:hidden">{formatMontrealDate(day.date, { weekday: "long" })}</div>
                </div>
                {(daySessions.length > 0 || dayEvents.length > 0) && <span className="rounded-full bg-[var(--color-surface-raised)] px-2 py-0.5 text-[11px] font-black text-[var(--color-ink-muted)]">{daySessions.length + dayEvents.length}</span>}
              </div>
              <div className="space-y-1.5">
                {daySessions.slice(0, 2).map((session) => <MonthSessionItem key={session.id} session={session} active={activeSessionIds.has(session.id)} demo={demo} />)}
                {dayEvents.slice(0, 3).map((event) => <MonthEventItem key={event.id} event={event} targets={targets} demo={demo} />)}
                {daySessions.length + dayEvents.length > 5 && <div className="text-[11px] font-black text-[var(--color-ink-muted)]">+{daySessions.length + dayEvents.length - 5}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlanningSessionCard({ session, active, demo }: { session: PlanningSession; active: boolean; demo: boolean }) {
  const status = active ? "IN_PROGRESS" : session.status;
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
      {session.focus && <p className="mt-1 text-sm leading-5 text-[var(--color-ink-muted)]">{session.focus}</p>}
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
    </article>
  );
}

function PlanningEventCard({ event, targets, demo }: { event: PlanningEvent; targets: PlanningTarget[]; demo: boolean }) {
  const target = event.groupId ? `group:${event.groupId}` : event.athleteId ? `athlete:${event.athleteId}` : "club";
  return (
    <article className={`rounded-2xl border p-3 ${eventTone(event.type)}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-1 text-xs font-black"><Trophy className="h-3.5 w-3.5" /> {eventTypeLabel(event.type)}</span>
        <div className="flex items-center gap-1"><span className="text-xs font-bold">{formatMontrealTime(event.startsAt)}</span><PlanningEventEditor event={{ ...event, startsAt: toMontrealDateTimeInputValue(event.startsAt), endsAt: event.endsAt ? toMontrealDateTimeInputValue(event.endsAt) : "", target }} targets={targets} /></div>
      </div>
      <div className="mt-3 font-black leading-tight">{event.title}</div>
      <div className="mt-2 space-y-1 text-xs font-bold opacity-80">
        {event.duration && <div><Clock3 className="mr-1 inline h-3.5 w-3.5" /> {event.duration} min</div>}
        {event.location && <div><MapPin className="mr-1 inline h-3.5 w-3.5" /> {event.location}</div>}
        <div>{event.athleteName ?? event.groupName ?? "Club complet"}</div>
      </div>
      {event.notes && <p className="mt-2 text-sm leading-5 opacity-80">{event.notes}</p>}
      {event.type === "TRAINING_SCHEDULE" && <Button asChild size="sm" variant="outline" className="mt-3 w-full justify-between"><Link href={demo ? "/coach/sessions/demo" : `/coach/sessions/new?planningEventId=${event.id}`}>{demo ? "Voir la séance démo" : "Créer la séance"}<CalendarPlus className="h-4 w-4" /></Link></Button>}
    </article>
  );
}

function MonthSessionItem({ session, active, demo }: { session: PlanningSession; active: boolean; demo: boolean }) {
  const href = demo ? "/coach/sessions/demo" : `/coach/sessions/${session.id}`;
  return (
    <Link href={href} className={`block rounded-lg border px-2 py-1.5 text-xs font-black leading-tight focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${statusTone(active ? "IN_PROGRESS" : session.status)}`}>
      <span className="block text-[10px] font-bold opacity-70">{formatMontrealTime(session.date)}</span>
      {session.title}
    </Link>
  );
}

function MonthEventItem({ event, targets, demo }: { event: PlanningEvent; targets: PlanningTarget[]; demo: boolean }) {
  const target = event.groupId ? `group:${event.groupId}` : event.athleteId ? `athlete:${event.athleteId}` : "club";
  return (
    <div className={`rounded-lg border px-2 py-1.5 text-xs font-black leading-tight ${eventTone(event.type)}`}>
      <div className="flex items-start justify-between gap-1"><span className="block text-[10px] font-bold opacity-70">{formatMontrealTime(event.startsAt)} · {eventTypeLabel(event.type)}</span><PlanningEventEditor compact event={{ ...event, startsAt: toMontrealDateTimeInputValue(event.startsAt), endsAt: event.endsAt ? toMontrealDateTimeInputValue(event.endsAt) : "", target }} targets={targets} /></div>
      <div>{event.title}</div>
      {event.type === "TRAINING_SCHEDULE" && <Link href={demo ? "/coach/sessions/demo" : `/coach/sessions/new?planningEventId=${event.id}`} className="mt-1 inline-flex min-h-8 items-center gap-1 text-[11px] font-black underline">{demo ? "Séance démo" : "Créer la séance"}</Link>}
    </div>
  );
}

function statusTone(status: string) {
  if (status === "DRAFT") return "border-[var(--block-dryland-fg)]/20 bg-[var(--block-dryland-bg)]/45";
  if (status === "IN_PROGRESS") return "border-[var(--color-action)] bg-white";
  if (status === "COMPLETED") return "border-[var(--color-success)]/25 bg-[var(--color-success-soft)]/55";
  if (status === "NOT_DONE") return "border-[var(--color-danger)]/20 bg-[var(--color-danger)]/10";
  return "border-[var(--block-pool-fg)]/20 bg-[var(--block-pool-bg)]/45";
}

function eventTone(type: string) {
  if (type === "COMPETITION") return "border-[var(--color-action)]/30 bg-[var(--color-action)]/12 text-[var(--color-ink)]";
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
