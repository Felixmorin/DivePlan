import { CalendarDays, Clock3, List, MapPin, TentTree, Trophy, Users, Waves } from "lucide-react";
import Link from "next/link";
import type { PlanningEventType } from "@prisma/client";
import { AthleteShell } from "@/components/athlete/athlete-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { getAthletePlanningEvents, type AthletePlanningEvent } from "@/lib/athlete-planning";
import { requireAthlete } from "@/lib/current-user";
import { addMontrealDays, formatMontrealDate, formatMontrealTime, parseMontrealSessionDate, startOfMontrealWeek, toMontrealDateInputValue } from "@/lib/timezone";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const eventStyles: Record<PlanningEventType, { label: string; icon: typeof Trophy; className: string }> = {
  COMPETITION: { label: "Compétition", icon: Trophy, className: "bg-amber-400/16 text-amber-200" },
  CAMP: { label: "Camp", icon: TentTree, className: "bg-cyan-400/14 text-cyan-200" },
  TRAINING_SCHEDULE: { label: "Horaire", icon: Waves, className: "bg-[var(--color-brand)]/18 text-sky-200" }
};

export default async function AthleteCalendarPage({ searchParams }: { searchParams: Promise<{ view?: string | string[] }> }) {
  const { athlete, clubId } = await requireAthlete();
  const events = await getAthletePlanningEvents({ athleteId: athlete.id, clubId, groupId: athlete.groupId });
  const monthGroups = groupEventsByMonth(events);
  const viewParam = searchParams ? await searchParams : {};
  const calendarView = (Array.isArray(viewParam.view) ? viewParam.view[0] : viewParam.view) === "calendar";

  return (
    <AthleteShell>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black">Calendrier</h1>
          <p className="mt-1 text-sm font-semibold text-white/52">Tes activités et événements à venir.</p>
        </div>
        <div className="flex rounded-full border border-white/10 bg-white/[0.04] p-1" aria-label="Choisir l’affichage du calendrier">
          <ViewLink href="/athlete/calendar?view=list" active={!calendarView} icon={<List className="h-4 w-4" />}>Liste</ViewLink>
          <ViewLink href="/athlete/calendar?view=calendar" active={calendarView} icon={<CalendarDays className="h-4 w-4" />}>Calendrier</ViewLink>
        </div>
      </header>

      {calendarView ? <MonthCalendar events={events} /> : <div className="space-y-7">
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

function MonthCalendar({ events }: { events: AthletePlanningEvent[] }) {
  const monthStart = parseMontrealSessionDate(`${toMontrealDateInputValue(new Date()).slice(0, 7)}-01`, "00:00");
  const monthKey = toMontrealDateInputValue(monthStart).slice(0, 7);
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = addMontrealDays(startOfMontrealWeek(monthStart), index);
    return { date, key: toMontrealDateInputValue(date), inMonth: toMontrealDateInputValue(date).startsWith(monthKey) };
  });
  const eventsByDay = new Map<string, AthletePlanningEvent[]>();
  for (const event of events) {
    const key = toMontrealDateInputValue(event.startsAt);
    eventsByDay.set(key, [...(eventsByDay.get(key) ?? []), event]);
  }

  return <section aria-label="Calendrier mensuel" className="overflow-hidden rounded-[var(--radius-panel)] border border-white/10 bg-[var(--color-athlete-panel)]">
    <div className="border-b border-white/10 px-4 py-4"><h2 className="text-xl font-black">{formatMontrealDate(monthStart, { month: "long", year: "numeric" })}</h2></div>
    <div className="grid grid-cols-7 border-b border-white/10 bg-white/[0.03] text-center text-[10px] font-black uppercase tracking-wide text-white/42">
      {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((day) => <div key={day} className="py-3">{day}</div>)}
    </div>
    <div className="grid grid-cols-7">
      {days.map(({ date, key, inMonth }) => {
        const dayEvents = eventsByDay.get(key) ?? [];
        return <div key={key} className={cn("min-h-24 border-r border-b border-white/8 p-1.5", !inMonth && "bg-black/20 opacity-35")}>
          <div className={cn("mb-1 text-right text-xs font-black", key === toMontrealDateInputValue(new Date()) && "text-[var(--color-club-red-soft)]")}>{formatMontrealDate(date, { day: "numeric" })}</div>
          <div className="space-y-1">
            {dayEvents.slice(0, 3).map((event) => <div key={event.id} title={`${event.title} · ${formatMontrealTime(event.startsAt)}`} className="truncate rounded-md bg-[var(--color-club-red)]/18 px-1 py-1 text-[10px] font-bold leading-tight text-[var(--color-club-red-soft)]">{formatMontrealTime(event.startsAt)} · {event.title}</div>)}
            {dayEvents.length > 3 && <div className="px-1 text-[10px] font-bold text-white/42">+{dayEvents.length - 3} autre{dayEvents.length - 3 > 1 ? "s" : ""}</div>}
          </div>
        </div>;
      })}
    </div>
  </section>;
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
            <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 shrink-0" /> {formatMontrealDate(event.startsAt, { weekday: "long", day: "numeric", month: "long" })}</div>
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
