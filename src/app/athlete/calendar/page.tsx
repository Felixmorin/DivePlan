import { CalendarDays, ChevronLeft, ChevronRight, Clock3, List, MapPin, TentTree, Trophy, Users, Waves, X, XCircle } from "lucide-react";
import Link from "next/link";
import { AthleteShell } from "@/components/athlete/athlete-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { getAthletePlanningEvents, type AthletePlanningEvent } from "@/lib/athlete-planning";
import { requireAthlete } from "@/lib/current-user";
import { addMontrealDays, formatMontrealCountdown, formatMontrealDate, formatMontrealTime, parseMontrealSessionDate, startOfMontrealWeek, toMontrealDateInputValue } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { AthletePageHeader } from "@/components/athlete/page-header";

export const dynamic = "force-dynamic";

type PlanningEventType = "COMPETITION" | "CAMP" | "TRAINING_SCHEDULE";

const eventStyles: Record<PlanningEventType, { label: string; icon: typeof Trophy; className: string }> = {
  COMPETITION: { label: "Compétition", icon: Trophy, className: "bg-amber-400/16 text-amber-200" },
  CAMP: { label: "Camp", icon: TentTree, className: "bg-cyan-400/14 text-cyan-200" },
  TRAINING_SCHEDULE: { label: "Horaire", icon: Waves, className: "bg-[var(--color-brand)]/18 text-sky-200" }
};
const cancelledEventStyle = { label: "Annulé", icon: XCircle, className: "bg-red-500/20 text-red-200" };

