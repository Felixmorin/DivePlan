import Link from "next/link";
import { redirect } from "next/navigation";
import { Award, Building2, ChevronRight, Clock3, LogOut, Medal, Pencil, Settings, Star, UserRound, Waves } from "lucide-react";
import { signOutAthlete } from "@/app/athlete/profile/actions";
import { AthleteShell } from "@/components/athlete/athlete-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAthleteGoldenReps, getAthleteProgressTotals, getCurrentAthlete } from "@/lib/athlete-session";
import { resolveAvatarUrls } from "@/lib/avatar-storage";
import { SignOutWithPushCleanup } from "@/components/notifications/sign-out-with-push-cleanup";
import { AthletePageHeader } from "@/components/athlete/page-header";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const athlete = await getCurrentAthlete();
  if (!athlete) {
    redirect("/login");
  }

  const [totals, goldenReps] = await Promise.all([
    getAthleteProgressTotals(athlete.id),
    getAthleteGoldenReps(athlete.id)
  ]);
  const [avatarUrl] = await resolveAvatarUrls([athlete.user.avatar]);
  const coachName = athlete.group?.coach.user
    ? `${athlete.group.coach.user.firstName} ${athlete.group.coach.user.lastName}`
    : "Équipe d’entraîneurs";

  return (
    <AthleteShell>
      <div className="profile-page-top mb-4">
          <AthletePageHeader title="Profil" showAvatar={false} avatarUrl={avatarUrl} initials={`${athlete.user.firstName[0]}${athlete.user.lastName[0]}`} />
      </div>

      <section className="profile-hero relative overflow-hidden rounded-[1.4rem] border border-cyan-300/25 bg-[#092238] p-5 shadow-[0_20px_55px_rgba(0,0,0,0.3)]">
        <Link href="/athlete/profile/edit" aria-label="Modifier mon profil" className="profile-edit-link"><Pencil size={20} /></Link>
        <div className="relative z-10 flex items-center gap-4 pr-12">
          <Avatar className="h-24 w-24 shrink-0 border-2 border-cyan-200 bg-[#06101d] shadow-[0_0_0_4px_rgba(34,211,238,0.08)]">
            <AvatarImage src={avatarUrl ?? undefined} />
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
        <ProfileStat icon={<Clock3 className="h-5 w-5" />} label="Entraînement" value={formatTrainingHours(totals.completedMinutes)} />
      </section>

      <section className="mt-5 rounded-[1.2rem] bg-amber-50 p-3">
      <h2 className="mb-3 text-xl font-black">Mes accomplissements</h2>
      <Link href="/athlete/profile/golden-reps" className="flex min-h-16 items-center gap-3 rounded-[1.2rem] border border-amber-300/25 bg-white px-4 transition hover:border-amber-300/50 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400 text-[#281500]"><Star className="h-5 w-5 fill-current" /></span>
        <span className="flex-1"><span className="block text-base font-black">Golden reps</span><span className="block text-sm text-slate-600">{goldenReps.reduce((sum, dive) => sum + dive.count, 0)} répétitions remarquables</span></span>
        <ChevronRight className="h-5 w-5 text-amber-200/70" />
      </Link>
      <Link href="/athlete/profile/badges" className="milestone-row"><span>Voir mes badges</span><Award className="h-5 w-5 text-red-500" /><ChevronRight className="h-5 w-5 text-slate-500" /></Link>
      </section>

      <section className="mt-7">
        <Link href="/athlete/profile/competition" className="profile-competition-preview">
          <div className="profile-competition-title"><h2>Ma liste de compétition</h2><ChevronRight size={21} /></div>
          <div className="profile-competition-heights">
            {(["ONE_METER", "THREE_METER"] as const).map((height) => {
              const heightDives = athlete.competitionDives.filter((dive) => dive.height === height);
              if (!heightDives.length) return null;
              return <div className={`profile-competition-height ${height === "ONE_METER" ? "is-one" : "is-three"}`} key={height}>
                <span className="profile-competition-icon"><Waves size={19} /></span><span className="profile-competition-copy"><strong>{height === "ONE_METER" ? "1 m" : "3 m"}</strong><small>{heightDives.length} plongeons</small></span><ChevronRight size={19} />
              </div>;
            })}
          </div>
        </Link>
      </section>

      <section className="mt-7">
        <h2 className="mb-3 text-xl font-black">Compte</h2>
        <div className="overflow-hidden rounded-[1.4rem] border border-white/10 bg-[#0b1e30]">
          <Link href="/athlete/preferences" className="flex min-h-14 items-center gap-3 border-b border-white/8 px-4 text-base font-semibold transition hover:bg-white/[0.04] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">
            <Settings className="h-5 w-5 text-white/65" />
            <span className="flex-1">Préférences</span>
            <ChevronRight className="h-5 w-5 text-white/45" />
          </Link>
          <SignOutWithPushCleanup action={signOutAthlete}>
            <button type="submit" className="flex min-h-14 w-full items-center gap-3 px-4 text-left text-base font-semibold text-rose-300 transition hover:bg-white/[0.04] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">
              <LogOut className="h-5 w-5" />
              <span className="flex-1">Déconnexion</span>
              <ChevronRight className="h-5 w-5 text-white/45" />
            </button>
          </SignOutWithPushCleanup>
        </div>
      </section>
    </AthleteShell>
  );
}

function ProfileMeta({ icon, label }: { icon: React.ReactNode; label: string }) {
  return <p className="mt-1.5 flex items-center gap-2 truncate text-sm font-medium text-white/65">{icon}<span className="truncate">{label}</span></p>;
}

function formatTrainingHours(minutes: number) {
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
}

function ProfileStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="px-1">
      <div className="mx-auto flex h-7 items-center justify-center text-cyan-300">{icon}</div>
      <div className="mt-1 text-2xl font-black text-white">{value}</div>
      <div className="mt-0.5 text-[11px] font-semibold text-white/50">{label}</div>
    </div>
  );
}
