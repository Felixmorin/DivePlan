import Link from "next/link";
import { ArrowDown, ArrowDownUp, ArrowRight, BarChart3, CircleHelp, Database, FileText, Gauge, Layers3, Repeat2, ShieldAlert, Timer, Waves } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdmin } from "@/lib/current-user";
import { pool, query } from "@/lib/db";
import { DatabaseFilters } from "./database-filters";

export const dynamic = "force-dynamic";

const periods = [{ key: "6h", hours: 6, label: "6 dernières heures" }, { key: "24h", hours: 24, label: "24 dernières heures" }, { key: "7d", hours: 168, label: "7 derniers jours" }, { key: "30d", hours: 720, label: "30 derniers jours" }];
type TotalsRow = { sqlCalls: string; resultBytes: string; duration: string; maxDuration: string; slow: string; updatedAt: Date | null };
type TransferTotalsRow = { requests: string; bytes: string; updatedAt: Date | null };
type RouteTransferRow = { route: string; requests: string; bytes: string; updatedAt: Date | null };
type RouteSqlRow = { route: string; requests: string; bytes: string; duration: string; maxDuration: string; slow: string; updatedAt: Date | null };
type ChartRow = { bucket: Date; bytes: string };
type ReadResult<T> = { rows: T[]; ok: boolean };
type RouteStat = { route: string; transferBytes: number; resources: number; sqlCalls: number; resultBytes: number; duration: number; maxDuration: number; slow: number; lastUpdated: Date | null };

