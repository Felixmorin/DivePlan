import Link from "next/link";
import type { BlockType, CompletionStatus, PlanningEventType, SessionStatus } from "@prisma/client";
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, Clock3, Edit, MapPin, Printer, Trophy, Users, Waves } from "lucide-react";
import { createPlanningEvent } from "@/app/coach/planning/actions";
import { CoachShell } from "@/components/coach/coach-shell";
import { BlockTypeBadge } from "@/components/training/block-type-badge";
import { StatusPill } from "@/components/training/status-pill";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { athletes as demoAthletes, demoSession, weekSessions } from "@/lib/data";
import { requireCoach } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { addMontrealDays, formatMontrealDate, formatMontrealTime, parseMontrealSessionDate, sameMontrealDay, startOfMontrealWeek, toMontrealDateInputValue } from "@/lib/timezone";

export const dynamic = "force-dynamic";

type PlanningSession = {
  id: string;
  title: string;
  focus: string;
  date: Date;
  duration: number;
  status: SessionStatus | string;
  blocks: Array<{ type: BlockType | string; estimatedVolume: number; assignments: Array<{ athleteId: string }> }>;
  completions: Array<{ status: CompletionStatus | string }>;
};

type PlanningEvent = {
  id: string;
  type: PlanningEventType | string;
  title: string;
  startsAt: Date;
  duration: number | null;
  location: string | null;
  notes: string | null;
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
  const period = getPlanningPeriod(params);
  const { clubId } = await requireCoach();
  if (clubId === "dev-club") {
    return <DemoPlanningPage period={period} />;
  }

  const [rawSessions, rawEvents, groups, athletes] = await Promise.all([
    prisma.trainingSession.findMany({
      where: { week: { clubId }, date: { gte: period.rangeStart, lt: period.rangeEnd } },
      orderBy: { date: "asc" },
      include: {
        blocks: { orderBy: { position: "asc" }, include: { assignments: true } },
        completions: true
      }
    }),
    prisma.planningEvent.findMany({
      where: { clubId, startsAt: { gte: period.rangeStart, lt: period.rangeEnd } },
      orderBy: { startsAt: "asc" },
      include: { group: true, athlete: { include: { user: true } } }
    }),
    prisma.trainingGroup.findMany({ where: { clubId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.athlete.findMany({ where: { clubId, active: true }, orderBy: { user: { firstName: "asc" } }, include: { user: true } })
  ]);
  const sessions: PlanningSession[] = rawSessions.map((session) => ({
    id: session.id,
    title: session.title,
    focus: session.focus,
    date: session.date,
    duration: session.duration,
    status: session.status,
    blocks: session.blocks,
    completions: session.completions
  }));
  const events: PlanningEvent[] = rawEvents.map((event) => ({
    id: event.id,
    type: event.type,
    title: event.title,
    startsAt: event.startsAt,
    duration: event.duration,
    location: event.location,
    notes: event.notes,
    groupName: event.group?.name ?? null,
    athleteName: event.athlete ? `${event.athlete.user.firstName} ${event.athlete.user.lastName}` : null
  }));
  const targets: PlanningTarget[] = [
    ...groups.map((group) => ({ id: group.id, label: group.name, kind: "group" as const })),
    ...athletes.map((athlete) => ({ id: athlete.id, label: `${athlete.user.firstName} ${athlete.user.lastName}`, kind: "athlete" as const }))
  ];

  return <PlanningView period={period} sessions={sessions} events={events} targets={targets} />;
}

function DemoPlanningPage({ period }: { period: PlanningPeriod }) {
  const sessions = weekSessions.filter((session) => session.title).map((session, index) => ({
    id: index === 1 ? "demo" : `demo-${index}`,
    title: session.title,
    focus: session.focus,
    date: addMontrealDays(period.weekStart, index),
    duration: session.duration,
    status: session.status === "Brouillon" ? "DRAFT" : session.status === "Complete" ? "COMPLETED" : "READY",
    blocks: demoSession.blocks.map((block) => ({ type: block.type, estimatedVolume: block.volume, assignments: block.assignedTo.map((athleteId) => ({ athleteId })) })),
    completions: []
  })) satisfies PlanningSession[];
  const events: PlanningEvent[] = [
    {
      id: "demo-event-competition",
      type: "COMPETITION",
      title: "Invitation provinciale",
      startsAt: addMontrealDays(period.weekStart, 4),
      duration: 180,
      location: "Centre aquatique",
      notes: "Liste finale des plongeons a confirmer.",
      groupName: "Provincial",
      athleteName: null
    },
    {
      id: "demo-event-camp",
      type: "CAMP",
      title: "Camp technique",
      startsAt: addMontrealDays(period.weekStart, 2),
      duration: 240,
      location: "Bassin principal",
      notes: null,
      groupName: "Provincial",
      athleteName: null
    }
  ];
  const targets: PlanningTarget[] = [
    { id: "provincial", label: "Provincial", kind: "group" },
    ...demoAthletes.map((athlete) => ({ id: athlete.id, label: `${athlete.firstName} ${athlete.lastName}`, kind: "athlete" as const }))
  ];

  return <PlanningView period={period} sessions={sessions} events={events} targets={targets} demo />;
}

function PlanningView({ period, sessions, events, targets, demo = false }: { period: PlanningPeriod; sessions: PlanningSession[]; events: PlanningEvent[]; targets: PlanningTarget[]; demo?: boolean }) {
  const activeSessionIds = new Set(sessions.filter((session) => session.completions.some((completion) => completion.status === "IN_PROGRESS")).map((session) => session.id));
  const stats = {
    draft: sessions.filter((session) => session.status === "DRAFT").length,
    ready: sessions.filter((session) => session.status === "READY").length,
    completed: sessions.filter((session) => session.status === "COMPLETED").length,
    notDone: sessions.filter((session) => session.status === "NOT_DONE").length,
    inProgress: activeSessionIds.size,
    events: events.length
  };

  return (
    <CoachShell active="Planning">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-black uppercase text-[var(--color-brand-strong)]">Planning {period.mode === "week" ? "hebdomadaire" : "mensuel"}</p>
          <h1 className="mt-2 text-3xl font-black">{periodLabel(period)}</h1>
          <p className="mt-1 text-[var(--color-ink-muted)]">Vue par jour, statuts de publication et volume disponible.</p>
        </div>
        <Button asChild variant="action"><Link href={demo ? "/coach/sessions/demo" : "/coach/sessions/new"}><CalendarPlus className="h-4 w-4" /> {demo ? "Voir la demo" : "Nouvelle séance"}</Link></Button>
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-full border border-[var(--color-border)] bg-white p-1">
          <PlanningModeLink mode="week" active={period.mode === "week"} period={period}>Semaine</PlanningModeLink>
          <PlanningModeLink mode="month" active={period.mode === "month"} period={period}>Mois</PlanningModeLink>
        </div>

        {period.mode === "week" ? (
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm"><Link href={planningHref("week", addMontrealDays(period.weekStart, -7))}><ChevronLeft className="h-4 w-4" /> Semaine précédente</Link></Button>
            <Button asChild variant="outline" size="sm"><Link href="/coach/planning?view=week">Aujourd&apos;hui</Link></Button>
            <Button asChild variant="outline" size="sm"><Link href={planningHref("week", addMontrealDays(period.weekStart, 7))}>Semaine suivante <ChevronRight className="h-4 w-4" /></Link></Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm"><Link href={planningHref("month", addMontrealMonths(period.rangeStart, -1))}><ChevronLeft className="h-4 w-4" /> Mois précédent</Link></Button>
            <Button asChild variant="outline" size="sm"><Link href="/coach/planning?view=month">Aujourd&apos;hui</Link></Button>
            <Button asChild variant="outline" size="sm"><Link href={planningHref("month", addMontrealMonths(period.rangeStart, 1))}>Mois suivant <ChevronRight className="h-4 w-4" /></Link></Button>
            <span className="inline-flex items-center gap-2 px-2 text-sm font-bold text-[var(--color-ink-muted)]">
              <CalendarDays className="h-4 w-4" />
              {sessions.length} séance{sessions.length > 1 ? "s" : ""} · {events.length} événement{events.length > 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-6">
        <PlanningStat label="Brouillons" value={stats.draft} tone="draft" />
        <PlanningStat label="Publiées" value={stats.ready} tone="ready" />
        <PlanningStat label="En cours" value={stats.inProgress} tone="active" />
        <PlanningStat label="Terminées" value={stats.completed} tone="done" />
        <PlanningStat label="Non faites" value={stats.notDone} tone="notDone" />
        <PlanningStat label="Événements" value={stats.events} tone="event" />
      </div>

      <AddPlanningEventPanel targets={targets} demo={demo} />

      {sessions.length === 0 && events.length === 0 ? (
        <EmptyState title={period.mode === "week" ? "Aucune séance cette semaine" : "Aucune séance ce mois-ci"} description="Ajoute une séance pour commencer la planification." action={<Button asChild variant="action"><Link href="/coach/sessions/new">Créer une séance</Link></Button>} />
      ) : period.mode === "month" ? (
        <MonthCalendar period={period} sessions={sessions} events={events} activeSessionIds={activeSessionIds} demo={demo} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-7">
          {weekDays(period.weekStart).map((day) => (
            <DayColumn
              key={day.key}
              day={day}
              sessions={sessions.filter((session) => sameMontrealDay(session.date, day.date))}
              events={events.filter((event) => sameMontrealDay(event.startsAt, day.date))}
              activeSessionIds={activeSessionIds}
              demo={demo}
            />
          ))}
        </div>
      )}
    </CoachShell>
  );
}

function PlanningModeLink({ mode, active, period, children }: { mode: PlanningMode; active: boolean; period: PlanningPeriod; children: React.ReactNode }) {
  return (
    <Link
      href={planningHref(mode, period.mode === "week" ? period.weekStart : period.rangeStart)}
      className={`inline-flex min-h-9 items-center rounded-full px-4 text-sm font-black focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${active ? "bg-[var(--block-pool-bg)] text-[var(--block-pool-fg)] shadow-sm" : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"}`}
      aria-current={active ? "page" : undefined}
    >
      {children}
    </Link>
  );
}

function AddPlanningEventPanel({ targets, demo }: { targets: PlanningTarget[]; demo: boolean }) {
  return (
    <Card className="mb-5">
      <CardContent className="p-4">
        <form action={demo ? undefined : createPlanningEvent} className="grid gap-3 lg:grid-cols-[160px_1.2fr_190px_160px_1fr_auto]">
          <Field label="Type">
            <select name="type" disabled={demo} className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm font-semibold focus:outline-none focus:shadow-[var(--focus-ring)]">
              <option value="COMPETITION">Compétition</option>
              <option value="CAMP">Camp</option>
              <option value="TRAINING_SCHEDULE">Horaire entraînement</option>
            </select>
          </Field>
          <Field label="Titre"><Input name="title" placeholder="Ex: Camp technique" disabled={demo} required /></Field>
          <Field label="Date et heure"><Input name="startsAt" type="datetime-local" disabled={demo} required /></Field>
          <Field label="Durée"><Input name="duration" type="number" min="1" placeholder="minutes" disabled={demo} /></Field>
          <Field label="Association">
            <select name="target" disabled={demo} className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm font-semibold focus:outline-none focus:shadow-[var(--focus-ring)]">
              <option value="club">Club complet</option>
              {targets.map((target) => (
                <option key={`${target.kind}:${target.id}`} value={`${target.kind}:${target.id}`}>{target.kind === "group" ? "Groupe" : "Athlète"} · {target.label}</option>
              ))}
            </select>
          </Field>
          <div className="flex items-end">
            <Button type="submit" variant="action" disabled={demo} className="w-full lg:w-auto"><CalendarPlus className="h-4 w-4" /> Ajouter</Button>
          </div>
          <Field label="Lieu" className="lg:col-span-2"><Input name="location" placeholder="Piscine, ville, bassin..." disabled={demo} /></Field>
          <Field label="Notes" className="lg:col-span-4"><Textarea name="notes" placeholder="Détails utiles pour le coach" disabled={demo} className="min-h-11" /></Field>
        </form>
        {demo && <p className="mt-3 text-sm font-semibold text-[var(--color-ink-muted)]">Les événements sont visibles en démo, mais l&apos;ajout est disponible avec un club connecté à la base de données.</p>}
      </CardContent>
    </Card>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={`block min-w-0 text-xs font-black uppercase text-[var(--color-ink-muted)] ${className ?? ""}`}><span className="mb-1 block">{label}</span>{children}</label>;
}

function DayColumn({ day, sessions, events, activeSessionIds, demo, compact = false }: { day: { key: number | string; label: string; date: Date }; sessions: PlanningSession[]; events: PlanningEvent[]; activeSessionIds: Set<string>; demo: boolean; compact?: boolean }) {
  return (
    <Card className={compact ? "min-h-0" : "min-h-0 lg:min-h-96"}>
      <CardContent className="p-4">
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-[var(--color-border)] pb-3">
          <div>
            <div className="text-lg font-black lg:text-base">{day.label}</div>
            <div className="text-xs font-bold text-[var(--color-ink-soft)]">{formatMontrealDate(day.date, { day: "2-digit", month: "short" })}</div>
          </div>
          <span className="rounded-full bg-[var(--color-surface-raised)] px-2.5 py-1 text-xs font-black text-[var(--color-ink-muted)]">{sessions.length + events.length || "Repos"}</span>
        </div>

        <div className="space-y-3">
          {sessions.map((session) => <PlanningSessionCard key={session.id} session={session} active={activeSessionIds.has(session.id)} demo={demo} />)}
          {events.map((event) => <PlanningEventCard key={event.id} event={event} />)}
          {sessions.length === 0 && events.length === 0 && (
            <div className="rounded-2xl border border-dashed border-[var(--color-border-strong)] p-4">
              <div className="text-sm font-black text-[var(--color-ink-muted)]">Jour libre</div>
              <Link href="/coach/sessions/new" className="mt-2 inline-flex min-h-11 items-center text-sm font-black text-[var(--color-brand-strong)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">Préparer une séance</Link>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MonthCalendar({ period, sessions, events, activeSessionIds, demo }: { period: PlanningPeriod; sessions: PlanningSession[]; events: PlanningEvent[]; activeSessionIds: Set<string>; demo: boolean }) {
  const days = monthCalendarDays(period.rangeStart, period.rangeEnd);

  return (
    <div className="overflow-hidden rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-white shadow-[var(--shadow-soft)]">
      <div className="grid grid-cols-7 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)]">
        {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((day) => (
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
                {dayEvents.slice(0, 3).map((event) => <MonthEventItem key={event.id} event={event} />)}
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
      <p className="mt-1 text-sm leading-5 text-[var(--color-ink-muted)]">{session.focus}</p>
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

function PlanningEventCard({ event }: { event: PlanningEvent }) {
  return (
    <article className={`rounded-2xl border p-3 ${eventTone(event.type)}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-1 text-xs font-black"><Trophy className="h-3.5 w-3.5" /> {eventTypeLabel(event.type)}</span>
        <span className="text-xs font-bold">{formatMontrealTime(event.startsAt)}</span>
      </div>
      <div className="mt-3 font-black leading-tight">{event.title}</div>
      <div className="mt-2 space-y-1 text-xs font-bold opacity-80">
        {event.duration && <div><Clock3 className="mr-1 inline h-3.5 w-3.5" /> {event.duration} min</div>}
        {event.location && <div><MapPin className="mr-1 inline h-3.5 w-3.5" /> {event.location}</div>}
        <div>{event.athleteName ?? event.groupName ?? "Club complet"}</div>
      </div>
      {event.notes && <p className="mt-2 text-sm leading-5 opacity-80">{event.notes}</p>}
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

function MonthEventItem({ event }: { event: PlanningEvent }) {
  return (
    <div className={`rounded-lg border px-2 py-1.5 text-xs font-black leading-tight ${eventTone(event.type)}`}>
      <span className="block text-[10px] font-bold opacity-70">{formatMontrealTime(event.startsAt)} · {eventTypeLabel(event.type)}</span>
      {event.title}
    </div>
  );
}

function PlanningStat({ label, value, tone }: { label: string; value: number; tone: "draft" | "ready" | "active" | "done" | "notDone" | "event" }) {
  const tones = {
    draft: "bg-[var(--block-dryland-bg)] text-[var(--block-dryland-fg)]",
    ready: "bg-[var(--block-pool-bg)] text-[var(--block-pool-fg)]",
    active: "bg-[var(--color-action)] text-white",
    done: "bg-[var(--color-success-soft)] text-[var(--color-success)]",
    notDone: "bg-[var(--color-danger)]/10 text-[var(--color-danger)]",
    event: "bg-white text-[var(--color-ink)]"
  };

  return <div className={`rounded-2xl p-4 ${tones[tone]}`}><div className="text-xs font-black uppercase opacity-75">{label}</div><div className="mt-2 text-3xl font-black">{value}</div></div>;
}

function statusTone(status: SessionStatus | string) {
  if (status === "DRAFT") return "border-[var(--block-dryland-fg)]/20 bg-[var(--block-dryland-bg)]/45";
  if (status === "IN_PROGRESS") return "border-[var(--color-action)] bg-white";
  if (status === "COMPLETED") return "border-[var(--color-success)]/25 bg-[var(--color-success-soft)]/55";
  if (status === "NOT_DONE") return "border-[var(--color-danger)]/20 bg-[var(--color-danger)]/10";
  return "border-[var(--block-pool-fg)]/20 bg-[var(--block-pool-bg)]/45";
}

function eventTone(type: PlanningEventType | string) {
  if (type === "COMPETITION") return "border-[var(--color-action)]/30 bg-[var(--color-action)]/12 text-[var(--color-ink)]";
  if (type === "CAMP") return "border-[var(--block-dryland-fg)]/25 bg-[var(--block-dryland-bg)]/70 text-[var(--block-dryland-fg)]";
  return "border-[var(--color-brand)]/25 bg-[var(--color-surface-raised)] text-[var(--color-brand-strong)]";
}

function eventTypeLabel(type: PlanningEventType | string) {
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
  return ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"].map((label, index) => ({ key: index + 1, label, date: addMontrealDays(weekStart, index) }));
}

function monthCalendarDays(monthStart: Date, monthEnd: Date) {
  const calendarStart = startOfMontrealWeek(monthStart);
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

function getPlanningPeriod(params: PlanningSearchParams): PlanningPeriod {
  const mode: PlanningMode = getFirstParam(params.view) === "month" ? "month" : "week";
  const today = new Date();
  const weekStart = parseWeekParam(getFirstParam(params.week)) ?? startOfMontrealWeek(today);
  const monthStart = parseMonthParam(getFirstParam(params.month)) ?? startOfMontrealMonth(today);

  if (mode === "month") {
    return {
      mode,
      weekStart: startOfMontrealWeek(monthStart),
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

function parseWeekParam(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return startOfMontrealWeek(parseMontrealSessionDate(value, "12:00"));
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

function planningHref(mode: PlanningMode, date: Date) {
  if (mode === "month") return `/coach/planning?view=month&month=${toMonthKey(date)}`;
  return `/coach/planning?view=week&week=${toMontrealDateInputValue(startOfMontrealWeek(date))}`;
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
