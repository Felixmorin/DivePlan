import Link from "next/link";
import { ArrowDown, ArrowDownUp, ArrowRight, CircleHelp, FileText, Gauge, Network, Server, Smartphone, TriangleAlert } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdmin } from "@/lib/current-user";
import { query } from "@/lib/db";
import { MetricSelector, PerformanceFilters } from "./performance-filters";

export const dynamic = "force-dynamic";

const periods = [{ key: "6h", hours: 6, label: "6 h" }, { key: "12h", hours: 12, label: "12 h" }, { key: "24h", hours: 24, label: "24 h" }, { key: "72h", hours: 72, label: "3 jours" }, { key: "7d", hours: 168, label: "7 jours" }];
const vitalNames = ["LCP", "INP", "CLS"] as const;
type VitalName = typeof vitalNames[number];
type VitalRow = { route: string; metric: string; samples: string; total: string; rated: string; good: string; needs: string; priorSamples: string; priorTotal: string; updatedAt: Date | null };
type TrendRow = { hour: Date; samples: string; total: string; maximum: string };
type DatabaseRow = { requests: string; resultBytes: string; duration: string; maximum: string; slow: string; updatedAt: Date | null };
type TransferRow = { route: string; requests: string; bytes: string; updatedAt: Date | null };
type ReadResult<T> = { rows: T[]; ok: boolean };
type VitalStat = { samples: number; total: number; average: number | null; rated: number; good: number; needs: number; bad: number; priorSamples: number; priorTotal: number; priorAverage: number | null; updatedAt: Date | null };
type RouteStat = { route: string; vitals: Record<VitalName, VitalStat> };

