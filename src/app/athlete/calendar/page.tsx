import { CalendarDays, ChevronLeft, ChevronRight, Clock3, List, MapPin, TentTree, Trophy, Users, Waves } from "lucide-react";
import Link from "next/link";
import type { PlanningEventType } from "@prisma/client";
import { AthleteShell } from "@/components/athlete/athlete-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { getAthletePlanningEvents, type AthletePlanningEvent } from "@/lib/athlete-planning";
import { requireAthlete } from "@/lib/current-user";
import { addMontrealDays, formatMontrealCountdown, formatMontrealDate, formatMontrealTime, parseMontrealSessionDate, startOfMontrealWeek, toMontrealDateInputValue } from "@/lib/timezone";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const eventStyles: Record<PlanningEventType, { label: string; icon: typeof Trophy; className: string }> = {
  COMPETITION: { label: "Compétition", icon: Trophy, className: "bg-amber-400/16 text-amber-200" },
  CAMP: { label: "Camp", icon: TentTree, className: "bg-cyan-400/14 text-cyan-200" },
  TRAINING_SCHEDULE: { label: "Horaire", icon: Waves, className: "bg-[var(--color-brand)]/18 text-sky-200" }
};

export default async function AthleteCalendarPage({ searchParams }: { searchParams: Promise<{ view?: string | string[]; month?: string | string[] }> }) {
  const { athlete, clubId } = await requireAthlete();
  const viewParam = searchParams ? await searchParams : {};
  const calendarView = (Array.isArray(viewParam.view) ? viewParam.view[0] : viewParam.view) === "calendar";
  const requestedMonth = Array.isArray(viewParam.month) ? viewParam.month[0] : viewParam.month;
  const monthKey = getValidMonthKey(requestedMonth);
  const monthStart = parseMontrealSessionDate(`${monthKey}-01`, "00:00");
  const calendarGridStart = startOfMontrealWeek(monthStart);
  const calendarGridEnd = addMontrealDays(calendarGridStart, 42);
  const events = calendarView
    ? await getAthletePlanningEvents({ athleteId: athlete.id, clubId, groupId: athlete.groupId, rangeStart: calendarGridStart, rangeEnd: calendarGridEnd, includeOverlapping: true })
    : await getAthletePlanningEvents({ athleteId: athlete.id, clubId, groupId: athlete.groupId });
  const countdownEvents = calendarView
    ? await getAthletePlanningEvents({ athleteId: athlete.id, clubId, groupId: athlete.groupId })
    : events;
  const monthGroups = groupEventsByMonth(events);
  const nextCompetition = countdownEvents.find((event) => event.type === "COMPETITION" && event.startsAt >= new Date());

  return (
    <AthleteShell>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black">Calendrier</h1>
        </div>
        <div className="flex rounded-full border border-white/10 bg-white/[0.04] p-1" aria-label="Choisir l’affichage du calendrier">
          <ViewLink href="/athlete/calendar?view=list" active={!calendarView} icon={<List className="h-4 w-4" />}>Liste</ViewLink>
          <ViewLink href="/athlete/calendar?view=calendar" active={calendarView} icon={<CalendarDays className="h-4 w-4" />}>Calendrier</ViewLink>
        </div>
        {nextCompetition && <div className="w-full rounded-[var(--radius-panel)] border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm font-bold text-amber-100"><Trophy className="mr-2 inline h-4 w-4" />Prochaine compétition : <span className="font-black">{formatMontrealCountdown(nextCompetition.startsAt)}</span> · {nextCompetition.title}</div>}
      </header>

      {calendarView ? <MonthCalendar events={events} monthKey={monthKey} /> : <div className="space-y-7">
        {monthGroups.map(([month, monthEvents]) => (
          <section key={month} aria-labelledby={`month-${month}`}>
            <h2 id={`month-${month}`} className="mb-3 text-sm font-black uppercase tracking-wide text-white/48">{month}</h2>
            <div className="space-y-3">
              {monthEvents.map((event) => <EventCard key={event.id} event={event} />)}
            </div>
          </section>
        ))}

        {events.length === 0 && (
          <EmptyState
            className="border-white/10 bg-white/6"
            title="Aucun événement à venir"
            description="Les compétitions, camps et changements d'horaire publiés par ton club apparaîtront ici."
          />
        )}
      </div>}
    </AthleteShell>
  );
}

function ViewLink({ href, active, icon, children }: { href: string; active: boolean; icon: React.ReactNode; children: React.ReactNode }) {
  return <Link href={href} aria-current={active ? "page" : undefined} className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-black transition", active ? "bg-[var(--color-club-red)] text-white shadow-[0_5px_16px_rgba(237,22,61,.25)]" : "text-white/55 hover:text-white")}>{icon}{children}</Link>;
}

