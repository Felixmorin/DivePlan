import Link from "@/components/ui/app-link";
import { Activity, ArrowRight, Bell, Check, CircleHelp, Clock3, Database, HeartPulse, LockKeyhole, RotateCw, Server, ShieldAlert, TriangleAlert, Waves, Wifi } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdmin } from "@/lib/current-user";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

const periods = [
  { key: "24h", hours: 24, label: "24 dernières heures" },
  { key: "7d", hours: 168, label: "7 derniers jours" },
  { key: "30d", hours: 720, label: "30 derniers jours" }
];

type OverviewRow = { errors: string; affectedUsers: string; priorErrors: string; logins: string; failedLogins: string; priorFailedLogins: string; lastEventAt: Date | null };
type TransferRow = { route: string; requests: string; bytes: string; priorRequests: string; priorBytes: string; lastObserved: Date | null };
type TtfbRow = { samples: string; average: string; lastObserved: Date | null };
type DbRow = { requests: string; slow: string; averageMs: string; maxMs: string; lastObserved: Date | null };
type RecentRow = { type: string; createdAt: Date };
type HourRow = { hour: Date; errors: string };
type FlowsRow = { previews: string; started: string; completed: string; published: string; logins: string; failedLogins: string };

export default async function SanteAppPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  await requireAdmin();
  const { period } = await searchParams;
  const selected = periods.find((item) => item.key === period) ?? periods[0];
  const from = new Date(Date.now() - selected.hours * 60 * 60 * 1000);
  const dbStarted = performance.now();
  let databaseAvailable = false;
  let databaseLatency: number | null = null;
  try {
    await query<{ ok: number }>("SELECT 1 AS ok");
    databaseAvailable = true;
    databaseLatency = Math.round(performance.now() - dbStarted);
  } catch {
    databaseAvailable = false;
  }

  const [overviewRows, transferRows, ttfbRows, databaseRows, recentRows, hourlyRows, flowRows] = await Promise.all([
    safeQuery<OverviewRow>(`SELECT
      count(*) FILTER (WHERE (type ILIKE '%error%' OR type ILIKE '%exception%' OR type = 'system.failure') AND "createdAt" >= NOW() - ($1::int * INTERVAL '1 hour'))::text AS errors,
      count(DISTINCT "userId") FILTER (WHERE (type ILIKE '%error%' OR type ILIKE '%exception%' OR type = 'system.failure') AND "userId" IS NOT NULL)::text AS "affectedUsers",
      count(*) FILTER (WHERE (type ILIKE '%error%' OR type ILIKE '%exception%' OR type = 'system.failure') AND "createdAt" < NOW() - ($1::int * INTERVAL '1 hour') AND "createdAt" >= NOW() - ($1::int * 2 * INTERVAL '1 hour'))::text AS "priorErrors",
      count(*) FILTER (WHERE type = 'auth.login' AND "createdAt" >= NOW() - ($1::int * INTERVAL '1 hour'))::text AS logins,
      count(*) FILTER (WHERE type = 'auth.failed' AND "createdAt" >= NOW() - ($1::int * INTERVAL '1 hour'))::text AS "failedLogins",
      count(*) FILTER (WHERE type = 'auth.failed' AND "createdAt" < NOW() - ($1::int * INTERVAL '1 hour') AND "createdAt" >= NOW() - ($1::int * 2 * INTERVAL '1 hour'))::text AS "priorFailedLogins",
      max("createdAt") AS "lastEventAt"
      FROM "AppEvent" WHERE "createdAt" >= NOW() - ($1::int * 2 * INTERVAL '1 hour')`, [selected.hours]),
    safeQuery<TransferRow>(`SELECT route,
      COALESCE(SUM(requests) FILTER (WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour')), 0)::text AS requests,
      COALESCE(SUM("transferBytes") FILTER (WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour')), 0)::text AS bytes,
      COALESCE(SUM(requests) FILTER (WHERE hour < NOW() - ($1::int * INTERVAL '1 hour') AND hour >= NOW() - ($1::int * 2 * INTERVAL '1 hour')), 0)::text AS "priorRequests",
      COALESCE(SUM("transferBytes") FILTER (WHERE hour < NOW() - ($1::int * INTERVAL '1 hour') AND hour >= NOW() - ($1::int * 2 * INTERVAL '1 hour')), 0)::text AS "priorBytes",
      max("updatedAt") AS "lastObserved"
      FROM "TransferTelemetryHour" WHERE hour >= NOW() - ($1::int * 2 * INTERVAL '1 hour')
      GROUP BY route ORDER BY SUM("transferBytes") FILTER (WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour')) DESC NULLS LAST LIMIT 100`, [selected.hours]),
    safeQuery<TtfbRow>(`SELECT COALESCE(SUM("totalValue") FILTER (WHERE metric = 'TTFB'), 0)::text AS average,
      COALESCE(SUM(samples) FILTER (WHERE metric = 'TTFB'), 0)::text AS samples, max("updatedAt") AS "lastObserved"
      FROM "PerformanceTelemetryHour" WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour')`, [selected.hours]),
    safeQuery<DbRow>(`SELECT COALESCE(SUM(requests), 0)::text AS requests,
      COALESCE(SUM("slowQueries"), 0)::text AS slow,
      (SUM("durationMs") / NULLIF(SUM(requests), 0))::text AS "averageMs",
      COALESCE(MAX("maxDurationMs"), 0)::text AS "maxMs", max("updatedAt") AS "lastObserved"
      FROM "DatabaseEgressTelemetryHour" WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour') AND component <> 'historical_unclassified'`, [selected.hours]),
    safeQuery<RecentRow>(`SELECT type, "createdAt" FROM "AppEvent"
      WHERE "createdAt" >= NOW() - ($1::int * INTERVAL '1 hour')
        AND (type IN ('auth.failed', 'auth.login', 'session.published', 'session.completed') OR type ILIKE '%error%' OR type ILIKE '%exception%')
      ORDER BY "createdAt" DESC LIMIT 7`, [selected.hours]),
    safeQuery<HourRow>(`SELECT date_trunc('hour', "createdAt") AS hour,
      count(*) FILTER (WHERE type ILIKE '%error%' OR type ILIKE '%exception%' OR type = 'system.failure')::text AS errors
      FROM "AppEvent" WHERE "createdAt" >= NOW() - ($1::int * INTERVAL '1 hour')
      GROUP BY date_trunc('hour', "createdAt") ORDER BY hour`, [selected.hours]),
    safeQuery<FlowsRow>(`SELECT
      count(*) FILTER (WHERE type = 'session.previewed')::text AS previews,
      count(*) FILTER (WHERE type = 'session.started')::text AS started,
      count(*) FILTER (WHERE type = 'session.completed')::text AS completed,
      count(*) FILTER (WHERE type = 'session.published')::text AS published,
      count(*) FILTER (WHERE type = 'auth.login')::text AS logins,
      count(*) FILTER (WHERE type = 'auth.failed')::text AS "failedLogins"
      FROM "AppEvent" WHERE "createdAt" >= $1`, [from])
  ]);

  const overview = overviewRows[0];
  const errors = Number(overview?.errors ?? 0);
  const affectedUsers = Number(overview?.affectedUsers ?? 0);
  const failedLogins = Number(overview?.failedLogins ?? 0);
  const transfers = transferRows.reduce((sum, row) => sum + Number(row.bytes), 0);
  const priorTransfers = transferRows.reduce((sum, row) => sum + Number(row.priorBytes), 0);
  const transferRequests = transferRows.reduce((sum, row) => sum + Number(row.requests), 0);
  const latestTransfer = transferRows.reduce<Date | null>((latest, row) => row.lastObserved && (!latest || row.lastObserved > latest) ? row.lastObserved : latest, null);
  const ttfb = ttfbRows[0];
  const db = databaseRows[0];
  const dbSlow = Number(db?.slow ?? 0);
  const transferChange = priorTransfers > 0 ? Math.round((transfers - priorTransfers) / priorTransfers * 100) : null;
  const transferHotspot = transferChange !== null && transferChange > 0 ? transferRows.find((row) => Number(row.bytes) > Number(row.priorBytes)) : undefined;
  const alerts = [
    ...(errors > 0 ? [{ severity: "Élevée", title: "Erreurs applicatives journalisées", detail: `${errors.toLocaleString("fr-CA")} événement(s) · ${affectedUsers.toLocaleString("fr-CA")} utilisateur(s) identifiables`, href: "/admin/monitoring", hrefLabel: "Ouvrir le journal", tone: "rose" as const }] : []),
    ...(failedLogins > 0 ? [{ severity: "À vérifier", title: "Échecs de connexion", detail: `${failedLogins.toLocaleString("fr-CA")} échec(s) d’authentification consignés`, href: "/admin/monitoring", hrefLabel: "Voir les événements", tone: "amber" as const }] : []),
    ...(transferHotspot ? [{ severity: "Observation", title: "Hausse du transfert mesuré", detail: `${transferChange! > 0 ? `+${transferChange}%` : `${transferChange}%`} vs période précédente · ${Number(transferHotspot.requests).toLocaleString("fr-CA")} requêtes sur ${transferHotspot.route}`, href: "/admin/optimisation", hrefLabel: "Examiner le transfert", tone: "blue" as const }] : []),
    ...(dbSlow > 0 ? [{ severity: "À surveiller", title: "Requêtes SQL lentes", detail: `${dbSlow.toLocaleString("fr-CA")} requête(s) ≥ 200 ms · moyenne ${formatDuration(Number(db?.averageMs ?? 0))}`, href: "/admin/optimisation", hrefLabel: "Examiner la base", tone: "amber" as const }] : [])
  ];
  const unknowns = ["Disponibilité synthétique", "p95 API", "Transfert fournisseur", "Échecs des parcours et des écritures"];
  const isUnavailable = !databaseAvailable;
  const isDegraded = errors > 0 || failedLogins > 0 || dbSlow > 0 || (transferChange !== null && transferChange > 0);
  const state = isUnavailable ? "INDISPONIBLE" : isDegraded ? "DÉGRADÉ" : "SURVEILLANCE PARTIELLE";
  const stateDescription = isUnavailable
    ? "La base de données ne répond pas à la vérification de santé."
    : isDegraded
      ? `${alerts.length + (dbSlow > 0 ? 1 : 0)} signal(aux) observé(s) dans les sources instrumentées. Les parcours ne sont pas testés de bout en bout.`
      : "Aucun signal d’erreur détecté dans les journaux consultés. La disponibilité complète reste à confirmer.";
  const ttfbSamples = Number(ttfb?.samples ?? 0);
  const ttfbAverage = ttfbSamples ? Number(ttfb?.average ?? 0) / ttfbSamples : null;
  const flowData = flowRows[0];
  const loginEvents = Number(flowData?.logins ?? 0) + Number(flowData?.failedLogins ?? 0);
  const loginRate = loginEvents ? Number(flowData?.logins ?? 0) / loginEvents * 100 : null;
  const lastUpdated = new Date();
  const lastData = [overview?.lastEventAt, latestTransfer, ttfb?.lastObserved ?? null, db?.lastObserved ?? null]
    .filter((date): date is Date => Boolean(date)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  return <AdminShell active="Santé App">
    <div className="mx-auto max-w-[1600px]">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold text-slate-500"><Link href="/admin" className="hover:text-blue-700">Admin</Link><span className="mx-2">/</span>Santé App</p>
          <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Santé App</h1>
          <p className="mt-1 text-sm leading-6 text-slate-600">État de la plateforme et éléments à surveiller</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Période de santé" className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {periods.map((item) => <Link key={item.key} href={`/admin/sante-app?period=${item.key}`} aria-current={item.key === selected.key ? "page" : undefined} className={`inline-flex min-h-9 items-center rounded-lg px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] sm:text-sm ${item.key === selected.key ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}>{item.label}</Link>)}
          </nav>
          <span className="inline-flex min-h-10 items-center gap-2 px-2 text-xs font-medium text-slate-500" title={`Dernière donnée observée : ${formatDateTime(lastData)}`}><RotateCw className="h-3.5 w-3.5" /> Actualisé {relativeTime(lastUpdated)}</span>
        </div>
      </header>

      <Card className={`mb-4 overflow-hidden border ${isUnavailable ? "border-rose-200 bg-rose-50/70" : isDegraded ? "border-amber-200 bg-amber-50/65" : "border-blue-200 bg-blue-50/55"}`}>
        <CardContent className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div className="flex items-start gap-3 sm:gap-4">
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${isUnavailable ? "bg-rose-100 text-rose-700" : isDegraded ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700"}`}>
              {isUnavailable ? <TriangleAlert className="h-6 w-6" /> : isDegraded ? <ShieldAlert className="h-6 w-6" /> : <CircleHelp className="h-6 w-6" />}
            </span>
            <div className="min-w-0">
              <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-black tracking-wide ${isUnavailable ? "bg-rose-200 text-rose-900" : isDegraded ? "bg-amber-200 text-amber-900" : "bg-sky-100 text-sky-900"}`}>{state}</span>
              <h2 className="mt-2 text-lg font-black text-slate-950">{isUnavailable ? "La base de données est indisponible" : isDegraded ? `${alerts.length + (dbSlow > 0 ? 1 : 0)} signal(aux) à examiner` : "Aucun incident détecté dans les signaux disponibles"}</h2>
              <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-700">{stateDescription}</p>
              {alerts[0] && <Link href={alerts[0].href} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2">Voir le diagnostic <ArrowRight className="h-4 w-4" /></Link>}
            </div>
          </div>
          <div className="border-t border-slate-200/80 pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <h3 className="mb-3 text-sm font-black text-slate-900">Dépendances principales</h3>
            <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
              <Dependency icon={Server} name="Application" status="Répond" detail="Page admin active" ok />
              <Dependency icon={Database} name="Base de données" status={databaseAvailable ? "Disponible" : "Indisponible"} detail={databaseLatency === null ? "Sonde SELECT 1" : `${databaseLatency} ms · sonde SELECT 1`} ok={databaseAvailable} />
              <Dependency icon={LockKeyhole} name="Authentification" status="Non vérifiée" detail="Aucune sonde dédiée" />
              <Dependency icon={Wifi} name="Stockage" status="Non vérifié" detail="Aucune sonde dédiée" />
            </div>
          </div>
        </CardContent>
      </Card>

      <section aria-label="Indicateurs clés" className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={HeartPulse} title="Disponibilité" value="Non mesurée" detail="Sonde synthétique absente" source="Parcours · non instrumentés" tone="blue" />
        <MetricCard icon={TriangleAlert} title="Erreurs journalisées" value={errors.toLocaleString("fr-CA")} detail={`${affectedUsers.toLocaleString("fr-CA")} utilisateur(s) touché(s) avec identifiant`} source={`AppEvent · ${selected.label.toLowerCase()}`} tone={errors ? "rose" : "green"} change={compare(errors, Number(overview?.priorErrors ?? 0))} />
        <MetricCard icon={Activity} title="API p95" value="Non mesuré" detail={ttfbAverage === null ? "Latence API non instrumentée" : `TTFB navigateur moyen : ${formatDuration(ttfbAverage)}`} source={ttfbSamples ? `Web Vitals · ${ttfbSamples} échantillons` : "Aucun échantillon TTFB"} tone="violet" />
        <MetricCard icon={Database} title="Transfert fournisseur" value="Non mesuré" detail="Aucune source fournisseur connectée" source="Coûts fournisseur · indisponible" tone="slate" />
        <MetricCard icon={Waves} title="Transfert estimé" value={transfers ? formatBytes(transfers) : "Données indisponibles"} detail={`${transferRequests.toLocaleString("fr-CA")} requêtes web mesurées${transferChange !== null ? ` · ${transferChange > 0 ? "+" : ""}${transferChange}% vs période précédente` : ""}`} source={`Instrumentation DivePlan · ${selected.label.toLowerCase()}`} tone="teal" freshness={formatDateTime(latestTransfer)} />
      </section>

      <div className="mb-4 grid items-start gap-4 xl:grid-cols-[1.12fr_0.88fr]">
        <Card className="overflow-hidden">
          <CardContent className="p-4 sm:p-5">
            <SectionHeading icon={Bell} title="À examiner en priorité" detail={`${alerts.length} signal(aux) issu(s) des sources disponibles`} href={alerts.length ? "/admin/monitoring" : undefined} hrefLabel="Ouvrir le journal" />
            {alerts.length ? <div className="divide-y divide-slate-100">{alerts.map((alert) => <div key={alert.title} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="flex min-w-0 items-start gap-3"><span className={`mt-0.5 inline-flex shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase ${alert.tone === "rose" ? "bg-rose-100 text-rose-800" : alert.tone === "amber" ? "bg-amber-100 text-amber-900" : "bg-blue-100 text-blue-800"}`}>{alert.severity}</span><div className="min-w-0"><h3 className="text-sm font-bold text-slate-900">{alert.title}</h3><p className="mt-1 break-words text-xs leading-5 text-slate-500">{alert.detail}</p></div></div>
              <Link href={alert.href} className="inline-flex min-h-9 items-center gap-1 text-xs font-bold text-blue-700 hover:text-blue-900 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">{alert.hrefLabel} <ArrowRight className="h-3.5 w-3.5" /></Link>
            </div>)}</div> : <div className="py-6 text-center"><Check className="mx-auto h-6 w-6 text-emerald-600" /><p className="mt-2 text-sm font-bold text-slate-800">Aucune alerte dans les sources consultées</p><p className="mt-1 text-xs text-slate-500">Cela ne remplace pas une surveillance des exceptions ni des parcours synthétiques.</p></div>}
            {dbSlow > 0 && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{dbSlow.toLocaleString("fr-CA")} requête(s) SQL lentes (&gt; 200 ms) observées · moyenne {formatDuration(Number(db?.averageMs ?? 0))}, maximum {formatDuration(Number(db?.maxMs ?? 0))}. <Link href="/admin/optimisation" className="font-bold underline underline-offset-2">Voir la base de données</Link></p>}
            {!alerts.length && <div className="mt-3 border-t border-slate-100 pt-3"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Signaux non couverts</p><div className="mt-2 flex flex-wrap gap-1.5">{unknowns.map((item) => <span key={item} className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">{item}</span>)}</div></div>}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardContent className="p-4 sm:p-5">
            <SectionHeading icon={Activity} title="Parcours essentiels" detail="Événements explicitement journalisés" />
            <div className="divide-y divide-slate-100">
              <FlowRow name="Connexion" count={loginEvents} rate={loginRate} note="Taux limité aux connexions journalisées" href="/admin/monitoring" />
              <FlowRow name="Ouvrir le calendrier" count={null} note="Aucun événement dédié" />
              <FlowRow name="Consulter une séance" count={Number(flowData?.previews ?? 0)} note="Aperçus journalisés seulement" href="/admin/monitoring" />
              <FlowRow name="Saisir les répétitions" count={null} note="Aucun événement de saisie" />
              <FlowRow name="Publier une séance" count={Number(flowData?.published ?? 0)} note="Publications journalisées" href="/admin/monitoring" />
            </div>
            <p className="mt-3 text-[11px] leading-4 text-slate-500">Les taux de réussite des parcours ne sont pas mesurés. Les nombres affichés comptent les événements enregistrés, pas les visites ni les tentatives échouées.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-4 overflow-hidden">
        <CardContent className="p-4 sm:p-5">
          <SectionHeading icon={Clock3} title="Activité récente" detail="Événements importants, sans données personnelles" href="/admin/monitoring" hrefLabel="Voir toute l’activité" />
          {recentRows.length ? <div className="divide-y divide-slate-100">{recentRows.map((event, index) => <div key={`${event.type}-${event.createdAt.toISOString()}-${index}`} className="grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-3 py-2.5 text-xs">
            <time dateTime={event.createdAt.toISOString()} className="tabular-nums text-slate-500">{formatTime(event.createdAt)}</time><div className="min-w-0"><span className={`mr-2 inline-block h-2 w-2 rounded-full ${event.type === "auth.failed" || event.type.includes("error") ? "bg-rose-500" : "bg-emerald-500"}`} /><span className="font-bold text-slate-800">{eventTitle(event.type)}</span><span className="ml-2 hidden text-slate-500 sm:inline">{eventDescription(event.type)}</span></div><Link href="/admin/monitoring" className="font-bold text-blue-700 hover:text-blue-900">Détails <ArrowRight className="inline h-3 w-3" /></Link>
          </div>)}</div> : <p className="py-6 text-center text-sm text-slate-500">Aucun événement important enregistré sur cette période.</p>}
          <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-4 text-slate-500">Les déploiements ne sont pas reliés à une source dans DivePlan. Les erreurs serveur complètes ne sont pas consignées dans AppEvent.</div>
        </CardContent>
      </Card>

      <nav aria-label="Raccourcis diagnostics" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <Shortcut href="/admin/observability" icon={Activity} title="Performance" detail="Web Vitals et activité mesurée" />
        <Shortcut href="/admin/monitoring" icon={TriangleAlert} title="Erreurs et stabilité" detail="Événements applicatifs disponibles" />
        <Shortcut href="/admin/optimisation" icon={Database} title="Base de données" detail="Transferts SQL et requêtes lentes" />
        <Shortcut href="/admin/observability" icon={Server} title="Déploiements" detail="Historique non connecté · métriques seulement" />
        <Shortcut href="/admin/users" icon={LockKeyhole} title="Sécurité et accès" detail="Comptes, rôles et accès admin" />
        <Shortcut href="/admin/optimisation" icon={Waves} title="Coûts et quotas" detail="Transfert DivePlan · fournisseur non connecté" />
      </nav>
      <p className="mt-3 text-right text-[11px] text-slate-500">Dernière donnée mesurée : {formatDateTime(lastData)} · Actualisation de la page : {formatDateTime(lastUpdated)}</p>
    </div>
  </AdminShell>;
}

async function safeQuery<T extends import("pg").QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  try { return (await query<T>(sql, params)).rows; } catch { return []; }
}

function Dependency({ icon: Icon, name, status, detail, ok }: { icon: typeof Server; name: string; status: string; detail: string; ok?: boolean }) {
  return <div className="flex min-w-0 items-center gap-2.5"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${ok ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{ok ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}</span><div className="min-w-0"><p className="truncate text-xs font-bold text-slate-900">{name} <span className="font-medium text-slate-500">· {status}</span></p><p className="truncate text-[10px] text-slate-500">{detail}</p></div></div>;
}

function MetricCard({ icon: Icon, title, value, detail, source, tone, change, freshness }: { icon: typeof Activity; title: string; value: string; detail: string; source: string; tone: "blue" | "rose" | "green" | "violet" | "slate" | "teal"; change?: string; freshness?: string }) {
  const tones = { blue: "bg-blue-50 text-blue-700", rose: "bg-rose-50 text-rose-700", green: "bg-emerald-50 text-emerald-700", violet: "bg-violet-50 text-violet-700", slate: "bg-slate-100 text-slate-600", teal: "bg-teal-50 text-teal-700" };
  return <Card className="min-w-0 overflow-hidden border-slate-200/80 shadow-sm"><CardContent className="p-3.5 sm:p-4"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h2 className="truncate text-xs font-bold text-slate-600">{title}</h2><p className={`mt-2 truncate text-2xl font-black tracking-tight tabular-nums ${value === "Non mesuré" || value === "Non mesurée" || value === "Données indisponibles" ? "text-slate-500" : "text-slate-950"}`}>{value}</p></div><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${tones[tone]}`}><Icon className="h-4 w-4" /></span></div><p className="mt-1 min-h-8 text-[11px] leading-4 text-slate-600">{detail}</p><div className="mt-2 border-t border-slate-100 pt-2"><p className="truncate text-[10px] font-medium text-slate-500" title={source}>{source}</p>{change && <p className="mt-1 text-[10px] font-bold text-slate-600">{change}</p>}{freshness && <p className="mt-1 truncate text-[10px] text-slate-400" title={freshness}>Mesure : {freshness}</p>}</div></CardContent></Card>;
}

