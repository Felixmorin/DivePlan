import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Activity, ChevronRight, Clock3, Waves } from "lucide-react";
import { AthleteShell } from "@/components/athlete/athlete-shell";
import { ProgressDetailsPeriod } from "@/components/athlete/progress-details-period";
import { getCurrentAthlete } from "@/lib/athlete-session";
import { query } from "@/lib/db";
import { addMontrealDays, parseMontrealSessionDate, startOfMontrealWeek, toMontrealDateInputValue } from "@/lib/timezone";

export const dynamic = "force-dynamic";

const familyStyles: Record<string, { color: string; icon: typeof Waves }> = {
  Avant: { color: "#08c9c7", icon: Waves },
  Arriere: { color: "#ff655c", icon: Activity },
  Renverse: { color: "#36a0ff", icon: Waves },
  Retourne: { color: "#9147ed", icon: Waves },
  Vrille: { color: "#08a9c5", icon: Waves },
  Equilibre: { color: "#edb52b", icon: Clock3 }
};

type DiveVolume = { family: string; code: string; height: string; heightLabel: string | null; volume: number };

export default async function AthleteDiveDetailsPage({ searchParams }: {
  searchParams: Promise<{ period?: string | string[]; family?: string | string[]; all?: string | string[] }>;
}) {
  const athlete = await getCurrentAthlete();
  if (!athlete) redirect("/login");
  const params = await searchParams;
  const periodValue = Array.isArray(params.period) ? params.period[0] : params.period;
  const period = periodValue === "month" || periodValue === "all" ? periodValue : "week";
  const familyValue = Array.isArray(params.family) ? params.family[0] : params.family;
  const showAllValue = Array.isArray(params.all) ? params.all[0] : params.all;
  const showAll = showAllValue === "1";

  let from: Date | null = null;
  let until: Date | null = null;
  if (period === "week") {
    from = startOfMontrealWeek();
    until = addMontrealDays(from, 7);
  } else if (period === "month") {
    const [year, month] = toMontrealDateInputValue().split("-").map(Number);
    from = parseMontrealSessionDate(`${year}-${String(month).padStart(2, "0")}-01`, "00:00");
    const nextMonth = new Date(Date.UTC(year, month, 1));
    until = parseMontrealSessionDate(`${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, "0")}-01`, "00:00");
  }

  const rows = (await query<DiveVolume>(`SELECT COALESCE(l."familyOverride",CASE left(d."diveCode",1) WHEN '1' THEN 'Avant' WHEN '2' THEN 'Arriere' WHEN '3' THEN 'Renverse' WHEN '4' THEN 'Retourne' WHEN '5' THEN 'Vrille' ELSE 'Equilibre' END) AS family,d."diveCode" AS code,s.height,s.label AS "heightLabel",SUM(l."repetitionsCompleted")::int AS volume FROM "AthleteDiveLog" l JOIN "PoolDive" d ON d.id=l."poolDiveId" JOIN "PoolSection" s ON s.id=d."poolSectionId" WHERE l."athleteId"=$1 AND ($2::timestamptz IS NULL OR l.timestamp >= $2) AND ($3::timestamptz IS NULL OR l.timestamp < $3) GROUP BY family,d."diveCode",s.height,s.label ORDER BY family,d."diveCode",s.height`, [athlete.id, from, until])).rows;
  const totals = new Map<string, number>();
  for (const dive of rows) totals.set(dive.family, (totals.get(dive.family) ?? 0) + dive.volume);
  const families = Object.keys(familyStyles).filter((family) => (totals.get(family) ?? 0) > 0);
  const selectedFamily = familyValue && families.includes(familyValue) ? familyValue : families[0] ?? "Avant";
  const selectedDives = rows.filter((dive) => dive.family === selectedFamily);
  const maxVolume = Math.max(1, ...selectedDives.map((dive) => dive.volume));
  const total = rows.reduce((sum, dive) => sum + dive.volume, 0);
  const displayedDives = showAll ? selectedDives : selectedDives.slice(0, 7);
  const familyParam = (family: string, all = false) => `/athlete/progress/details?period=${period}&family=${encodeURIComponent(family)}${all ? "&all=1" : ""}`;

  return <AthleteShell className="progress-details-page">
    <header className="progress-details-header">
      <Link href="/athlete/progress" className="progress-details-back" aria-label="Retour à la progression"><ArrowLeft size={23} /></Link>
      <h1>Détail des plongeons</h1>
      <ProgressDetailsPeriod period={period} family={selectedFamily} />
    </header>
    <p className="progress-details-total">{total} plongeons · {families.length} familles</p>

    <nav className="progress-details-families" aria-label="Familles de plongeons">
      {families.map((family) => {
        const Icon = familyStyles[family].icon;
        return <Link href={familyParam(family)} key={family} aria-current={family === selectedFamily ? "true" : undefined} className="progress-details-family" style={{ "--family-color": familyStyles[family].color } as React.CSSProperties}>
          <Icon size={25} /><span><strong>{family}</strong><b>{totals.get(family)}</b></span>
        </Link>;
      })}
    </nav>

    <section className="progress-details-list" aria-label={`Plongeons ${selectedFamily}`}>
      {displayedDives.length ? displayedDives.map((dive) => <div className="progress-details-dive" key={`${dive.code}-${dive.height}`}>
        <div className="progress-details-dive-name"><strong>{dive.code}</strong><span>{displayHeight(dive)}</span></div>
        <div className="progress-details-dive-track"><i style={{ width: `${Math.max(16, Math.round(dive.volume / maxVolume * 100))}%`, backgroundColor: familyStyles[selectedFamily].color }} /></div>
        <b className="progress-details-dive-count">{dive.volume}</b><ChevronRight className="progress-details-chevron" size={23} />
      </div>) : <p className="progress-details-empty">Aucun plongeon pour cette période.</p>}
      {selectedDives.length > 7 && <Link className="progress-details-all" href={familyParam(selectedFamily, !showAll)}>{showAll ? "Réduire la liste" : `Voir tous les plongeons ${selectedFamily.toLowerCase()}`}<ChevronRight size={22} /></Link>}
    </section>
  </AthleteShell>;
}

function displayHeight(dive: DiveVolume) {
  if (dive.height === "ONE_METER") return "1 m";
  if (dive.height === "THREE_METER") return "3 m";
  if (dive.height === "PLATFORM") return dive.heightLabel ?? "Plateforme";
  return dive.heightLabel ?? "Autre";
}
