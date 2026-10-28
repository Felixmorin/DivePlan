import Link from "@/components/ui/app-link";
import { redirect } from "next/navigation";
import { Activity, ArrowLeft, Award, Check, ListChecks, Medal } from "lucide-react";
import { AthleteShell } from "@/components/athlete/athlete-shell";
import { getAthleteGoldenReps, getAthleteSummary, getCurrentAthlete } from "@/lib/athlete-session";
import { query } from "@/lib/db";
import { parseMontrealSessionDate, toMontrealDateInputValue } from "@/lib/timezone";

export const dynamic = "force-dynamic";

export default async function AthleteBadgesPage() {
  const athlete = await getCurrentAthlete();
  if (!athlete) redirect("/login");
  const [totals, goldenReps] = await Promise.all([getAthleteSummary(athlete.id), getAthleteGoldenReps(athlete.id)]);
  const competitionDone = (await query<{ count: number }>(`SELECT COUNT(DISTINCT c.id)::int AS count FROM "CompetitionDive" c JOIN "AthleteDiveLog" l ON l."athleteId"=c."athleteId" AND l."poolDiveId" IN (SELECT d.id FROM "PoolDive" d JOIN "PoolSection" s ON s.id=d."poolSectionId" WHERE d."diveCode"=c."diveCode" AND s.height=c.height) WHERE c."athleteId"=$1 AND l."repetitionsCompleted">0`, [athlete.id])).rows[0]?.count ?? 0;
  const [year, month] = toMontrealDateInputValue().split("-").map(Number);
  const seasonStartYear = month >= 9 ? year : year - 1;
  const season = `${seasonStartYear}-${seasonStartYear + 1}`;
  const seasonalVolume = (await query<{ volume: number }>(`SELECT COALESCE(SUM("repetitionsCompleted"),0)::int AS volume FROM "AthleteDiveLog" WHERE "athleteId"=$1 AND timestamp >= $2 AND timestamp < $3`, [athlete.id, parseMontrealSessionDate(`${seasonStartYear}-09-01`, "00:00"), parseMontrealSessionDate(`${seasonStartYear + 1}-08-31`, "00:00")])).rows[0]?.volume ?? 0;
  const goldenCount = goldenReps.reduce((sum, dive) => sum + dive.count, 0);
  const badges = [
    { title: "500 répétitions", progress: Math.min(500, totals.totalDiveRepetitions), goal: 500, Icon: Activity, color: "blue" },
    { title: "Premier à 500 reps de la saison", progress: Math.min(500, seasonalVolume), goal: 500, Icon: ListChecks, color: "blue", season },
    { title: "Liste complétée", progress: Math.min(athlete.competitionDives.length, competitionDone), goal: Math.max(1, athlete.competitionDives.length), Icon: Medal, color: "mint" }
  ];

  return <AthleteShell className="athlete-badges-page">
    <header className="athlete-badges-header"><Link href="/athlete/profile" aria-label="Retour au profil"><ArrowLeft /></Link><div><h1>Mes badges</h1><p>Chaque répétition compte.</p></div></header>
    <section className="athlete-badges-golden"><span><Award /></span><div><h2>Golden rep</h2><p>{goldenCount} réussie{goldenCount === 1 ? "" : "s"}</p></div></section>
    <section className="athlete-badges-grid" aria-label="Progression des badges">
      {badges.map(({ title, progress, goal, Icon, color, season: badgeSeason }) => <article key={title} className={`athlete-badge-card ${color} ${progress >= goal ? "is-earned" : ""}`}>
        <span className="athlete-badge-icon"><Icon />{progress >= goal && <i><Check /></i>}{badgeSeason && <small className="athlete-badge-season">{badgeSeason}</small>}</span>
        <h2>{title}</h2><p>{progress} / {goal}</p><div className="athlete-badge-track"><i style={{ width: `${Math.min(100, progress / goal * 100)}%` }} /></div>
      </article>)}
    </section>
  </AthleteShell>;
}