function SectionHeading({ icon: Icon, title, detail, href, hrefLabel }: { icon: typeof Activity; title: string; detail: string; href?: string; hrefLabel?: string }) {
  return <div className="mb-2 flex items-center gap-2.5 border-b border-slate-100 pb-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-700"><Icon className="h-4 w-4" /></span><div className="min-w-0 flex-1"><h2 className="truncate text-sm font-black text-slate-950">{title}</h2><p className="truncate text-[10px] text-slate-500">{detail}</p></div>{href && <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-blue-700 hover:text-blue-900">{hrefLabel ?? "Détails"} <ArrowRight className="h-3 w-3" /></Link>}</div>;
}

function FlowRow({ name, count, rate, note, href }: { name: string; count: number | null; rate?: number | null; note: string; href?: string }) {
  const displayedRate = rate == null ? "—" : `${rate.toLocaleString("fr-CA", { maximumFractionDigits: 1 })} %`;
  return <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 py-2"><div className="min-w-0"><p className="truncate text-xs font-bold text-slate-800">{name}</p><p className="truncate text-[10px] text-slate-500">{note}</p></div><div className="text-right"><p className="text-xs font-black tabular-nums text-slate-800">{displayedRate}</p><p className="text-[10px] text-slate-500">{count === null ? "— événements" : `${count.toLocaleString("fr-CA")} événements`}</p></div>{href ? <Link aria-label={`Détails : ${name}`} href={href} className="grid h-8 w-8 place-items-center rounded-lg text-blue-700 hover:bg-blue-50"><ArrowRight className="h-4 w-4" /></Link> : <span aria-label="Détails non disponibles" className="grid h-8 w-8 place-items-center text-slate-300"><CircleHelp className="h-4 w-4" /></span>}</div>;
}

function Shortcut({ href, icon: Icon, title, detail }: { href: string; icon: typeof Activity; title: string; detail: string }) {
  return <Link href={href} className="group flex min-h-[64px] items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm transition hover:border-blue-300 hover:bg-blue-50/50 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700"><Icon className="h-4.5 w-4.5" /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-black text-slate-900">{title}</span><span className="mt-0.5 block truncate text-[10px] text-slate-500">{detail}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-700" /></Link>;
}

function compare(current: number, previous: number) {
  if (!previous) return current ? "Comparaison indisponible : aucune base sur la période précédente" : "Aucun événement sur les deux périodes";
  const percent = Math.round((current - previous) / previous * 100);
  return `${percent > 0 ? "+" : ""}${percent}% vs période précédente`;
}

function formatBytes(bytes: number) { if (bytes < 1024) return `${Math.round(bytes)} o`; const units = ["Ko", "Mo", "Go", "To"]; let value = bytes / 1024; let unit = 0; while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; } return `${value.toLocaleString("fr-CA", { maximumFractionDigits: 1 })} ${units[unit]}`; }
function formatDuration(ms: number) { return `${ms.toLocaleString("fr-CA", { maximumFractionDigits: 1 })} ms`; }
function formatDateTime(date: Date | null) { return date ? new Intl.DateTimeFormat("fr-CA", { dateStyle: "short", timeStyle: "short", timeZone: "America/Toronto" }).format(date) : "aucune mesure disponible"; }
function formatTime(date: Date) { return new Intl.DateTimeFormat("fr-CA", { hour: "2-digit", minute: "2-digit", timeZone: "America/Toronto" }).format(date); }
function relativeTime(date: Date) { const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000)); return seconds < 60 ? "à l’instant" : `il y a ${Math.floor(seconds / 60)} min`; }
function eventTitle(type: string) { if (type === "auth.failed") return "Échec de connexion"; if (type === "auth.login") return "Connexion enregistrée"; if (type === "session.published") return "Publication d’une séance"; if (type === "session.completed") return "Séance terminée"; return "Événement d’erreur journalisé"; }
function eventDescription(type: string) { if (type === "auth.failed") return "Authentification"; if (type === "auth.login") return "Authentification"; if (type.startsWith("session.")) return "Parcours séance"; return "AppEvent · détail expurgé"; }
