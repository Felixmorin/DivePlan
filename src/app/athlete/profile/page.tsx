import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, ChevronRight, Edit3, LogOut, Medal, Star, UserRound, Waves } from "lucide-react";
import { signOutAthlete } from "@/app/athlete/profile/actions";
import { AthleteShell } from "@/components/athlete/athlete-shell";
import { CompetitionList } from "@/components/athlete/competition-list";
import { ProfileForm } from "@/components/athlete/profile-form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAthleteCurrentWeekSummary, getAthleteProgressTotals, getCurrentAthlete } from "@/lib/athlete-session";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const athlete = await getCurrentAthlete();
  if (!athlete) {
    redirect("/login");
  }

  const [totals, weekSummary] = await Promise.all([
    getAthleteProgressTotals(athlete.id),
    getAthleteCurrentWeekSummary(athlete.id)
  ]);
  const coachName = athlete.group?.coach.user
    ? `${athlete.group.coach.user.firstName} ${athlete.group.coach.user.lastName}`
    : "Équipe d’entraîneurs";

  return (
    <AthleteShell>
      <header className="mb-5 pt-2">
        <h1 className="text-[2rem] font-black leading-none tracking-tight">Profil</h1>
      </header>

      <section className="profile-hero relative overflow-hidden rounded-[1.4rem] border border-cyan-300/25 bg-[#092238] p-5 shadow-[0_20px_55px_rgba(0,0,0,0.3)]">
        <div className="relative z-10 flex items-center gap-4">
          <Avatar className="h-24 w-24 shrink-0 border-2 border-cyan-200 bg-[#06101d] shadow-[0_0_0_4px_rgba(34,211,238,0.08)]">
            <AvatarImage src={athlete.user.avatar ?? undefined} />
            <AvatarFallback>{athlete.user.firstName[0]}{athlete.user.lastName[0]}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h2 className="truncate text-2xl font-black leading-tight">{athlete.user.firstName} {athlete.user.lastName}</h2>
            <ProfileMeta icon={<UserRound className="h-4 w-4" />} label="Athlète" />
            <ProfileMeta icon={<Building2 className="h-4 w-4" />} label={athlete.club.name} />
            <ProfileMeta icon={<Waves className="h-4 w-4" />} label={`Coach ${coachName}`} />
          </div>
        </div>
      </section>

      <section aria-label="Statistiques du profil" className="mt-4 grid grid-cols-3 divide-x divide-white/10 rounded-[1.4rem] border border-white/10 bg-[#0b1e30] px-2 py-5 text-center shadow-[0_16px_40px_rgba(0,0,0,0.18)]">
        <ProfileStat icon={<Medal className="h-5 w-5" />} label="Séances" value={totals.completedSessions} />
        <ProfileStat icon={<Waves className="h-5 w-5" />} label="Plongeons" value={totals.totalDiveRepetitions} />
        <ProfileStat icon={<span className="text-base font-black">min</span>} label="Entraînement" value={totals.completedMinutes} />
      </section>

      <Link href="/athlete/profile/golden-reps" className="mt-4 flex min-h-16 items-center gap-3 rounded-[1.2rem] border border-amber-300/25 bg-gradient-to-r from-amber-400/15 to-transparent px-4 transition hover:border-amber-300/50 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400 text-[#281500]"><Star className="h-5 w-5 fill-current" /></span>
        <span className="flex-1"><span className="block text-base font-black">Golden rep</span></span>
        <ChevronRight className="h-5 w-5 text-amber-200/70" />
      </Link>

      <section aria-label="Résumé de la semaine" className="mt-3 rounded-[1.2rem] border border-[var(--color-club-red)]/25 bg-[var(--color-athlete-panel)] px-4 py-3">
        <p className="text-sm font-semibold text-white/58">Cette semaine,</p>
        <p className="mt-1 text-base font-black"><span className="text-[var(--color-club-red-soft)]">{weekSummary.total}</span> entraînement{weekSummary.total > 1 ? "s" : ""} <span className="font-semibold text-white/55">· {weekSummary.remaining} restant{weekSummary.remaining > 1 ? "s" : ""}</span></p>
      </section>

      <section className="mt-7">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="mt-1 text-xl font-black">Ma liste de compétition</h2>
          </div>
          <span className="text-xs font-bold text-white/35">{athlete.competitionDives.length} plongeons</span>
        </div>
        <CompetitionList
          dives={athlete.competitionDives.filter((dive) => dive.height !== "CUSTOM").map((dive) => ({
            id: dive.id,
          height: dive.height,
          code: dive.diveCode,
          difficulty: dive.difficulty,
            volume: totals.skillDives
              .filter((trackedDive) => trackedDive.code === dive.diveCode && trackedDive.height === dive.height)
              .reduce((sum, trackedDive) => sum + trackedDive.volume, 0)
          }))}
        />
      </section>

      <section className="mt-7">
        <h2 className="mb-3 text-xl font-black">Compte</h2>
        <div className="overflow-hidden rounded-[1.4rem] border border-white/10 bg-[#0b1e30]">
          <details className="group border-b border-white/8">
            <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 text-base font-semibold marker:hidden focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">
              <Edit3 className="h-5 w-5 text-cyan-200/75" />
              <span className="flex-1">Modifier mon profil</span>
              <ChevronRight className="h-5 w-5 text-white/45 transition group-open:rotate-90" />
            </summary>
            <ProfileForm firstName={athlete.user.firstName} lastName={athlete.user.lastName} avatar={athlete.user.avatar} />
          </details>
          <form action={signOutAthlete}>
            <button type="submit" className="flex min-h-14 w-full items-center gap-3 px-4 text-left text-base font-semibold text-rose-300 transition hover:bg-white/[0.04] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">
              <LogOut className="h-5 w-5" />
              <span className="flex-1">Déconnexion</span>
              <ChevronRight className="h-5 w-5 text-white/45" />
            </button>
          </form>
        </div>
      </section>
    </AthleteShell>
  );
}

function ProfileMeta({ icon, label }: { icon: React.ReactNode; label: string }) {
  return <p className="mt-1.5 flex items-center gap-2 truncate text-sm font-medium text-white/65">{icon}<span className="truncate">{label}</span></p>;
}

function ProfileStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="px-1">
      <div className="mx-auto flex h-7 items-center justify-center text-cyan-300">{icon}</div>
      <div className="mt-1 text-2xl font-black text-white">{value}</div>
      <div className="mt-0.5 text-[11px] font-semibold text-white/50">{label}</div>
    </div>
  );
}
