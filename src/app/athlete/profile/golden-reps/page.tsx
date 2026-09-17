import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Star } from "lucide-react";
import { AthleteShell } from "@/components/athlete/athlete-shell";
import { getAthleteGoldenReps, getCurrentAthlete } from "@/lib/athlete-session";

export const dynamic = "force-dynamic";

export default async function GoldenRepsPage() {
  const athlete = await getCurrentAthlete();
  if (!athlete) redirect("/login");
  const goldenReps = await getAthleteGoldenReps(athlete.id);

  return <AthleteShell>
    <header className="flex items-center gap-3 pb-5 pt-2">
      <Link href="/athlete/profile" aria-label="Retour au profil" className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/8 text-white/70 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"><ArrowLeft className="h-5 w-5" /></Link>
      <div><p className="text-xs font-black uppercase tracking-[0.18em] text-amber-300/80">Mes réussites</p><h1 className="mt-1 text-[2rem] font-black leading-none tracking-tight">Golden rep</h1></div>
    </header>
    {goldenReps.length > 0 ? <section className="space-y-3" aria-label="Plongeons golden rep">
      {goldenReps.map((dive) => <article key={`${dive.height}-${dive.code}`} className="flex items-center gap-3 rounded-2xl border border-amber-300/20 bg-[var(--color-athlete-panel)] p-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-400 text-[#281500]"><Star className="h-6 w-6 fill-current" /></span>
        <div className="min-w-0 flex-1"><div className="text-xl font-black">{dive.code}</div><div className="truncate text-sm font-semibold text-white/60">{dive.name} · {heightLabel(dive.height)}</div></div>
        <div className="text-right"><div className="text-2xl font-black text-amber-300">{dive.count}</div><div className="text-xs font-bold uppercase text-white/45">golden reps</div></div>
      </article>)}
    </section> : <section className="rounded-2xl border border-white/10 bg-[var(--color-athlete-panel)] p-5"><Star className="h-8 w-8 text-amber-300" /><h2 className="mt-4 text-xl font-black">Aucune golden rep pour le moment</h2><p className="mt-2 text-sm font-medium leading-relaxed text-white/55">Pendant une séance, reclique sur une rep complétée pour la transformer en golden rep.</p></section>}
  </AthleteShell>;
}

function heightLabel(height: string) {
  return height === "ONE_METER" ? "1 m" : height === "THREE_METER" ? "3 m" : height === "PLATFORM" ? "Plateforme" : "Autre";
}