export default async function AdminPerformancePage({ searchParams }: { searchParams: Promise<{ period?: string; route?: string; metric?: string; sort?: string }> }) {
  await requireAdmin();
  const params = await searchParams;
  const selectedPeriod = periods.find((period) => period.key === params.period) ?? periods[2];
  const metric: VitalName = vitalNames.includes(params.metric as VitalName) ? params.metric as VitalName : "LCP";
  const allowedSort = ["LCP", "INP", "CLS"] as const;
  const sort: VitalName = allowedSort.includes(params.sort as VitalName) ? params.sort as VitalName : "LCP";
  const routeFilter = params.route && params.route.length <= 200 ? params.route : null;

  const [vitalsRead, trendRoutesRead, sqlRoutesRead, transferRoutesRead] = await Promise.all([
    readQuery<VitalRow>(`SELECT route, metric,
      COALESCE(SUM(samples) FILTER (WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour')), 0)::text AS samples,
      COALESCE(SUM("totalValue") FILTER (WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour')), 0)::text AS total,
      COALESCE(SUM("ratedSamples") FILTER (WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour')), 0)::text AS rated,
      COALESCE(SUM("goodSamples") FILTER (WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour')), 0)::text AS good,
      COALESCE(SUM("needsImprovementSamples") FILTER (WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour')), 0)::text AS needs,
      COALESCE(SUM(samples) FILTER (WHERE hour < NOW() - ($1::int * INTERVAL '1 hour') AND hour >= NOW() - ($1::int * 2 * INTERVAL '1 hour')), 0)::text AS "priorSamples",
      COALESCE(SUM("totalValue") FILTER (WHERE hour < NOW() - ($1::int * INTERVAL '1 hour') AND hour >= NOW() - ($1::int * 2 * INTERVAL '1 hour')), 0)::text AS "priorTotal",
      max("updatedAt") AS "updatedAt"
      FROM "PerformanceTelemetryHour"
      WHERE hour >= NOW() - ($1::int * 2 * INTERVAL '1 hour') AND metric = ANY($2::text[])
      GROUP BY route, metric ORDER BY route`, [selectedPeriod.hours, [...vitalNames]]),
    readQuery<{ route: string }>(`SELECT DISTINCT route FROM "PerformanceTelemetryHour" WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour') AND metric = ANY($2::text[]) ORDER BY route`, [selectedPeriod.hours, [...vitalNames]]),
    readQuery<{ route: string; requests: string; resultBytes: string; duration: string; maximum: string; slow: string }>(`SELECT route, SUM(requests)::text AS requests, SUM("resultBytes")::text AS "resultBytes", SUM("durationMs")::text AS duration, MAX("maxDurationMs")::text AS maximum, SUM("slowQueries")::text AS slow FROM "DatabaseEgressTelemetryHour" WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour') AND component <> 'historical_unclassified' GROUP BY route`, [selectedPeriod.hours]),
    readQuery<TransferRow>(`SELECT route, SUM(requests)::text AS requests, SUM("transferBytes")::text AS bytes, max("updatedAt") AS "updatedAt" FROM "TransferTelemetryHour" WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour') GROUP BY route`, [selectedPeriod.hours])
  ]);

  const allRoutes = [...new Set([...trendRoutesRead.rows.map((row) => row.route), ...sqlRoutesRead.rows.map((row) => row.route), ...transferRoutesRead.rows.map((row) => row.route)])].sort();
  const selectedRoute = routeFilter && allRoutes.includes(routeFilter) ? routeFilter : null;
  const visibleVitals = vitalsRead.rows.filter((row) => !selectedRoute || row.route === selectedRoute);
  const metrics = buildVitalStats(visibleVitals);
  const routes = buildRouteStats(vitalsRead.rows);
  const sortedRoutes = routes.toSorted((left, right) => compareNullable(right.vitals[sort].average, left.vitals[sort].average));
  const rankedIssues = routes.filter((row) => routeBadShare(row) >= 0).toSorted((left, right) => routeBadShare(right) - routeBadShare(left));
  const primaryIssue = rankedIssues.find((row) => routeBadShare(row) > 0);
  const defaultRoute = primaryIssue?.route ?? routes.toSorted((left, right) => compareNullable(right.vitals.LCP.average, left.vitals.LCP.average))[0]?.route ?? null;
  const chartRoute = selectedRoute ?? defaultRoute;
  const analysisRoute = selectedRoute ?? chartRoute;
  const [trendRead, selectedDbRead] = await Promise.all([
    chartRoute ? readQuery<TrendRow>(`SELECT hour, SUM(samples)::text AS samples, SUM("totalValue")::text AS total, MAX("maxValue")::text AS maximum FROM "PerformanceTelemetryHour" WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour') AND route = $2 AND metric = $3 GROUP BY hour ORDER BY hour`, [selectedPeriod.hours, chartRoute, metric]) : Promise.resolve({ rows: [] as TrendRow[], ok: true }),
    analysisRoute ? readQuery<DatabaseRow>(`SELECT COALESCE(SUM(requests),0)::text AS requests, COALESCE(SUM("resultBytes"),0)::text AS "resultBytes", COALESCE(SUM("durationMs"),0)::text AS duration, COALESCE(MAX("maxDurationMs"),0)::text AS maximum, COALESCE(SUM("slowQueries"),0)::text AS slow, MAX("updatedAt") AS "updatedAt" FROM "DatabaseEgressTelemetryHour" WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour') AND route = $2 AND component <> 'historical_unclassified'`, [selectedPeriod.hours, analysisRoute]) : Promise.resolve({ rows: [] as DatabaseRow[], ok: true })
  ]);
  const selectedDb = selectedDbRead.rows[0];
  const selectedTransfer = analysisRoute ? transferRoutesRead.rows.find((row) => row.route === analysisRoute) : undefined;
  const peerTransferRatios = transferRoutesRead.rows.filter((row) => row.route !== analysisRoute && Number(row.requests) > 0).map((row) => Number(row.bytes) / Number(row.requests));
  const peerTransferAverage = peerTransferRatios.length ? peerTransferRatios.reduce((sum, value) => sum + value, 0) / peerTransferRatios.length : null;
  const selectedTransferAverage = selectedTransfer && Number(selectedTransfer.requests) > 0 ? Number(selectedTransfer.bytes) / Number(selectedTransfer.requests) : null;
  const transferChange = selectedTransferAverage !== null && peerTransferAverage !== null && peerTransferAverage > 0 ? Math.round((selectedTransferAverage - peerTransferAverage) / peerTransferAverage * 100) : null;
  const lastUpdated = [...vitalsRead.rows.map((row) => row.updatedAt), ...transferRoutesRead.rows.map((row) => row.updatedAt), selectedDb?.updatedAt ?? null].filter((date): date is Date => date instanceof Date).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const hasVitalData = visibleVitals.length > 0;
  const queryFailed = !vitalsRead.ok || !trendRoutesRead.ok;

  return <AdminShell active="Performance">
    <div className="mx-auto max-w-[1680px] space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Performance</h1><p className="mt-1 text-sm leading-6 text-slate-600">Identifiez où l’application ralentit et ce qui en est la cause.</p></div>
        <PerformanceFilters routes={allRoutes} updatedAt={lastUpdated ? relativeTime(lastUpdated) : "aucune mesure"} />
      </header>

      <Card>
        <CardContent className="p-4 sm:p-5">
          <SectionHeading icon={Gauge} title="Web Vitals" detail={`Valeurs navigateur agrégées · ${selectedPeriod.label} · source PerformanceTelemetryHour`} />
          {queryFailed && <DataNotice title="Certaines métriques sont indisponibles" detail="Une ou plusieurs requêtes de mesures n’ont pas abouti. Actualisez la page ou ouvrez Observabilité." href="/admin/observability" />}
          <div className="grid gap-3 xl:grid-cols-3">
            {vitalNames.map((name) => <VitalCard key={name} name={name} stat={metrics[name]} periodLabel={selectedPeriod.label} selectedRoute={selectedRoute} />)}
          </div>
          {!hasVitalData && !queryFailed && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">Aucun Web Vital pour cette période{selectedRoute ? ` sur ${selectedRoute}` : ""}. Les mesures navigateur ne sont envoyées qu’après une navigation instrumentée.</p>}
        </CardContent>
      </Card>

      <div className="grid items-start gap-4 2xl:grid-cols-[minmax(0,1.15fr)_minmax(440px,0.85fr)]">
        <Card className="overflow-hidden">
          <CardContent className="p-4 sm:p-5">
            <SectionHeading icon={FileText} title="Routes les plus lentes" detail={`Classées par ${sort} moyen observé · p50/p95 serveur non instrumentés`} />
            <div className="overflow-x-auto"><table className="w-full min-w-[790px] text-left text-xs">
              <thead><tr className="border-b border-slate-200 text-slate-500"><th className="py-2 pr-3">Route</th>{vitalNames.map((name) => <th key={name} className="py-2 pr-3"><SortLink name={name} sort={sort} period={selectedPeriod.key} route={selectedRoute} metric={metric} /></th>)}<th className="py-2 pr-3">p50</th><th className="py-2 pr-3">p95</th><th className="py-2">Utilisateurs touchés</th></tr></thead>
              <tbody>{sortedRoutes.map((row) => {
                const selected = row.route === chartRoute;
                const issue = row.route === primaryIssue?.route && routeBadShare(row) > 0;
                return <tr key={row.route} className={`border-b border-slate-100 last:border-0 ${issue ? "bg-rose-50/80" : selected ? "bg-blue-50/60" : "hover:bg-slate-50"}`}>
                  <td className="py-2.5 pr-3"><Link href={buildUrl({ period: selectedPeriod.key, metric, route: row.route, sort })} aria-current={selected ? "true" : undefined} className="inline-flex items-center gap-1.5 font-bold text-slate-800 hover:text-blue-700">{row.route}{issue && <TriangleAlert aria-label="Part élevée de mesures classées mauvaises" className="h-3.5 w-3.5 text-rose-600" />}</Link>{issue && <span className="ml-2 rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold text-rose-800">À surveiller</span>}</td>
                  {vitalNames.map((name) => <td key={name} className={`py-2.5 pr-3 font-semibold tabular-nums ${metricTone(name, row.vitals[name])}`}>{formatVital(name, row.vitals[name].average)}</td>)}
                  <td className="py-2.5 pr-3 text-slate-400">Non mesuré</td><td className="py-2.5 pr-3 text-slate-400">Non mesuré</td><td className="py-2.5 text-slate-400">Non mesuré</td>
                </tr>;
              })}{!sortedRoutes.length && <tr><td colSpan={7} className="py-10 text-center text-sm text-slate-500">Aucune route n’a de mesure LCP, INP ou CLS sur la période.</td></tr>}</tbody>
            </table></div>
            {sortedRoutes.length > 0 && <p className="mt-3 text-[10px] leading-4 text-slate-500">Valeurs LCP/INP/CLS = moyennes des échantillons, pas p95. La route à surveiller est celle dont la part d’échantillons « Mauvais » est la plus élevée. La télémétrie ne contient ni identifiants utilisateurs ni percentiles de latence.</p>}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardContent className="p-4 sm:p-5">
            <div className="mb-2 flex flex-wrap items-start justify-between gap-3"><SectionHeading icon={Activity} title="Latence dans le temps" detail={`${chartRoute ?? "Aucune route mesurée"} · ${selectedPeriod.label}`} /><MetricSelector /></div>
            <VitalChart rows={trendRead.rows} name={metric} route={chartRoute} periodHours={selectedPeriod.hours} />
            <div className="mt-2 flex flex-wrap justify-center gap-4 text-[10px] text-slate-600"><Legend color="bg-blue-600" label="Moyenne mesurée" /><Legend color="bg-rose-500" label="Maximum observé" /></div>
            <p className="mt-2 text-center text-[10px] text-slate-500">Série temporelle de Web Vitals navigateur. Médiane, p50 et p95 API non disponibles.</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[1fr_1fr] 2xl:grid-cols-[1.1fr_0.9fr_0.9fr]">
        <Card><CardContent className="p-4 sm:p-5">
          <SectionHeading icon={Server} title="Analyse de la route sélectionnée" detail={analysisRoute ?? "Sélectionnez une route dans le tableau"} href="/admin/optimisation" hrefLabel="Détails SQL" />
          <div className="space-y-3">
            <BreakdownRow label="Temps serveur p95" value="Non mesuré" detail="Aucune durée de requête serveur" tone="blue" />
            <BreakdownRow label="Requêtes SQL" value={selectedRoute && Number(selectedDb?.requests ?? 0) ? `${(Number(selectedDb?.duration ?? 0) / Number(selectedDb?.requests ?? 1)).toLocaleString("fr-CA", { maximumFractionDigits: 1 })} ms moy.` : "Non mesuré"} detail={selectedRoute && Number(selectedDb?.requests ?? 0) ? `${Number(selectedDb?.requests).toLocaleString("fr-CA")} requêtes · max observé ${Number(selectedDb?.maximum ?? 0).toLocaleString("fr-CA", { maximumFractionDigits: 1 })} ms` : "Aucune mesure SQL attribuée à cette route"} tone="violet" />
            <BreakdownRow label="Transfert navigateur / ressource" value={selectedTransferAverage === null ? "Non mesuré" : formatBytes(selectedTransferAverage)} detail={selectedTransfer ? `${Number(selectedTransfer.requests).toLocaleString("fr-CA")} ressources · moy. des autres routes ${peerTransferAverage === null ? "indisponible" : formatBytes(peerTransferAverage)}` : "Aucune mesure de transfert pour cette route"} tone="teal" />
          </div>
          {selectedTransferAverage !== null && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">Variation du transfert moyen par ressource par rapport aux autres routes : {transferChange === null ? "comparaison indisponible" : `${transferChange > 0 ? "+" : ""}${transferChange}%`}. Ce n’est pas une taille de réponse serveur ni une ventilation du temps total.</p>}
          <p className="mt-3 text-[10px] leading-4 text-slate-500">Les mesures SQL sont un temps moyen et un maximum côté application, pas le temps d’attente SQL isolé ni une décomposition p95. Les segments non observés ne sont pas répartis artificiellement.</p>
        </CardContent></Card>

        <ComparisonCard icon={Smartphone} title="Comparaison par appareil" subtitle="Mobile et ordinateur" rows={["Mobile", "Ordinateur"]} />
        <ComparisonCard icon={Network} title="Comparaison réseau" subtitle="Réseau lent et réseau rapide" rows={["Réseau lent", "Réseau rapide"]} />
      </div>

      <Card className="border-amber-200 bg-amber-50/40"><CardContent className="flex flex-wrap items-start gap-3 p-4 sm:p-5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-800"><TriangleAlert className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1"><h2 className="text-sm font-black text-slate-900">Régression après déploiement</h2><p className="mt-1 text-xs leading-5 text-slate-700">Aucune source de déploiement n’est connectée. DivePlan ne peut pas comparer les mesures avant/après un déploiement ni confirmer une corrélation temporelle.</p><p className="mt-1 text-[10px] text-slate-500">Un écart entre périodes n’établit pas à lui seul une régression ni sa cause.</p></div>
        <Link href="/admin/observability" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-amber-50">Métriques disponibles <ArrowRight className="h-3.5 w-3.5" /></Link>
      </CardContent></Card>

      <p className="text-right text-[10px] text-slate-500">Source Web Vitals : PerformanceTelemetryHour · valeurs en ms (LCP/INP) ou score sans unité (CLS) · dernière collecte {lastUpdated ? dateTime(lastUpdated) : "indisponible"}. Les filtres appareil et navigateur sont inactifs car ces dimensions ne sont pas collectées.</p>
    </div>
  </AdminShell>;
}

async function readQuery<T extends import("pg").QueryResultRow>(sql: string, params: readonly unknown[] = []): Promise<ReadResult<T>> {
  try { return { rows: (await query<T>(sql, params)).rows, ok: true }; } catch { return { rows: [], ok: false }; }
}

function buildRouteStats(rows: VitalRow[]): RouteStat[] {
  const routes = new Map<string, Record<VitalName, VitalStat>>();
  for (const row of rows) {
    if (!vitalNames.includes(row.metric as VitalName)) continue;
    const name = row.metric as VitalName;
    const currentSamples = Number(row.samples);
    const rated = Number(row.rated);
    const good = Number(row.good);
    const needs = Number(row.needs);
    const routeVitals = routes.get(row.route) ?? emptyVitals();
    routeVitals[name] = { samples: currentSamples, total: Number(row.total), average: currentSamples ? Number(row.total) / currentSamples : null, rated, good, needs, bad: Math.max(0, rated - good - needs), priorSamples: Number(row.priorSamples), priorTotal: Number(row.priorTotal), priorAverage: Number(row.priorSamples) ? Number(row.priorTotal) / Number(row.priorSamples) : null, updatedAt: row.updatedAt };
    routes.set(row.route, routeVitals);
  }
  return [...routes.entries()].map(([route, vitals]) => ({ route, vitals }));
}

function emptyVitals(): Record<VitalName, VitalStat> {
  return { LCP: emptyVital(), INP: emptyVital(), CLS: emptyVital() };
}
function emptyVital(): VitalStat { return { samples: 0, total: 0, average: null, rated: 0, good: 0, needs: 0, bad: 0, priorSamples: 0, priorTotal: 0, priorAverage: null, updatedAt: null }; }
function buildVitalStats(rows: VitalRow[]) {
  const result = emptyVitals();
  for (const row of rows) {
    if (!vitalNames.includes(row.metric as VitalName)) continue;
    const name = row.metric as VitalName;
    const samples = Number(row.samples); const rated = Number(row.rated); const good = Number(row.good); const needs = Number(row.needs);
    result[name] = { samples, total: Number(row.total), average: samples ? Number(row.total) / samples : null, rated, good, needs, bad: Math.max(0, rated - good - needs), priorSamples: Number(row.priorSamples), priorTotal: Number(row.priorTotal), priorAverage: Number(row.priorSamples) ? Number(row.priorTotal) / Number(row.priorSamples) : null, updatedAt: row.updatedAt };
  }
  return result;
}

function VitalCard({ name, stat, periodLabel, selectedRoute }: { name: VitalName; stat: VitalStat; periodLabel: string; selectedRoute: string | null }) {
  const labels = { LCP: "Largest Contentful Paint", INP: "Interaction to Next Paint", CLS: "Cumulative Layout Shift" };
  const formatted = formatVital(name, stat.average);
  const delta = stat.average !== null && stat.priorAverage !== null ? ((stat.average - stat.priorAverage) / stat.priorAverage) * 100 : null;
  const rated = stat.rated;
  const goodPct = rated ? stat.good / rated * 100 : null;
  const needsPct = rated ? stat.needs / rated * 100 : null;
  const badPct = rated ? stat.bad / rated * 100 : null;
  const thresholds = name === "LCP" ? "Bon ≤ 2,5 s · à améliorer 2,5–4 s · mauvais > 4 s" : name === "INP" ? "Bon ≤ 200 ms · à améliorer 200–500 ms · mauvais > 500 ms" : "Bon ≤ 0,1 · à améliorer 0,1–0,25 · mauvais > 0,25";
  return <div className="rounded-xl border border-slate-200 p-3.5 sm:p-4">
    <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className={`grid h-8 w-8 place-items-center rounded-lg ${name === "LCP" ? "bg-blue-50 text-blue-700" : name === "INP" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}><Gauge className="h-4 w-4" /></span><div><h3 className="text-sm font-black text-slate-950">{name}</h3><p className="text-[10px] text-slate-500">{labels[name]}</p></div></div></div><div className="text-right"><p className="text-2xl font-black tabular-nums text-slate-950">{formatted}</p><p className={`text-[10px] font-bold ${delta === null ? "text-slate-400" : delta > 0 ? "text-rose-600" : "text-emerald-700"}`}>{delta === null ? "Variation indisponible" : `${delta > 0 ? "↑ +" : "↓ "}${Math.abs(delta).toLocaleString("fr-CA", { maximumFractionDigits: 1 })}% vs période précédente`}</p></div></div>
    <div className="mt-3" aria-label={rated ? `Distribution de ${name}: bon ${goodPct!.toFixed(1)} pour cent, à améliorer ${needsPct!.toFixed(1)} pour cent, mauvais ${badPct!.toFixed(1)} pour cent` : `Répartition des catégories ${name} non mesurée`}>
      {rated ? <div className="flex h-5 overflow-hidden rounded-md" role="img" aria-label={`${rated} échantillons évalués`}><span className="grid place-items-center bg-emerald-500 text-[10px] font-bold text-white" style={{ width: `${goodPct}%` }}>{goodPct! >= 12 ? `${Math.round(goodPct!)} %` : ""}</span><span className="grid place-items-center bg-amber-400 text-[10px] font-bold text-amber-950" style={{ width: `${needsPct}%` }}>{needsPct! >= 12 ? `${Math.round(needsPct!)} %` : ""}</span><span className="grid place-items-center bg-rose-500 text-[10px] font-bold text-white" style={{ width: `${badPct}%` }}>{badPct! >= 12 ? `${Math.round(badPct!)} %` : ""}</span></div> : <div className="grid h-5 place-items-center rounded-md bg-slate-100 text-[10px] font-semibold text-slate-500">Catégories non mesurées</div>}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-slate-600"><Legend color="bg-emerald-500" label={`Bon${goodPct === null ? "" : ` ${Math.round(goodPct)} %`}`} /><Legend color="bg-amber-400" label={`À améliorer${needsPct === null ? "" : ` ${Math.round(needsPct)} %`}`} /><Legend color="bg-rose-500" label={`Mauvais${badPct === null ? "" : ` ${Math.round(badPct)} %`}`} /></div>
    </div>
    <div className="mt-3 border-t border-slate-100 pt-2"><p className="text-[9px] leading-4 text-slate-500">{thresholds}</p><p className="mt-1 text-[9px] text-slate-400">{stat.samples ? `${stat.samples.toLocaleString("fr-CA")} mesures · ${periodLabel}${selectedRoute ? ` · ${selectedRoute}` : " · toutes routes"}` : `Aucune mesure · ${periodLabel}`}</p></div>
  </div>;
}

function SectionHeading({ icon: Icon, title, detail, href, hrefLabel }: { icon: typeof Activity; title: string; detail: string; href?: string; hrefLabel?: string }) {
  return <div className="mb-3 flex items-center gap-2.5 border-b border-slate-100 pb-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-700"><Icon className="h-4 w-4" /></span><div className="min-w-0 flex-1"><h2 className="truncate text-sm font-black text-slate-950">{title}</h2><p className="truncate text-[10px] text-slate-500">{detail}</p></div>{href && <Link href={href} className="inline-flex min-h-8 shrink-0 items-center gap-1 text-[11px] font-bold text-blue-700 hover:text-blue-900">{hrefLabel ?? "Détails"} <ArrowRight className="h-3 w-3" /></Link>}</div>;
}

function SortLink({ name, sort, period, route, metric }: { name: VitalName; sort: VitalName; period: string; route: string | null; metric: VitalName }) {
  const active = sort === name;
  const DirectionIcon = active ? ArrowDown : ArrowDownUp;
  return <Link href={buildUrl({ period, route, metric, sort: name })} aria-label={`Trier par ${name}${active ? ", décroissant" : ""}`} className={`inline-flex items-center gap-1 hover:text-blue-700 ${active ? "font-black text-blue-700" : "font-semibold"}`}>{name} <DirectionIcon className="h-3 w-3" /></Link>;
}

function VitalChart({ rows, name, route, periodHours }: { rows: TrendRow[]; name: VitalName; route: string | null; periodHours: number }) {
  const points = rows.map((row) => ({ time: row.hour, average: Number(row.total) / Math.max(1, Number(row.samples)), max: Number(row.maximum) }));
  if (!route || !points.length) return <div className="grid h-56 place-items-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-5 text-center"><div><CircleHelp className="mx-auto h-6 w-6 text-slate-400" /><p className="mt-2 text-xs font-bold text-slate-700">{route ? "Aucune donnée temporelle pour cette route et cette métrique" : "Aucune route sélectionnée ou mesurée"}</p><p className="mt-1 text-[10px] text-slate-500">Les valeurs API p50/p95 ne sont pas disponibles dans la source actuelle.</p></div></div>;
  const width = 760, height = 225, left = 46, right = 14, top = 14, bottom = 30;
  const maxValue = Math.max(1, ...points.flatMap((point) => [point.average, point.max]));
  const yMax = maxValue * 1.12;
  const x = (index: number) => left + (points.length < 2 ? 0 : index / (points.length - 1) * (width - left - right));
  const y = (value: number) => height - bottom - value / yMax * (height - top - bottom);
  const line = (key: "average" | "max") => points.map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(point[key]).toFixed(1)}`).join(" ");
  const ticks = 4;
  const formatAxis = (value: number) => name === "CLS" ? value.toLocaleString("fr-CA", { maximumFractionDigits: 2 }) : value >= 1000 ? `${(value / 1000).toLocaleString("fr-CA", { maximumFractionDigits: 1 })} s` : `${Math.round(value)} ms`;
  return <div className="overflow-x-auto"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${name} moyen et maximum observé pour ${route}, période ${periodHours} heures`} className="h-56 min-w-[570px] w-full">
    {[0, 1, 2, 3, 4].map((index) => { const value = yMax * (4 - index) / ticks; const py = y(value); return <g key={index}><line x1={left} x2={width - right} y1={py} y2={py} stroke="#e7edf4" /><text x={left - 7} y={py + 3} textAnchor="end" fill="#64748b" fontSize="10">{formatAxis(value)}</text></g>; })}
    {points.length > 1 && <path d={`${line("max")} L${x(points.length - 1)},${height - bottom} L${x(0)},${height - bottom} Z`} fill="#ef4444" fillOpacity=".08" />}
    <path d={line("max")} fill="none" stroke="#ef4444" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    <path d={line("average")} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    {points.map((point, index) => <g key={point.time.toISOString()}><title>{`${dateTime(point.time)} · moyenne ${formatAxis(point.average)} · maximum observé ${formatAxis(point.max)}`}</title><circle cx={x(index)} cy={y(point.average)} r="3" fill="#2563eb" /><circle cx={x(index)} cy={y(point.max)} r="2.5" fill="#ef4444" /></g>)}
    {points.filter((_, index) => index % Math.max(1, Math.ceil(points.length / 6)) === 0).map((point) => <text key={`x-${point.time.toISOString()}`} x={x(points.indexOf(point))} y={height - 8} textAnchor="middle" fill="#64748b" fontSize="10">{new Intl.DateTimeFormat("fr-CA", { hour: "2-digit", timeZone: "America/Toronto" }).format(point.time)}</text>)}
  </svg></div>;
}

function BreakdownRow({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: "blue" | "violet" | "teal" }) {
  const color = { blue: "bg-blue-500", violet: "bg-violet-500", teal: "bg-teal-500" }[tone];
  return <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-slate-100 pb-2.5 last:border-0"><div className="min-w-0"><p className="flex items-center gap-2 text-xs font-bold text-slate-800"><span className={`h-2 w-2 rounded-full ${color}`} />{label}</p><p className="mt-1 pl-4 text-[10px] leading-4 text-slate-500">{detail}</p></div><p className="whitespace-nowrap text-xs font-black tabular-nums text-slate-800">{value}</p></div>;
}

function ComparisonCard({ icon: Icon, title, subtitle, rows }: { icon: typeof Smartphone; title: string; subtitle: string; rows: string[] }) {
  return <Card><CardContent className="p-4 sm:p-5"><SectionHeading icon={Icon} title={title} detail={subtitle} />{rows.map((name) => <div key={name} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-b border-slate-100 py-2 last:border-0"><div><p className="text-xs font-bold text-slate-800">{name}</p><p className="text-[9px] text-slate-500">p50 · p95 · utilisateurs · tendance</p></div><span className="self-center text-[10px] font-semibold text-slate-500">Non mesuré</span></div>)}<p className="mt-2 text-[10px] leading-4 text-slate-500">La collecte ne conserve pas les dimensions {title.includes("appareil") ? "d’appareil" : "de réseau"}; aucune comparaison fiable n’est disponible.</p></CardContent></Card>;
}

function DataNotice({ title, detail, href }: { title: string; detail: string; href: string }) { return <div role="status" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2"><div><p className="text-xs font-bold text-amber-900">{title}</p><p className="text-[10px] text-amber-800">{detail}</p></div><Link href={href} className="text-xs font-bold text-blue-700">Ouvrir <ArrowRight className="inline h-3 w-3" /></Link></div>; }
function Legend({ color, label }: { color: string; label: string }) { return <span className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${color}`} />{label}</span>; }
function metricTone(name: VitalName, stat: VitalStat) { if (stat.average === null) return "text-slate-400"; const [good, needs] = threshold(name); return stat.average <= good ? "text-emerald-700" : stat.average <= needs ? "text-amber-700" : "text-rose-700"; }
function threshold(name: VitalName): [number, number] { return name === "LCP" ? [2500, 4000] : name === "INP" ? [200, 500] : [0.1, 0.25]; }
function formatVital(name: VitalName, value: number | null) { if (value === null) return "—"; if (name === "LCP") return `${(value / 1000).toLocaleString("fr-CA", { maximumFractionDigits: 2 })} s`; if (name === "INP") return `${value.toLocaleString("fr-CA", { maximumFractionDigits: 0 })} ms`; return value.toLocaleString("fr-CA", { maximumFractionDigits: 3 }); }
function routeBadShare(route: RouteStat) { const metrics = vitalNames.map((name) => route.vitals[name]).filter((stat) => stat.rated > 0); const total = metrics.reduce((sum, stat) => sum + stat.rated, 0); return total ? metrics.reduce((sum, stat) => sum + stat.bad, 0) / total : -1; }
function compareNullable(left: number | null, right: number | null) { if (left === null) return right === null ? 0 : 1; if (right === null) return -1; return left - right; }
function buildUrl({ period, metric, route, sort }: { period: string; metric: VitalName; route: string | null; sort: VitalName }) { const params = new URLSearchParams({ period, metric, sort }); if (route) params.set("route", route); return `/admin/performance?${params.toString()}`; }
function formatBytes(bytes: number) { if (bytes < 1024) return `${Math.round(bytes)} o`; const units = ["Ko", "Mo", "Go", "To"]; let value = bytes / 1024; let unit = 0; while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; } return `${value.toLocaleString("fr-CA", { maximumFractionDigits: 1 })} ${units[unit]}`; }
function dateTime(date: Date) { return new Intl.DateTimeFormat("fr-CA", { dateStyle: "short", timeStyle: "short", timeZone: "America/Toronto" }).format(date); }
function relativeTime(date: Date) { const minutes = Math.floor(Math.max(0, Date.now() - date.getTime()) / 60_000); return minutes < 1 ? "à l’instant" : `il y a ${minutes} min`; }