export default async function AthleteCalendarPage({ searchParams }: { searchParams: Promise<{ view?: string | string[]; month?: string | string[]; date?: string | string[] }> }) {
  const { athlete, clubId } = await requireAthlete();
  const viewParam = searchParams ? await searchParams : {};
  const selectedView = Array.isArray(viewParam.view) ? viewParam.view[0] : viewParam.view;
  const calendarView = selectedView !== "list";
  const requestedMonth = Array.isArray(viewParam.month) ? viewParam.month[0] : viewParam.month;
  const requestedDate = Array.isArray(viewParam.date) ? viewParam.date[0] : viewParam.date;
  const selectedDayKey = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) && !Number.isNaN(Date.parse(`${requestedDate}T12:00:00Z`)) ? requestedDate : null;
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
  const nextCompetition = countdownEvents.find((event) => event.type === "COMPETITION" && !event.cancelledAt && event.startsAt >= new Date());

  return (
    <AthleteShell>
      <AthletePageHeader title="Calendrier" showAvatar={false} />
      <header className="mb-4 flex flex-wrap items-center justify-between gap-4 calendar-controls">
        <div className="flex rounded-full border border-white/10 bg-white/[0.04] p-1" aria-label="Choisir l’affichage du calendrier">
          <ViewLink href="/athlete/calendar?view=list" active={!calendarView} icon={<List className="h-4 w-4" />}>Liste</ViewLink>
          <ViewLink href="/athlete/calendar?view=calendar" active={calendarView} icon={<CalendarDays className="h-4 w-4" />}>Calendrier</ViewLink>
        </div>
        {nextCompetition && <div className="calendar-next-competition w-full rounded-[var(--radius-panel)] border px-4 py-3 text-sm font-bold"><Trophy className="mr-2 inline h-4 w-4" />Prochaine compétition : <span className="font-black">{formatMontrealCountdown(nextCompetition.startsAt)}</span> · {nextCompetition.title}</div>}
      </header>

      {calendarView ? <MonthCalendar events={events} monthKey={monthKey} selectedDayKey={selectedDayKey} /> : <div className="space-y-7">
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

function MonthCalendar({ events, monthKey, selectedDayKey }: { events: AthletePlanningEvent[]; monthKey: string; selectedDayKey: string | null }) {
  const monthStart = parseMontrealSessionDate(`${monthKey}-01`, "00:00");
  const monthEnd = addMontrealDays(monthStart, daysInMonth(monthStart));
  const todayKey = toMontrealDateInputValue(new Date());
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = addMontrealDays(startOfMontrealWeek(monthStart), index);
    return { date, key: toMontrealDateInputValue(date), inMonth: toMontrealDateInputValue(date).startsWith(monthKey) };
  });
  const eventsByDay = new Map<string, AthletePlanningEvent[]>();
  for (const event of events) {
    const startKey = toMontrealDateInputValue(event.startsAt);
    const endKey = toMontrealDateInputValue(event.endsAt ?? event.startsAt);
    for (let date = parseMontrealSessionDate(startKey, "12:00"); toMontrealDateInputValue(date) <= endKey; date = addMontrealDays(date, 1)) {
      const key = toMontrealDateInputValue(date);
      eventsByDay.set(key, [...(eventsByDay.get(key) ?? []), event]);
    }
  }

  const monthEvents = events.filter((event) => event.startsAt < monthEnd && (event.endsAt === null || event.endsAt >= monthStart));
  const selectedDayEvents = selectedDayKey ? eventsByDay.get(selectedDayKey) ?? [] : [];
  const selectedEventIds = new Set(selectedDayEvents.map((event) => event.id));
  const remainingMonthEvents = monthEvents.filter((event) => !selectedEventIds.has(event.id));

  return <div className="space-y-4">
  <section aria-label="Calendrier mensuel" className="overflow-hidden rounded-[var(--radius-panel)] border border-white/10 bg-[var(--color-athlete-panel)] shadow-[0_14px_35px_rgba(0,0,0,0.18)]">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-4"><div><p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/42">Aperçu du mois</p><h2 className="mt-1 text-xl font-black capitalize">{formatMontrealDate(monthStart, { month: "long", year: "numeric" })}</h2></div><div className="flex items-center gap-2"><MonthNavigationLink monthKey={shiftMonthKey(monthKey, -1)} label="Mois précédent" icon={<ChevronLeft className="h-4 w-4" />} /><span className="rounded-full bg-[var(--color-club-red)]/14 px-3 py-1.5 text-xs font-black text-[var(--color-club-red-soft)]">{monthEvents.length} événement{monthEvents.length > 1 ? "s" : ""}</span><MonthNavigationLink monthKey={shiftMonthKey(monthKey, 1)} label="Mois suivant" icon={<ChevronRight className="h-4 w-4" />} /></div></div>
    <div className="grid grid-cols-7 border-b border-white/10 bg-white/[0.03] text-center text-[10px] font-black uppercase tracking-wide text-white/52">
      {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((day) => <div key={day} className="py-3">{day}</div>)}
    </div>
    <div className="grid grid-cols-7">
      {days.map(({ date, key, inMonth }) => {
        const dayEvents = eventsByDay.get(key) ?? [];
        return <div key={key} className={cn("min-h-16 border-r border-b border-white/8 p-1.5 sm:min-h-20 sm:p-2", !inMonth && "bg-black/20 opacity-35", key === todayKey && "bg-[var(--color-club-red)]/[0.05]")}>
          <div className={cn("mb-1 flex justify-center text-xs font-semibold", key === todayKey && "text-[var(--color-club-red-soft)]")}><Link href={`/athlete/calendar?view=calendar&month=${monthKey}&date=${key}`} aria-label={`Afficher les événements du ${formatMontrealDate(date, { weekday: "long", day: "numeric", month: "long" })}`} aria-current={selectedDayKey === key ? "date" : undefined} className={cn("grid h-7 w-7 place-items-center rounded-full", (key === todayKey || selectedDayKey === key) && "bg-[var(--color-club-red)] text-white", selectedDayKey === key && "selected-calendar-day ring-2 ring-sky-300 ring-offset-2 ring-offset-white")}>{formatMontrealDate(date, { day: "numeric" })}</Link></div>
          <div className="flex min-h-3 justify-center gap-1">
            {dayEvents.slice(0, 3).map((event) => <a key={event.id} href={`#event-${event.id}`} title={`${event.title} · ${formatMontrealTime(event.startsAt)}`} aria-label={`${event.title}, ${formatMontrealTime(event.startsAt)}`} className={cn("h-2 w-2 rounded-full", event.type === "COMPETITION" ? "bg-rose-400" : "bg-sky-400")} />)}
            {dayEvents.length > 3 && <span className="text-[9px] leading-3 text-slate-500">+{dayEvents.length - 3}</span>}
          </div>
        </div>;
      })}
    </div>
  </section>
  <section aria-labelledby="month-agenda-title" className="rounded-[var(--radius-panel)] border border-white/10 bg-[var(--color-athlete-panel)] p-4 shadow-[0_14px_35px_rgba(0,0,0,0.18)]">
    <div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/42">À retenir</p><h2 id="month-agenda-title" className="mt-1 text-lg font-black">{selectedDayKey ? `Événements du ${formatMontrealDate(parseMontrealSessionDate(selectedDayKey, "12:00"), { weekday: "long", day: "numeric", month: "long" })}` : "Détail des événements"}</h2></div>{selectedDayKey && <Link href={`/athlete/calendar?view=calendar&month=${monthKey}`} aria-label="Fermer la sélection de date" className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-600"><X className="h-5 w-5" /></Link>}</div>
    {selectedDayKey && <div className="space-y-2.5">{selectedDayEvents.length ? selectedDayEvents.map((event) => <CalendarEventRow key={event.id} event={event} />) : <p className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-sm font-semibold text-slate-500">Aucun événement à cette date.</p>}</div>}
    {remainingMonthEvents.length > 0 && <div className={cn("space-y-2.5", selectedDayKey && "mt-4 border-t border-slate-100 pt-4")}>{selectedDayKey && <h3 className="mb-2 text-sm font-bold text-slate-500">Autres événements du mois</h3>}{remainingMonthEvents.map((event) => <CalendarEventRow key={event.id} event={event} />)}</div>}
    {!selectedDayKey && monthEvents.length === 0 && <p className="rounded-xl border border-dashed border-white/12 px-3 py-4 text-sm font-semibold text-white/55">Aucun événement ce mois-ci.</p>}
  </section>
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
  const style = event.cancelledAt ? cancelledEventStyle : eventStyles[event.type];
  const Icon = style.icon;
  const audience = event.audience === "athlete" ? "Pour toi" : event.audience === "group" ? event.groupName ?? "Ton groupe" : "Tout le club";
  return <article id={`event-${event.id}`} className={cn("calendar-event-card grid scroll-mt-4 grid-cols-[52px_minmax(0,1fr)] gap-3 rounded-2xl border p-3", !event.cancelledAt && `calendar-event-${event.type.toLowerCase()}`, event.cancelledAt && "calendar-event-cancelled")}><div className="calendar-event-date flex flex-col items-center justify-center rounded-xl py-2 text-center"><span className="text-[10px] font-black uppercase">{formatMontrealDate(event.startsAt, { month: "short" })}</span><strong className="mt-0.5 text-2xl font-black leading-none">{formatMontrealDate(event.startsAt, { day: "2-digit" })}</strong><span className="mt-1 text-[11px] font-black">{formatMontrealTime(event.startsAt)}</span></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={cn("calendar-event-badge inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-black", style.className)}><Icon className="h-3.5 w-3.5" />{style.label}</span><span className="text-xs font-bold text-white/45">{audience}</span></div><h3 className={cn("mt-2 text-base font-black leading-snug", event.cancelledAt ? "text-red-200 line-through" : "text-white")}>{event.title}</h3><div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-white/58"><span><MapPin className="mr-1 inline h-3.5 w-3.5 text-white/45" />{event.location || "Lieu à confirmer"}</span>{event.duration && <span><Clock3 className="mr-1 inline h-3.5 w-3.5 text-white/45" />{formatDuration(event.duration)}</span>}</div></div></article>;
}

function EventCard({ event }: { event: AthletePlanningEvent }) {
  const style = event.cancelledAt ? cancelledEventStyle : eventStyles[event.type];
  const Icon = style.icon;
  const audience = event.audience === "athlete" ? "Pour toi" : event.audience === "group" ? event.groupName ?? "Ton groupe" : "Tout le club";

  return (
    <article id={`event-${event.id}`} className={cn("calendar-event-card scroll-mt-4 overflow-hidden rounded-[var(--radius-panel)] border shadow-[0_14px_35px_rgba(0,0,0,0.18)]", !event.cancelledAt && `calendar-event-${event.type.toLowerCase()}`, event.cancelledAt && "calendar-event-cancelled")}>
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
          <h3 className={cn("mt-3 text-xl font-black leading-tight", event.cancelledAt ? "text-red-200 line-through" : "text-white")}>{event.title}</h3>
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