function MonthCalendar({ events, monthKey }: { events: AthletePlanningEvent[]; monthKey: string }) {
  const monthStart = parseMontrealSessionDate(`${monthKey}-01`, "00:00");
  const monthEnd = addMontrealDays(monthStart, daysInMonth(monthStart));
  const todayKey = toMontrealDateInputValue(new Date());
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = addMontrealDays(startOfMontrealWeek(monthStart), index);
    return { date, key: toMontrealDateInputValue(date), inMonth: toMontrealDateInputValue(date).startsWith(monthKey) };
  });
  const eventsByDay = new Map<string, AthletePlanningEvent[]>();
  for (const event of events) {
    const end = event.endsAt ?? event.startsAt;
    for (let date = event.startsAt; date <= end; date = addMontrealDays(date, 1)) {
      const key = toMontrealDateInputValue(date);
      eventsByDay.set(key, [...(eventsByDay.get(key) ?? []), event]);
    }
  }

  const monthEvents = events.filter((event) => event.startsAt < monthEnd && (event.endsAt === null || event.endsAt >= monthStart));

  return <div className="space-y-4">
  <section aria-label="Calendrier mensuel" className="overflow-hidden rounded-[var(--radius-panel)] border border-white/10 bg-[var(--color-athlete-panel)] shadow-[0_14px_35px_rgba(0,0,0,0.18)]">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-4"><div><p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/42">Aperçu du mois</p><h2 className="mt-1 text-xl font-black capitalize">{formatMontrealDate(monthStart, { month: "long", year: "numeric" })}</h2></div><div className="flex items-center gap-2"><MonthNavigationLink monthKey={shiftMonthKey(monthKey, -1)} label="Mois précédent" icon={<ChevronLeft className="h-4 w-4" />} /><span className="rounded-full bg-[var(--color-club-red)]/14 px-3 py-1.5 text-xs font-black text-[var(--color-club-red-soft)]">{monthEvents.length} événement{monthEvents.length > 1 ? "s" : ""}</span><MonthNavigationLink monthKey={shiftMonthKey(monthKey, 1)} label="Mois suivant" icon={<ChevronRight className="h-4 w-4" />} /></div></div>
    <div className="grid grid-cols-7 border-b border-white/10 bg-white/[0.03] text-center text-[10px] font-black uppercase tracking-wide text-white/52">
      {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((day) => <div key={day} className="py-3">{day}</div>)}
    </div>
    <div className="grid grid-cols-7">
      {days.map(({ date, key, inMonth }) => {
        const dayEvents = eventsByDay.get(key) ?? [];
        return <div key={key} className={cn("min-h-28 border-r border-b border-white/8 p-1.5 sm:min-h-32 sm:p-2", !inMonth && "bg-black/20 opacity-35", key === todayKey && "bg-[var(--color-club-red)]/[0.05]")}>
          <div className={cn("mb-1.5 flex items-center justify-between text-xs font-black", key === todayKey && "text-[var(--color-club-red-soft)]")}><span className={cn("grid h-6 w-6 place-items-center rounded-full", key === todayKey && "bg-[var(--color-club-red)] text-white")}>{formatMontrealDate(date, { day: "numeric" })}</span>{dayEvents.length > 0 && <span className="text-[10px] text-white/45">{dayEvents.length}</span>}</div>
          <div className="space-y-1">
            {dayEvents.slice(0, 3).map((event) => <a key={event.id} href={`#event-${event.id}`} title={`${event.title} · ${formatMontrealTime(event.startsAt)}`} className="block overflow-hidden rounded-lg border border-[var(--color-club-red)]/25 bg-[var(--color-club-red)]/12 px-1.5 py-1.5 text-[11px] font-black leading-tight text-[var(--color-club-red-soft)]"><span className="block text-[10px] font-bold text-white/60">{formatMontrealTime(event.startsAt)}</span><span className="block line-clamp-2">{event.title}</span></a>)}
            {dayEvents.length > 3 && <div className="px-1 text-[10px] font-bold text-white/55">+{dayEvents.length - 3} autre{dayEvents.length - 3 > 1 ? "s" : ""}</div>}
          </div>
        </div>;
      })}
    </div>
  </section>
  <section aria-labelledby="month-agenda-title" className="rounded-[var(--radius-panel)] border border-white/10 bg-[var(--color-athlete-panel)] p-4 shadow-[0_14px_35px_rgba(0,0,0,0.18)]"><div className="mb-3 flex items-end justify-between gap-3"><div><p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/42">À retenir</p><h2 id="month-agenda-title" className="mt-1 text-lg font-black">Détail des événements</h2></div></div>{monthEvents.length > 0 ? <div className="space-y-2.5">{monthEvents.map((event) => <CalendarEventRow key={event.id} event={event} />)}</div> : <p className="rounded-xl border border-dashed border-white/12 px-3 py-4 text-sm font-semibold text-white/55">Aucun événement ce mois-ci.</p>}</section>
  </div>;
}