export default async function AdminDatabasePage({ searchParams }: { searchParams: Promise<{ period?: string; aggregation?: string; sort?: string; route?: string }> }) {
  await requireAdmin();
  const params = await searchParams;
  const selected = periods.find((period) => period.key === params.period) ?? periods[1];
  const aggregation = params.aggregation === "day" ? "day" : "hour";
  const sort = ["transfer", "sql", "result"].includes(params.sort ?? "") ? params.sort! : "transfer";
  const selectedRoute = params.route && params.route.length <= 200 ? params.route : null;
  const poolTotal = pool.totalCount;
  const poolIdle = pool.idleCount;
  const poolUsed = Math.max(0, poolTotal - poolIdle);
  const poolMax = pool.options.max ?? null;
  const waiting = pool.waitingCount;
  const usedPercent = poolMax ? Math.min(100, poolUsed / poolMax * 100) : null;

  const [sqlTotalsRead, transferTotalsRead, transferRoutesRead, sqlRoutesRead, chartRead, selectedSqlRead] = await Promise.all([
    readQuery<TotalsRow>(`SELECT COALESCE(SUM(requests),0)::text AS "sqlCalls", COALESCE(SUM("resultBytes"),0)::text AS "resultBytes", COALESCE(SUM("durationMs"),0)::text AS duration, COALESCE(MAX("maxDurationMs"),0)::text AS "maxDuration", COALESCE(SUM("slowQueries"),0)::text AS slow, MAX("updatedAt") AS "updatedAt" FROM "DatabaseEgressTelemetryHour" WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour') AND component <> 'historical_unclassified'`, [selected.hours]),
    readQuery<TransferTotalsRow>(`SELECT COALESCE(SUM(requests),0)::text AS requests, COALESCE(SUM("transferBytes"),0)::text AS bytes, MAX("updatedAt") AS "updatedAt" FROM "TransferTelemetryHour" WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour')`, [selected.hours]),
    readQuery<RouteTransferRow>(`SELECT route, SUM(requests)::text AS requests, SUM("transferBytes")::text AS bytes, MAX("updatedAt") AS "updatedAt" FROM "TransferTelemetryHour" WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour') GROUP BY route`, [selected.hours]),
    readQuery<RouteSqlRow>(`SELECT route, SUM(requests)::text AS requests, SUM("resultBytes")::text AS bytes, SUM("durationMs")::text AS duration, MAX("maxDurationMs")::text AS "maxDuration", SUM("slowQueries")::text AS slow, MAX("updatedAt") AS "updatedAt" FROM "DatabaseEgressTelemetryHour" WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour') AND component <> 'historical_unclassified' GROUP BY route`, [selected.hours]),
    readQuery<ChartRow>(`SELECT date_trunc($1, hour) AS bucket, SUM("transferBytes")::text AS bytes FROM "TransferTelemetryHour" WHERE hour >= NOW() - ($2::int * INTERVAL '1 hour') GROUP BY date_trunc($1, hour) ORDER BY bucket`, [aggregation, selected.hours]),
    selectedRoute ? readQuery<RouteSqlRow>(`SELECT route, SUM(requests)::text AS requests, SUM("resultBytes")::text AS bytes, SUM("durationMs")::text AS duration, MAX("maxDurationMs")::text AS "maxDuration", SUM("slowQueries")::text AS slow, MAX("updatedAt") AS "updatedAt" FROM "DatabaseEgressTelemetryHour" WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour') AND component <> 'historical_unclassified' AND route = $2 GROUP BY route`, [selected.hours, selectedRoute]) : Promise.resolve({ rows: [] as RouteSqlRow[], ok: true })
  ]);

  const transferTotals = transferTotalsRead.rows[0];
  const sqlTotals = sqlTotalsRead.rows[0];
  const estimatedBytes = Number(transferTotals?.bytes ?? 0);
  const sqlCalls = Number(sqlTotals?.sqlCalls ?? 0);
  const resultBytes = Number(sqlTotals?.resultBytes ?? 0);
  const sqlDuration = Number(sqlTotals?.duration ?? 0);
  const averageSqlMs = sqlCalls ? sqlDuration / sqlCalls : null;
  const lastUpdated = [transferTotals?.updatedAt, sqlTotals?.updatedAt].filter((date): date is Date => date instanceof Date).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const transferRoutes = new Map(transferRoutesRead.rows.map((row) => [row.route, row]));
  const sqlRoutes = new Map(sqlRoutesRead.rows.map((row) => [row.route, row]));
  const routeNames = new Set([...transferRoutes.keys(), ...sqlRoutes.keys()]);
  const routeStats: RouteStat[] = [...routeNames].map((route) => {
    const transfer = transferRoutes.get(route); const sql = sqlRoutes.get(route);
    return { route, transferBytes: Number(transfer?.bytes ?? 0), resources: Number(transfer?.requests ?? 0), sqlCalls: Number(sql?.requests ?? 0), resultBytes: Number(sql?.bytes ?? 0), duration: Number(sql?.duration ?? 0), maxDuration: Number(sql?.maxDuration ?? 0), slow: Number(sql?.slow ?? 0), lastUpdated: [transfer?.updatedAt, sql?.updatedAt].filter((date): date is Date => date instanceof Date).sort((a, b) => b.getTime() - a.getTime())[0] ?? null };
  });
  const sortedRoutes = routeStats.toSorted((left, right) => sort === "sql" ? right.sqlCalls - left.sqlCalls : sort === "result" ? right.resultBytes - left.resultBytes : right.transferBytes - left.transferBytes);
  const expensiveRoute = sortedRoutes[0]?.route ?? null;
  const selectedSql = selectedSqlRead.rows[0];
  const dataError = !sqlTotalsRead.ok || !transferTotalsRead.ok || !chartRead.ok;
  const poolTone = usedPercent === null ? "slate" : usedPercent >= 95 || waiting > 0 ? "rose" : usedPercent >= 80 ? "amber" : "blue";

  return <AdminShell active="Base de données">
    <div className="mx-auto max-w-[1660px] space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Base de données et consommation</h1><p className="mt-1 text-sm leading-6 text-slate-600">Comprenez ce qui est transféré, lu et coûteux.</p></div>
        <DatabaseFilters period={selected.key} aggregation={aggregation} updatedAt={lastUpdated ? relativeTime(lastUpdated) : "Aucune mesure"} />
      </header>

      {dataError && <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"><p className="text-sm font-bold text-amber-900">Certaines données sont indisponibles</p><p className="mt-1 text-xs text-amber-800">Une ou plusieurs requêtes de télémétrie ont échoué. Les sections concernées affichent les mesures qu’elles ont pu charger.</p></div>}

      <section aria-label="Indicateurs principaux" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric icon={Waves} title="Transfert estimé par DivePlan" value={transferTotalsRead.ok && transferTotals ? formatBytes(estimatedBytes) : "Données indisponibles"} detail={`${selected.label} · ressources navigateur agrégées`} source="TransferTelemetryHour · estimation application" tone="blue" freshness={formatDateTime(transferTotals?.updatedAt ?? null)} />
        <Metric icon={Database} title="Mesure fournisseur Supabase" value="Non mesurée" detail="Aucune API de facturation/egress connectée" source="Supabase · source fournisseur absente" tone="violet" freshness="Aucune mesure reçue" />
        <Metric icon={FileText} title="Requêtes SQL" value={sqlTotalsRead.ok ? sqlCalls.toLocaleString("fr-CA") : "Données indisponibles"} detail={selected.label} source="DatabaseEgressTelemetryHour · appels côté application" tone="blue" freshness={formatDateTime(sqlTotals?.updatedAt ?? null)} />
        <Metric icon={Timer} title="Durée SQL p95" value="Non mesurée" detail={averageSqlMs === null ? "Aucune durée SQL agrégée" : `Moyenne disponible : ${formatDuration(averageSqlMs)}`} source="La télémétrie stocke somme et maximum, pas p95" tone="amber" freshness={formatDateTime(sqlTotals?.updatedAt ?? null)} />
        <Metric icon={ShieldAlert} title="Erreurs et timeouts SQL" value="Non mesurés" detail={`${Number(sqlTotals?.slow ?? 0).toLocaleString("fr-CA")} requête(s) ≥ 200 ms`} source="Aucun compteur d’erreurs ou de timeouts" tone="rose" freshness={formatDateTime(sqlTotals?.updatedAt ?? null)} />
      </section>

      <Card className="overflow-hidden">
        <CardContent className="p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><SectionHeading icon={BarChart3} title={`Transfert de données · ${selected.label}`} detail={`${aggregation === "hour" ? "Agrégation horaire" : "Agrégation quotidienne"} · octets estimés côté application`} /><span className="text-[10px] text-slate-500">Mesure fournisseur Supabase : indisponible</span></div>
          {chartRead.rows.length ? <TransferChart rows={chartRead.rows} aggregation={aggregation} /> : <div className="grid h-52 place-items-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-center"><div><CircleHelp className="mx-auto h-6 w-6 text-slate-400" /><p className="mt-2 text-sm font-bold text-slate-700">{chartRead.ok ? "Aucun transfert instrumenté sur cette période" : "Données du graphique indisponibles"}</p><p className="mt-1 text-xs text-slate-500">Les mesures Supabase ne sont pas connectées à cette vue.</p></div></div>}
          <div className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-1 text-[10px] text-slate-600"><Legend color="bg-blue-600" label="Estimation DivePlan · TransferTelemetryHour" /><Legend color="bg-violet-600" label="Supabase · non mesuré" /></div>
          <p className="mt-2 text-center text-[10px] leading-4 text-slate-500">Le volume navigateur agrège les transferts estimés des ressources par route. Il ne mesure ni le trafic facturé par Supabase ni l’egress PostgreSQL. Les deux valeurs ne sont pas additionnées.</p>
        </CardContent>
      </Card>

      <div className="grid items-start gap-4 2xl:grid-cols-[minmax(0,1.25fr)_minmax(390px,0.75fr)]">
        <Card className="overflow-hidden">
          <CardContent className="p-4 sm:p-5">
            <SectionHeading icon={FileText} title="Routes les plus coûteuses" detail="Volume navigateur estimé, avec mesures SQL par route quand elles existent" />
            <div className="overflow-x-auto"><table className="w-full min-w-[830px] text-left text-xs">
              <thead><tr className="border-b border-slate-200 text-slate-500"><th className="py-2 pr-3">Route</th><th className="py-2 pr-3"><SortLink sort="transfer" selected={sort} period={selected.key} aggregation={aggregation} route={selectedRoute}>Volume transféré</SortLink></th><th className="py-2 pr-3"><SortLink sort="sql" selected={sort} period={selected.key} aggregation={aggregation} route={selectedRoute}>Appels SQL</SortLink></th><th className="py-2 pr-3"><SortLink sort="result" selected={sort} period={selected.key} aggregation={aggregation} route={selectedRoute}>Données SQL retournées</SortLink></th><th className="py-2 pr-3">Temps serveur</th><th className="py-2 pr-3">Lectures répétées</th><th className="py-2">Diagnostic</th></tr></thead>
              <tbody>{sortedRoutes.map((row) => {
                const isSelected = selectedRoute === row.route;
                const isLargest = row.route === expensiveRoute && row.transferBytes > 0;
                return <tr key={row.route} className={`border-b border-slate-100 last:border-0 ${isSelected ? "bg-blue-50" : isLargest ? "bg-amber-50/60" : "hover:bg-slate-50"}`}>
                  <td className="max-w-56 py-2.5 pr-3"><Link href={routeUrl({ route: row.route, period: selected.key, aggregation, sort })} aria-current={isSelected ? "true" : undefined} className="font-bold text-slate-800 hover:text-blue-700">{row.route}</Link>{isLargest && <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-900">Plus gros volume observé</span>}</td>
                  <td className="whitespace-nowrap py-2.5 pr-3 font-bold tabular-nums text-blue-800">{row.transferBytes ? formatBytes(row.transferBytes) : "—"}</td>
                  <td className="py-2.5 pr-3 tabular-nums text-slate-700">{row.sqlCalls ? row.sqlCalls.toLocaleString("fr-CA") : "—"}</td>
                  <td className="whitespace-nowrap py-2.5 pr-3 tabular-nums text-slate-700">{row.sqlCalls ? formatBytes(row.resultBytes) : "—"}</td>
                  <td className="whitespace-nowrap py-2.5 pr-3 text-slate-500">Non mesuré{row.sqlCalls ? <span className="block text-[9px]">SQL max {formatDuration(row.maxDuration)}</span> : null}</td>
                  <td className="py-2.5 pr-3 text-slate-500">Non mesuré</td>
                  <td className="py-2.5"><Link href={routeUrl({ route: row.route, period: selected.key, aggregation, sort })} className="inline-flex min-h-8 items-center gap-1 rounded-md border border-blue-200 bg-white px-2 text-[10px] font-bold text-blue-700 hover:bg-blue-50">Analyser <ArrowRight className="h-3 w-3" /></Link></td>
                </tr>;
              })}{!sortedRoutes.length && <tr><td colSpan={7} className="py-9 text-center text-sm text-slate-500">Aucune route mesurée sur cette période.</td></tr>}</tbody>
            </table></div>
            <p className="mt-3 text-[10px] leading-4 text-slate-500">Le transfert est une estimation navigateur par route. « Données SQL retournées » est la taille JSON des lignes reçues par le processus Node, pas le trafic facturé. Temps serveur HTTP, répétitions de lectures et appels N+1 ne sont pas identifiés.</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-5">
            <SectionHeading icon={Database} title="Connexions à la base de données" detail="Pool pg du processus Node qui a rendu cette page" />
            <div className="grid gap-2 sm:grid-cols-2">
              <PoolMetric title="Connexions utilisées" value={poolMax === null ? "Non disponible" : `${poolUsed} / ${poolMax}`} percent={usedPercent} tone={poolTone} detail="Instantané local · non agrégé entre instances" />
              <PoolMetric title="Requêtes en attente" value={waiting.toLocaleString("fr-CA")} percent={null} tone={waiting ? "amber" : "green"} detail="pool.waitingCount · maintenant" />
              <PoolMetric title="Connexions refusées" value="Non mesurées" percent={null} tone="slate" detail="Aucun compteur de refus collecté" />
              <PoolMetric title="Attente moyenne de connexion" value="Non mesurée" percent={null} tone="slate" detail="La durée d’acquisition n’est pas enregistrée" />
            </div>
            {usedPercent !== null && <p className={`mt-3 rounded-lg px-3 py-2 text-[10px] leading-4 ${poolTone === "rose" ? "bg-rose-50 text-rose-800" : poolTone === "amber" ? "bg-amber-50 text-amber-900" : "bg-slate-50 text-slate-600"}`}>{usedPercent >= 95 ? "Seuil préoccupant : au moins 95 % du pool local utilisé." : usedPercent >= 80 ? "Seuil d’attention : au moins 80 % du pool local utilisé." : waiting > 0 ? "Des requêtes attendent actuellement une connexion dans ce processus." : "Utilisation calculée sur l’instantané du pool local; ces seuils sont des repères d’interface, pas des alertes historiques."}</p>}
          </CardContent>
        </Card>
      </div>

      {selectedRoute && <Card id="analyse-route" className="scroll-mt-20 border-blue-200"><CardContent className="p-4 sm:p-5">
        <SectionHeading icon={Gauge} title="Analyse de la route sélectionnée" detail={selectedRoute} href={`/admin/optimisation?period=${optimizerPeriod(selected.key)}`} hrefLabel="Ouvrir Optimisation" />
        {selectedSql ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Summary label="Appels SQL" value={Number(selectedSql.requests).toLocaleString("fr-CA")} /><Summary label="Résultats JSON SQL" value={formatBytes(Number(selectedSql.bytes))} /><Summary label="Durée SQL moyenne" value={Number(selectedSql.requests) ? formatDuration(Number(selectedSql.duration) / Number(selectedSql.requests)) : "Non mesurée"} /><Summary label="Maximum SQL observé" value={`${formatDuration(Number(selectedSql.maxDuration))} · ${Number(selectedSql.slow)} appels ≥ 200 ms`} /></div> : <p className="rounded-lg bg-slate-50 px-3 py-4 text-sm text-slate-600">Aucune mesure SQL n’est attribuée à cette route sur la période. Les données navigateur ne prouvent pas qu’une requête SQL a été exécutée.</p>}
        <p className="mt-3 text-[10px] leading-4 text-slate-500">Cette vue détaille uniquement les agrégats SQL par route déjà collectés. Elle ne conserve pas le texte des requêtes ni leur empreinte normalisée.</p>
      </CardContent></Card>}

      <div className="grid items-start gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card><CardContent className="p-4 sm:p-5">
          <SectionHeading icon={Layers3} title="Requêtes SQL à examiner" detail="pg_stat_statements et traces SQL normalisées non connectés" />
          <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead><tr className="border-b border-slate-200 text-slate-500"><th className="py-2 pr-3">Requête normalisée</th><th className="py-2 pr-3">Temps cumulé</th><th className="py-2 pr-3">Appels</th><th className="py-2 pr-3">p95</th><th className="py-2 pr-3">Lignes lues / retournées</th><th className="py-2">Erreurs · duplication</th></tr></thead><tbody><tr><td colSpan={6} className="py-8 text-center"><CircleHelp className="mx-auto h-5 w-5 text-slate-400" /><p className="mt-2 text-xs font-bold text-slate-700">Données par requête non disponibles</p><p className="mt-1 text-[10px] text-slate-500">La télémétrie actuelle agrège appels et durées par route; elle ne capture ni SQL normalisé, ni p95, ni lignes lues, ni erreurs par requête.</p></td></tr></tbody></table></div>
          <Link href="/admin/optimisation?period=24h" className="mt-2 inline-flex min-h-8 items-center gap-1 text-[10px] font-bold text-blue-700 hover:text-blue-900">Voir les agrégats SQL par route <ArrowRight className="h-3 w-3" /></Link>
        </CardContent></Card>

        <Card><CardContent className="p-4 sm:p-5">
          <SectionHeading icon={Repeat2} title="Efficacité des payloads" detail="Mesures disponibles et limites de l’estimation" />
          <EfficiencyRow icon={Database} label="Résultats SQL sérialisés" value={sqlCalls ? formatBytes(resultBytes) : "Données indisponibles"} detail={sqlCalls ? `${formatBytes(resultBytes / sqlCalls)} en moyenne par appel · DatabaseEgressTelemetryHour` : "Aucune mesure sur la période"} />
          <EfficiencyRow icon={FileText} label="Réponses API moyennes / p95" value="Non mesurées" detail="La taille HTTP des réponses n’est pas collectée." />
          <EfficiencyRow icon={Repeat2} label="Lectures identiques et champs inutilisés" value="Non mesurés" detail="Aucune empreinte de requête ni analyse d’utilisation des champs." />
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] leading-4 text-slate-600">Économies potentielles : non estimées. Aucune méthode d’attribution des champs ou lectures inutilisés n’est instrumentée; aucun gain hypothétique n’est affiché comme économie réalisée.</div>
        </CardContent></Card>
      </div>

      <p className="text-right text-[10px] text-slate-500">Période : {selected.label} · Sources : TransferTelemetryHour (transfert navigateur estimé), DatabaseEgressTelemetryHour (résultats SQL sérialisés et durées), pool pg local · dernière collecte {formatDateTime(lastUpdated)}.</p>
    </div>
  </AdminShell>;
}

async function readQuery<T extends import("pg").QueryResultRow>(sql: string, params: readonly unknown[] = []): Promise<ReadResult<T>> { try { return { rows: (await query<T>(sql, params)).rows, ok: true }; } catch { return { rows: [], ok: false }; } }

function Metric({ icon: Icon, title, value, detail, source, tone, freshness }: { icon: typeof Waves; title: string; value: string; detail: string; source: string; tone: "blue" | "violet" | "amber" | "rose"; freshness: string }) {
  const tones = { blue: "bg-blue-50 text-blue-700", violet: "bg-violet-50 text-violet-700", amber: "bg-amber-50 text-amber-800", rose: "bg-rose-50 text-rose-700" };
  return <Card className="min-w-0 overflow-hidden border-slate-200/80 shadow-sm"><CardContent className="p-3.5 sm:p-4"><div className="flex items-start gap-2.5"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${tones[tone]}`}><Icon className="h-4 w-4" /></span><div className="min-w-0"><h2 className="min-h-8 text-[11px] font-bold leading-4 text-slate-600">{title}</h2><p className="mt-1 break-words text-xl font-black leading-6 tabular-nums text-slate-950">{value}</p></div></div><p className="mt-2 min-h-8 text-[10px] leading-4 text-slate-600">{detail}</p><div className="mt-2 border-t border-slate-100 pt-2"><p className="truncate text-[9px] text-slate-500" title={source}>{source}</p><p className="mt-1 truncate text-[9px] text-slate-400" title={freshness}>Mesure : {freshness}</p></div></CardContent></Card>;
}

function SectionHeading({ icon: Icon, title, detail, href, hrefLabel }: { icon: typeof Database; title: string; detail: string; href?: string; hrefLabel?: string }) { return <div className="mb-3 flex items-center gap-2.5 border-b border-slate-100 pb-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-700"><Icon className="h-4 w-4" /></span><div className="min-w-0 flex-1"><h2 className="text-sm font-black text-slate-950">{title}</h2><p className="mt-1 text-[10px] text-slate-500">{detail}</p></div>{href && <Link href={href} className="inline-flex min-h-8 shrink-0 items-center gap-1 text-[10px] font-bold text-blue-700">{hrefLabel ?? "Détails"}<ArrowRight className="h-3 w-3" /></Link>}</div>; }

function TransferChart({ rows, aggregation }: { rows: ChartRow[]; aggregation: string }) {
  const values = rows.map((row) => ({ bucket: row.bucket, bytes: Number(row.bytes) }));
  const width = 1000, height = 205, left = 52, right = 14, top = 14, bottom = 30;
  const maximum = Math.max(1, ...values.map((row) => row.bytes));
  const x = (index: number) => left + (values.length < 2 ? 0 : index / (values.length - 1) * (width - left - right));
  const y = (value: number) => height - bottom - value / maximum * (height - top - bottom);
  const line = values.map((row, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(row.bytes).toFixed(1)}`).join(" ");
  const area = values.length ? `${line} L${x(values.length - 1)},${height - bottom} L${x(0)},${height - bottom} Z` : "";
  return <div className="overflow-x-auto"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Transfert estimé DivePlan par ${aggregation === "hour" ? "heure" : "jour"}, sur ${values.length} agrégats`} className="h-52 min-w-[650px] w-full">
    <defs><linearGradient id="transfer-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#2563eb" stopOpacity=".20" /><stop offset="100%" stopColor="#2563eb" stopOpacity=".02" /></linearGradient></defs>
    {[0, 1, 2, 3, 4].map((index) => { const value = maximum * (4 - index) / 4; const py = y(value); return <g key={index}><line x1={left} x2={width - right} y1={py} y2={py} stroke="#e7edf4" /><text x={left - 7} y={py + 3} textAnchor="end" fill="#64748b" fontSize="10">{formatBytes(value)}</text></g>; })}
    <path d={area} fill="url(#transfer-area)" /><path d={line} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    {values.map((row, index) => <g key={row.bucket.toISOString()}><title>{`${dateTime(row.bucket)} · estimé ${formatBytes(row.bytes)} · TransferTelemetryHour`}</title><circle cx={x(index)} cy={y(row.bytes)} r="3.5" fill="#2563eb" /></g>)}
    {values.filter((_, index) => index % Math.max(1, Math.ceil(values.length / 8)) === 0).map((row) => <text key={`x-${row.bucket.toISOString()}`} x={x(values.indexOf(row))} y={height - 8} textAnchor="middle" fill="#64748b" fontSize="10">{aggregation === "hour" ? new Intl.DateTimeFormat("fr-CA", { hour: "2-digit", timeZone: "America/Toronto" }).format(row.bucket) : new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short", timeZone: "America/Toronto" }).format(row.bucket)}</text>)}
  </svg></div>;
}

function PoolMetric({ title, value, percent, tone, detail }: { title: string; value: string; percent: number | null; tone: string; detail: string }) {
  const colors: Record<string, string> = { blue: "bg-blue-600", amber: "bg-amber-500", rose: "bg-rose-500", green: "bg-emerald-500", slate: "bg-slate-300" };
  const foreground: Record<string, string> = { blue: "text-blue-700", amber: "text-amber-800", rose: "text-rose-700", green: "text-emerald-700", slate: "text-slate-600" };
  return <div className="rounded-xl border border-slate-200 p-3"><div className="flex items-center justify-between gap-2"><p className="text-[10px] font-bold text-slate-600">{title}</p>{percent !== null && <span className={`text-xs font-black tabular-nums ${foreground[tone]}`}>{Math.round(percent)} %</span>}</div><p className={`mt-1 text-lg font-black tabular-nums ${foreground[tone]}`}>{value}</p>{percent !== null ? <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={`${title} du pool`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}><div className={`h-full rounded-full ${colors[tone]}`} style={{ width: `${percent}%` }} /></div> : <div className="mt-2 h-2 rounded-full bg-slate-100" />}<p className="mt-2 min-h-7 text-[9px] leading-3.5 text-slate-500">{detail}</p></div>;
}

function SortLink({ sort, selected, period, aggregation, route, children }: { sort: string; selected: string; period: string; aggregation: string; route: string | null; children: React.ReactNode }) {
  const icon = selected === sort ? ArrowDown : ArrowDownUp;
  const Icon = icon;
  return <Link href={routeUrl({ period, aggregation, sort, route })} aria-label={`Trier par ${children}`} className={`inline-flex items-center gap-1 hover:text-blue-700 ${selected === sort ? "font-black text-blue-700" : "font-semibold"}`}>{children}<Icon className="h-3 w-3" /></Link>;
}

function Summary({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-[10px] font-semibold text-slate-500">{label}</p><p className="mt-1 break-words text-sm font-black tabular-nums text-slate-900">{value}</p></div>; }
function EfficiencyRow({ icon: Icon, label, value, detail }: { icon: typeof Database; label: string; value: string; detail: string }) { return <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-slate-100 py-2.5 last:border-0"><span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-700"><Icon className="h-4 w-4" /></span><div className="min-w-0"><p className="text-[11px] font-bold text-slate-800">{label}</p><p className="mt-0.5 text-[9px] leading-3.5 text-slate-500">{detail}</p></div><p className="max-w-32 text-right text-xs font-black text-slate-800">{value}</p></div>; }
function Legend({ color, label }: { color: string; label: string }) { return <span className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${color}`} />{label}</span>; }
function routeUrl({ route, period, aggregation, sort }: { route: string | null; period: string; aggregation: string; sort: string }) { const params = new URLSearchParams({ period, aggregation, sort }); if (route) params.set("route", route); return `/admin/base-de-donnees?${params.toString()}#analyse-route`; }
function optimizerPeriod(period: string) { return period === "30d" ? "30d" : period === "7d" ? "7d" : "24h"; }
function formatBytes(bytes: number) { if (bytes < 1024) return `${Math.round(bytes)} o`; const units = ["Ko", "Mo", "Go", "To"]; let value = bytes / 1024; let unit = 0; while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; } return `${value.toLocaleString("fr-CA", { maximumFractionDigits: 1 })} ${units[unit]}`; }
function formatDuration(ms: number) { return `${ms.toLocaleString("fr-CA", { maximumFractionDigits: 1 })} ms`; }
function formatDateTime(date: Date | null) { return date ? dateTime(date) : "aucune mesure"; }
function dateTime(date: Date) { return new Intl.DateTimeFormat("fr-CA", { dateStyle: "short", timeStyle: "short", timeZone: "America/Toronto" }).format(date); }
function relativeTime(date: Date) { const minutes = Math.floor(Math.max(0, Date.now() - date.getTime()) / 60_000); return minutes < 1 ? "à l’instant" : `il y a ${minutes} min`; }
