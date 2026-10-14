import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, ArrowLeft, Award, Check, ListChecks, Medal, Star, Waves } from "lucide-react";
import { AthleteShell } from "@/components/athlete/athlete-shell";
import { getAthleteGoldenReps, getAthleteProgressTotals, getCurrentAthlete } from "@/lib/athlete-session";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AthleteBadgesPage() {
  const athlete = await getCurrentAthlete();
  if (!athlete) redirect("/login");
  const [totals, goldenReps] = await Promise.all([getAthleteProgressTotals(athlete.id), getAthleteGoldenReps(athlete.id)]);
  const competitionDone = (await query<{ count: number }>(`SELECT COUNT(DISTINCT c.id)::int AS count FROM "CompetitionDive" c JOIN "AthleteDiveLog" l ON l."athleteId"=c."athleteId" AND l."poolDiveId" IN (SELECT d.id FROM "PoolDive" d JOIN "PoolSection" s ON s.id=d."poolSectionId" WHERE d."diveCode"=c."diveCode" AND s.height=c.height) WHERE c."athleteId"=$1 AND l."repetitionsCompleted">0`, [athlete.id])).rows[0]?.count ?? 0;
  const goldenCount = goldenReps.reduce((sum, dive) => sum + dive.count, 0);
  const maxDiveVolume = Math.max(0, ...totals.skillDives.map((dive) => dive.volume));
  const badges = [
    { title: "500 répétitions", progress: Math.min(500, totals.totalDiveRepetitions), goal: 500, Icon: Activity, color: "blue" },
    { title: "Première série de 500", progress: Math.min(500, totals.totalDiveRepetitions), goal: 500, Icon: ListChecks, color: "blue" },
    { title: "Liste complétée", progress: Math.min(athlete.competitionDives.length, competitionDone), goal: Math.max(1, athlete.competitionDives.length), Icon: Medal, color: "mint" },
    { title: "5 reps sur un plongeon", progress: Math.min(5, maxDiveVolume), goal: 5, Icon: Waves, color: "blue" }
  ];

  return <AthleteShell className="athlete-badges-page">
    <header className="athlete-badges-header"><Link href="/athlete/profile" aria-label="Retour au profil"><ArrowLeft /></Link><div><h1>Mes badges</h1><p>Chaque répétition compte.</p></div></header>
    <section className="athlete-badges-golden"><span><Award /></span><div><h2>Golden rep</h2><p>{goldenCount} réussie{goldenCount === 1 ? "" : "s"}</p></div></section>
    <section className="athlete-badges-grid" aria-label="Progression des badges">
      {badges.map(({ title, progress, goal, Icon, color }) => <article key={title} className={`athlete-badge-card ${color} ${progress >= goal ? "is-earned" : ""}`}>
        <span className="athlete-badge-icon"><Icon />{progress >= goal && <i><Check /></i>}</span>
        <h2>{title}</h2><p>{progress} / {goal}</p><div className="athlete-badge-track"><i style={{ width: `${Math.min(100, progress / goal * 100)}%` }} /></div>
      </article>)}
    </section>
  </AthleteShell>;
}
