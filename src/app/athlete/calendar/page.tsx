import { CalendarDays, Clock3, MapPin, TentTree, Trophy, Users, Waves } from "lucide-react";
import type { PlanningEventType } from "@prisma/client";
import { AthleteShell } from "@/components/athlete/athlete-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { getAthletePlanningEvents, type AthletePlanningEvent } from "@/lib/athlete-planning";
import { requireAthlete } from "@/lib/current-user";
import { formatMontrealDate, formatMontrealTime } from "@/lib/timezone";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const eventStyles: Record<PlanningEventType, { label: string; icon: typeof Trophy; className: string }> = {
  COMPETITION: { label: "Compétition", icon: Trophy, className: "bg-amber-400/16 text-amber-200" },
  CAMP: { label: "Camp", icon: TentTree, className: "bg-cyan-400/14 text-cyan-200" },
  TRAINING_SCHEDULE: { label: "Horaire", icon: Waves, className: "bg-[var(--color-brand)]/18 text-sky-200" }
};

export default async function AthleteCalendarPage() {
  const { athlete, clubId } = await requireAthlete();
  const events = await getAthletePlanningEvents({ athleteId: athlete.id, clubId, groupId: athlete.groupId });
  const monthGroups = groupEventsByMonth(events);

  return (
    <AthleteShell>
      <header className="mb-6">
        <h1 className="text-3xl font-black">Calendrier</h1>
      </header>

      <div className="space-y-7">
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
      </div>
    </AthleteShell>
  );
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
