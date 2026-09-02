import type * as React from "react";
import { redirect } from "next/navigation";
import { CalendarCheck2, Clock3, Waves } from "lucide-react";
import { AthleteShell } from "@/components/athlete/athlete-shell";
import { StatusPill } from "@/components/training/status-pill";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { getAthleteProgressTotals, getAthleteRecentCompletions, getCurrentAthlete } from "@/lib/athlete-session";
import { formatMontrealDate } from "@/lib/timezone";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const athlete = await getCurrentAthlete();
  if (!athlete) {
    redirect("/login");
  }

  const [totals, completions] = await Promise.all([
    getAthleteProgressTotals(athlete.id),
    getAthleteRecentCompletions(athlete.id)
  ]);

  return (
    <AthleteShell>
      <section className="overflow-hidden rounded-[var(--radius-panel)] border border-white/10 bg-[var(--color-athlete-panel)]">
        <div className="bg-[var(--color-athlete-panel-2)] p-5">
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20 border-4 border-white/10">
              <AvatarImage src={athlete.user.avatar ?? undefined} />
              <AvatarFallback>{athlete.user.firstName[0]}{athlete.user.lastName[0]}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase text-[var(--color-brand)]">Profil athlete</p>
              <h1 className="mt-1 truncate text-3xl font-black">{athlete.user.firstName} {athlete.user.lastName}</h1>
              <p className="mt-1 text-sm font-semibold text-white/55">{athlete.level} · {athlete.active ? "Actif" : "Inactif"}</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-white/10 p-4 text-center">
          <ProfileStat label="Séances" value={totals.completedSessions} />
          <ProfileStat label="Minutes" value={totals.completedMinutes} />
          <ProfileStat label="Reps" value={totals.totalDiveRepetitions} />
        </div>
      </section>

      <section className="mt-5">
        <h2 className="mb-3 text-lg font-black">Historique recent</h2>
        <div className="space-y-3">
          {completions.map((completion) => (
            <div key={completion.sessionId} className="rounded-[var(--radius-panel)] border border-white/10 bg-[var(--color-athlete-panel)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-xl font-black">{completion.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-white/60">{completion.focus}</p>
                </div>
                <StatusPill status={completion.status} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <ActivityMeta icon={<Clock3 className="h-4 w-4" />} label={`${completion.duration} min`} />
                <ActivityMeta icon={<CalendarCheck2 className="h-4 w-4" />} label={completion.completedAt ? formatMontrealDate(completion.completedAt, { day: "2-digit", month: "short" }) : "En cours"} />
              </div>
            </div>
          ))}
          {completions.length === 0 && (
            <EmptyState
              className="border-white/10 bg-white/6 text-white"
              title="Aucune séance complétée"
              description="Ton historique apparaitra apres ta premiere completion enregistree."
              icon={Waves}
            />
          )}
        </div>
      </section>
    </AthleteShell>
  );
}

function ProfileStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-2xl font-black text-white">{value}</div>
      <div className="text-xs font-black uppercase text-white/45">{label}</div>
    </div>
  );
}

function ActivityMeta({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex min-h-11 items-center gap-2 rounded-[var(--radius-ui)] bg-white/6 px-3 font-bold text-white/70">
      {icon}
      {label}
    </div>
  );
}