function MonthNavigationLink({ monthKey, label, icon }: { monthKey: string; label: string; icon: React.ReactNode }) {
  return <Link href={`/athlete/calendar?view=calendar&month=${monthKey}`} aria-label={label} className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-white/65 transition hover:border-white/20 hover:bg-white/8 hover:text-white">{icon}</Link>;
}

function getValidMonthKey(value: string | undefined) {
  if (value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return value;
  return toMontrealDateInputValue(new Date()).slice(0, 7);
}

function shiftMonthKey(monthKey: string, offset: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

function daysInMonth(date: Date) {
  const [year, month] = toMontrealDateInputValue(date).slice(0, 7).split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function CalendarEventRow({ event }: { event: AthletePlanningEvent }) {
  const style = eventStyles[event.type];
  const Icon = style.icon;
  const audience = event.audience === "athlete" ? "Pour toi" : event.audience === "group" ? event.groupName ?? "Ton groupe" : "Tout le club";
  return <article id={`event-${event.id}`} className="grid scroll-mt-4 grid-cols-[52px_minmax(0,1fr)] gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-3"><div className="flex flex-col items-center justify-center rounded-xl bg-[var(--color-club-red)]/12 py-2 text-center"><span className="text-[10px] font-black uppercase text-white/50">{formatMontrealDate(event.startsAt, { month: "short" })}</span><strong className="mt-0.5 text-2xl font-black leading-none text-white">{formatMontrealDate(event.startsAt, { day: "2-digit" })}</strong><span className="mt-1 text-[11px] font-black text-[var(--color-club-red-soft)]">{formatMontrealTime(event.startsAt)}</span></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-black", style.className)}><Icon className="h-3.5 w-3.5" />{style.label}</span><span className="text-xs font-bold text-white/45">{audience}</span></div><h3 className="mt-2 text-base font-black leading-snug text-white">{event.title}</h3><div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-white/58"><span><MapPin className="mr-1 inline h-3.5 w-3.5 text-white/45" />{event.location || "Lieu à confirmer"}</span>{event.duration && <span><Clock3 className="mr-1 inline h-3.5 w-3.5 text-white/45" />{formatDuration(event.duration)}</span>}</div></div></article>;
}

function EventCard({ event }: { event: AthletePlanningEvent }) {
  const style = eventStyles[event.type];
  const Icon = style.icon;
  const audience = event.audience === "athlete" ? "Pour toi" : event.audience === "group" ? event.groupName ?? "Ton groupe" : "Tout le club";

  return (
    <article className="overflow-hidden rounded-[var(--radius-panel)] border border-white/10 bg-[var(--color-athlete-panel)] shadow-[0_14px_35px_rgba(0,0,0,0.18)]">
      <div className="grid grid-cols-[72px_1fr]">
        <div className="flex flex-col items-center justify-center border-r border-white/10 bg-white/5 px-2 py-4 text-center">
          <span className="text-xs font-black uppercase text-white/45">{formatMontrealDate(event.startsAt, { month: "short" })}</span>
          <span className="mt-1 text-3xl font-black leading-none">{formatMontrealDate(event.startsAt, { day: "2-digit" })}</span>
          <span className="mt-1 text-[11px] font-bold text-white/45">{formatMontrealTime(event.startsAt)}</span>
        </div>

        <div className="min-w-0 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-black", style.className)}><Icon className="h-3.5 w-3.5" /> {style.label}</span>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-white/45"><Users className="h-3.5 w-3.5" /> {audience}</span>
          </div>
          <h3 className="mt-3 text-xl font-black leading-tight">{event.title}</h3>
          <div className="mt-3 space-y-1.5 text-sm font-semibold text-white/58">
            <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 shrink-0" /> {event.endsAt ? `Du ${formatMontrealDate(event.startsAt, { weekday: "long", day: "numeric", month: "long" })} au ${formatMontrealDate(event.endsAt, { weekday: "long", day: "numeric", month: "long" })}` : formatMontrealDate(event.startsAt, { weekday: "long", day: "numeric", month: "long" })}</div>
            <div className="flex items-center gap-2"><MapPin className="h-4 w-4 shrink-0" /> {event.location || "Lieu à confirmer"}</div>
            {event.duration && <div className="flex items-center gap-2"><Clock3 className="h-4 w-4 shrink-0" /> {formatDuration(event.duration)}</div>}
          </div>
        </div>
      </div>
    </article>
  );
}

function groupEventsByMonth(events: AthletePlanningEvent[]) {
  const groups = new Map<string, AthletePlanningEvent[]>();

  for (const event of events) {
    const month = formatMontrealDate(event.startsAt, { month: "long", year: "numeric" });
    groups.set(month, [...(groups.get(month) ?? []), event]);
  }

  return Array.from(groups.entries());
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 0) return `${remainingMinutes} min`;
  if (remainingMinutes === 0) return `${hours} h`;
  return `${hours} h ${remainingMinutes}`;
}
