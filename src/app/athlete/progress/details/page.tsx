import Link from "@/components/ui/app-link";
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
const familyOrder = ["Avant", "Arriere", "Renverse", "Retourne", "Vrille", "Equilibre"] as const;
type DiveFamily = (typeof familyOrder)[number];

function isDiveFamily(value: string): value is DiveFamily {
  return familyOrder.includes(value as DiveFamily);
}

type DiveVolume = { family: string; code: string; height: string; heightLabel: string | null; volume: number };
type DiveDateVolume = DiveVolume & { date: string };

export default async function AthleteDiveDetailsPage({ searchParams }: {
  searchParams: Promise<{ period?: string | string[]; family?: string | string[]; all?: string | string[] }>;
}) {
  const athlete = await getCurrentAthlete();
  if (!athlete) redirect("/login");
  const params = await searchParams;
  const periodValue = Array.isArray(params.period) ? params.period[0] : params.period;
  const period = periodValue === "month" || periodValue === "season" ? periodValue : "week";
  const familyValue = Array.isArray(params.family) ? params.family[0] : params.family;
  const showAllValue = Array.isArray(params.all) ? params.all[0] : params.all;
  const showAll = showAllValue === "1";

  let from: Date;
  let until: Date;
  if (period === "week") {
    from = startOfMontrealWeek();
    until = addMontrealDays(from, 7);
  } else if (period === "month") {
    const [year, month] = toMontrealDateInputValue().split("-").map(Number);
    from = parseMontrealSessionDate(`${year}-${String(month).padStart(2, "0")}-01`, "00:00");
    const nextMonth = new Date(Date.UTC(year, month, 1));
    until = parseMontrealSessionDate(`${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, "0")}-01`, "00:00");
  } else {
    const [year, month] = toMontrealDateInputValue().split("-").map(Number);
    const seasonStartYear = month >= 9 ? year : year - 1;
    from = parseMontrealSessionDate(`${seasonStartYear}-09-01`, "00:00");
    until = parseMontrealSessionDate(`${seasonStartYear + 1}-08-31`, "00:00");
  }

  const dateRows = (await query<DiveDateVolume>(`SELECT COALESCE(l."familyOverride",CASE left(d."diveCode",1) WHEN '1' THEN 'Avant' WHEN '2' THEN 'Arriere' WHEN '3' THEN 'Renverse' WHEN '4' THEN 'Retourne' WHEN '5' THEN 'Vrille' ELSE 'Equilibre' END) AS family,d."diveCode" AS code,s.height,s.label AS "heightLabel",to_char(l.timestamp AT TIME ZONE 'America/Toronto','YYYY-MM-DD') AS date,SUM(l."repetitionsCompleted")::int AS volume FROM "AthleteDiveLog" l JOIN "PoolDive" d ON d.id=l."poolDiveId" JOIN "PoolSection" s ON s.id=d."poolSectionId" WHERE l."athleteId"=$1 AND l.timestamp >= $2 AND l.timestamp < $3 GROUP BY family,d."diveCode",s.height,s.label,date HAVING SUM(l."repetitionsCompleted") > 0 ORDER BY family,d."diveCode",s.height,date DESC`, [athlete.id, from, until])).rows;
  const datesByDive = new Map<string, DiveDateVolume[]>();
  const diveTotals = new Map<string, DiveVolume>();
  for (const row of dateRows) {
    const key = diveKey(row);
    datesByDive.set(key, [...(datesByDive.get(key) ?? []), row]);
    const dive = diveTotals.get(key);
    if (dive) dive.volume += row.volume;
    else diveTotals.set(key, { family: row.family, code: row.code, height: row.height, heightLabel: row.heightLabel, volume: row.volume });
  }
  const rows = [...diveTotals.values()];
  const totals = new Map<string, number>();
  for (const dive of rows) totals.set(dive.family, (totals.get(dive.family) ?? 0) + dive.volume);
  const families = familyOrder.filter((family) => (totals.get(family) ?? 0) > 0);
  const selectedFamily = familyValue && isDiveFamily(familyValue) && families.includes(familyValue) ? familyValue : families[0] ?? "Avant";
  const selectedDives = rows.filter((dive) => dive.family === selectedFamily);
  const heightGroups = ["1 m", "3 m", "Plateforme", "Autres"].map((label) => ({
    label,
    dives: selectedDives.filter((dive) => heightCategory(dive) === label)
  })).filter((group) => group.dives.reduce((sum, dive) => sum + dive.volume, 0) > 0);
  const total = rows.reduce((sum, dive) => sum + dive.volume, 0);
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

    {heightGroups.length ? heightGroups.map((group) => {
      const categoryTotal = group.dives.reduce((sum, dive) => sum + dive.volume, 0);
      const groupDives = showAll ? group.dives : group.dives.slice(0, 7);
      return <section className="progress-details-list progress-details-height-group" aria-label={`${group.label} · ${categoryTotal} plongeons`} key={group.label}>
        <h2 className="progress-details-height-heading"><span>{group.label}</span><b>{categoryTotal}</b></h2>
        {groupDives.map((dive) => <details className="progress-dive-details" key={diveKey(dive)}>
          <summary className="progress-details-dive">
            <div className="progress-details-dive-name"><strong>{dive.code}</strong>{(group.label === "Plateforme" || group.label === "Autres") && <span>{dive.heightLabel ?? (group.label === "Plateforme" ? "Plateforme" : "Autre")}</span>}</div>
            <b className="progress-details-dive-count">{dive.volume}</b><ChevronRight className="progress-details-chevron" size={23} />
          </summary>
          <div className="progress-dive-dates" aria-label={`Dates du plongeon ${dive.code}`}>
            {(datesByDive.get(diveKey(dive)) ?? []).map((dateRow) => <div className="progress-dive-date" key={dateRow.date}><span>{formatDiveDate(dateRow.date)}</span><b>{dateRow.volume} répétition{dateRow.volume === 1 ? "" : "s"}</b></div>)}
          </div>
        </details>)}
        {group.dives.length > 7 && <Link className="progress-details-all" href={familyParam(selectedFamily, !showAll)}>{showAll ? "Réduire la liste" : `Voir tous les plongeons ${group.label.toLowerCase()}`}<ChevronRight size={22} /></Link>}
      </section>;
    }) : <p className="progress-details-empty">Aucun plongeon pour cette période.</p>}
  </AthleteShell>;
}

function heightCategory(dive: DiveVolume) {
  if (dive.height === "ONE_METER") return "1 m";
  if (dive.height === "THREE_METER") return "3 m";
  const normalizedHeight = (dive.heightLabel ?? "").toLowerCase().replace(/[\s,]/g, "").replace(".", "");
  if (["3mt", "5m", "75m", "10m"].includes(normalizedHeight)) return "Plateforme";
  if (!normalizedHeight && dive.height === "PLATFORM") return "Plateforme";
  return "Autres";
}

function diveKey(dive: DiveVolume) {
  return `${dive.family}|${dive.code}|${dive.height}|${dive.heightLabel ?? ""}`;
}

function formatDiveDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-CA", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}
