import Link from "next/link";
import { Activity, ArrowRight, CalendarDays, CircleHelp, Cloud, Database, FileText, KeyRound, Pencil, Server, ShieldAlert, Timer, Upload } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdmin } from "@/lib/current-user";
import { query } from "@/lib/db";
import { getAdminHealth } from "@/lib/admin-health";
import { HealthChecksPanel } from "@/components/admin/health-checks-panel";
import type { HealthState } from "@/lib/admin-health";

export const dynamic = "force-dynamic";

const periods = [
  { key: "6h", hours: 6, label: "6 h" },
  { key: "12h", hours: 12, label: "12 h" },
  { key: "24h", hours: 24, label: "24 h" },
  { key: "72h", hours: 72, label: "3 jours" },
  { key: "7d", hours: 168, label: "7 jours" }
];

type EventSummary = { errors: string; affectedUsers: string; latestError: Date | null; latestAuthEvent: Date | null; logins: string; failedLogins: string };
type TtfbSummary = { samples: string; total: string; maximum: string; updatedAt: Date | null };
type FreshnessRow = { eventAt: Date | null; transferAt: Date | null; performanceAt: Date | null; databaseAt: Date | null };
type ReadResult<T> = { rows: T[]; ok: boolean };

export default async function SanteGeneralePage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  await requireAdmin();
  const health = await getAdminHealth();
  const { period } = await searchParams;
  const selected = periods.find((item) => item.key === period) ?? periods[2];
  let dbAvailable = false;
  try {
    await query<{ ok: number }>("SELECT 1 AS ok");
    dbAvailable = true;
  } catch {
    dbAvailable = false;
  }

  const [eventResult, ttfbResult, freshnessResult] = await Promise.all([
    readQuery<EventSummary>(`SELECT
      count(*) FILTER (WHERE (type ILIKE '%error%' OR type ILIKE '%exception%' OR type = 'system.failure') AND "createdAt" >= $1)::text AS errors,
      count(DISTINCT "userId") FILTER (WHERE (type ILIKE '%error%' OR type ILIKE '%exception%' OR type = 'system.failure') AND "createdAt" >= $1 AND "userId" IS NOT NULL)::text AS "affectedUsers",
      max("createdAt") FILTER (WHERE type ILIKE '%error%' OR type ILIKE '%exception%' OR type = 'system.failure') AS "latestError",
      max("createdAt") FILTER (WHERE type LIKE 'auth.%') AS "latestAuthEvent",
      count(*) FILTER (WHERE type = 'auth.login')::text AS logins,
      count(*) FILTER (WHERE type = 'auth.failed')::text AS "failedLogins"
      FROM "AppEvent" WHERE "createdAt" >= NOW() - ($1::int * INTERVAL '1 hour')`, [selected.hours]),
    readQuery<TtfbSummary>(`SELECT COALESCE(SUM(samples), 0)::text AS samples,
      COALESCE(SUM("totalValue"), 0)::text AS total,
      COALESCE(MAX("maxValue"), 0)::text AS maximum,
      max("updatedAt") AS "updatedAt"
      FROM "PerformanceTelemetryHour" WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour') AND metric = 'TTFB'`, [selected.hours]),
    readQuery<FreshnessRow>(`SELECT
      (SELECT max("createdAt") FROM "AppEvent" WHERE "createdAt" >= NOW() - ($1::int * INTERVAL '1 hour')) AS "eventAt",
      (SELECT max("updatedAt") FROM "TransferTelemetryHour" WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour')) AS "transferAt",
      (SELECT max("updatedAt") FROM "PerformanceTelemetryHour" WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour')) AS "performanceAt",
      (SELECT max("updatedAt") FROM "DatabaseEgressTelemetryHour" WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour')) AS "databaseAt"`, [selected.hours])
  ]);

  const eventData = eventResult.rows[0];
  const errors = Number(eventData?.errors ?? 0);
  const affectedUsers = Number(eventData?.affectedUsers ?? 0);
  const failedLogins = Number(eventData?.failedLogins ?? 0);
  const eventsAvailable = eventResult.ok;
  const ttfb = ttfbResult.rows[0];
  const ttfbSamples = Number(ttfb?.samples ?? 0);
  const ttfbMean = ttfbSamples > 0 ? Number(ttfb?.total ?? 0) / ttfbSamples : null;
  const freshness = freshnessResult.rows[0];
  const lastMeasured = [freshness?.eventAt, freshness?.transferAt, freshness?.performanceAt, freshness?.databaseAt]
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
  const state = health.label;
  const statusTone = health.state === "action_required" ? "red" : health.state === "degraded" ? "amber" : "blue";
  const healthIssue = health.checks.find(check => check.state === "failed" || check.state === "warning");
  const authCheck = health.checks.find(check => check.id === "auth-config")!;
  const sentryCheck = health.checks.find(check => check.id === "sentry")!;

  return <AdminShell active="Santé générale">
    <div className="mx-auto max-w-[1600px]">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Santé générale</h1>
          <p className="mt-1 text-sm leading-6 text-slate-600">État de la plateforme et incidents en temps réel.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-600" title={`Dernière donnée reçue : ${formatDateTime(lastMeasured)}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${lastMeasured ? "bg-emerald-500" : "bg-slate-400"}`} />
            {lastMeasured ? `Donnée ${relativeTime(lastMeasured)}` : "Aucune donnée récente"}
          </span>
          <nav aria-label="Période de santé" className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {periods.map((item) => <Link key={item.key} href={`/admin/sante-generale?period=${item.key}`} aria-current={item.key === selected.key ? "page" : undefined} className={`inline-flex min-h-9 items-center rounded-lg px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] sm:px-3.5 sm:text-sm ${item.key === selected.key ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}>{item.label}</Link>)}
          </nav>
        </div>
      </header>

      <Card className={`mb-4 border ${statusTone === "red" ? "border-rose-300 bg-rose-50/70" : statusTone === "amber" ? "border-amber-300 bg-amber-50/70" : "border-sky-200 bg-sky-50/60"}`}>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:p-5">
          <span className={`grid h-14 w-14 place-items-center rounded-full ${statusTone === "red" ? "bg-rose-500 text-white" : statusTone === "amber" ? "bg-amber-500 text-white" : "bg-sky-600 text-white"}`} aria-hidden="true">
            {statusTone === "blue" ? <CircleHelp className="h-7 w-7" /> : <ShieldAlert className="h-7 w-7" />}
          </span>
          <div className="grid gap-3 md:grid-cols-[minmax(190px,0.45fr)_minmax(0,1fr)] md:items-center">
            <div><p className="text-sm font-bold text-slate-800">État des contrôles disponibles</p><p className={`text-3xl font-black ${statusTone === "red" ? "text-rose-800" : statusTone === "amber" ? "text-amber-900" : "text-sky-900"}`}>{state}</p></div>
            <div className="border-t border-slate-200 pt-3 md:border-l md:border-t-0 md:pl-5 md:pt-0">
              <h2 className="text-sm font-black text-slate-900">{healthIssue ? healthIssue.name : "Les sondes configurées ont répondu"}</h2>
              <p className="mt-1 text-sm leading-5 text-slate-600">{healthIssue?.detail ?? "Les contrôles de configuration et de connectivité disponibles ont répondu. Les parcours de connexion, publication et progression ne sont pas testés de bout en bout."}</p>
              {healthIssue && <Link href={healthIssue.id === "database" ? "/admin/optimisation" : "/admin/monitoring"} className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">Ouvrir le diagnostic <ArrowRight className="h-3.5 w-3.5" /></Link>}
            </div>
          </div>
        </CardContent>
      </Card>

      <HealthChecksPanel checks={health.checks} checkedAt={health.checkedAt}/>

      <section aria-label="État des dépendances" className="mb-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        <DependencyCard icon={Database} name="Base de données" status={dbAvailable ? "Opérationnelle" : "Indisponible"} detail={dbAvailable ? "Sonde SELECT 1 · vérifiée maintenant" : "Sonde SELECT 1 indisponible"} source="Latence non instrumentée · statut en direct" href="/admin/optimisation" tone={dbAvailable ? "green" : "red"} />
        <DependencyCard icon={KeyRound} name="Authentification" status={healthLabel(authCheck.state)} detail={authCheck.detail} source={`Auth.js · ${Number(eventData?.logins ?? 0).toLocaleString("fr-CA")} réussite(s) et ${failedLogins} échec(s) journalisés sur ${selected.label}`} href="/admin/monitoring" tone={healthTone(authCheck.state)} />
        <DependencyCard icon={Cloud} name="Sentry · erreurs serveur" status={healthLabel(sentryCheck.state)} detail={sentryCheck.detail} source="La réception des événements Sentry n’est pas vérifiée" tone={healthTone(sentryCheck.state)} />
      </section>

      <div className="mb-4 grid items-start gap-4 2xl:grid-cols-[1.2fr_0.88fr]">
        <Card className="overflow-hidden">
          <CardContent className="p-4 sm:p-5">
            <div className="mb-3"><h2 className="text-base font-black text-slate-950">Parcours utilisateurs principaux</h2><p className="mt-1 text-xs text-slate-500">Disponibilité, réponse et tendance · {selected.label} · les visites seules ne sont pas des réussites</p></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-xs">
              <thead><tr className="border-b border-slate-200 text-slate-500"><th className="py-2 pr-3 font-semibold">Parcours</th><th className="py-2 pr-3 font-semibold">Statut</th><th className="py-2 pr-3 font-semibold">Disponibilité</th><th className="py-2 pr-3 font-semibold">Temps de réponse</th><th className="py-2 pr-3 font-semibold">Tendance</th><th className="py-2 font-semibold">Événements collectés</th></tr></thead>
              <tbody>
                <JourneyRow icon={KeyRound} name="Connexion" observed={`${Number(eventData?.logins ?? 0)} réussite(s), ${failedLogins} échec(s) journalisé(s)`} href="/admin/monitoring" />
                <JourneyRow icon={CalendarDays} name="Ouverture du calendrier" observed="Aucun événement de résultat" />
                <JourneyRow icon={FileText} name="Consultation d’une séance" observed="Les aperçus sont journalisés; les échecs ne le sont pas" href="/admin/monitoring" />
                <JourneyRow icon={Pencil} name="Saisie des répétitions" observed="Aucun événement de résultat" />
                <JourneyRow icon={Upload} name="Publication d’une séance" observed="Les publications réussies sont journalisées; les échecs ne le sont pas" href="/admin/monitoring" />
              </tbody>
            </table></div>
            <p className="mt-3 text-[11px] leading-4 text-slate-500">Les événements de connexion, d’aperçu et de publication ne contiennent pas de durée ni de résultat d’échec complet. Les taux de disponibilité et tendances de réussite restent donc non mesurés.</p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardContent className="p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3"><div><h2 className="text-base font-black text-slate-950">Incident en cours</h2><p className="mt-1 text-xs text-slate-500">État sur {selected.label}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">Non suivi</span></div>
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
              <CircleHelp className="mx-auto h-6 w-6 text-slate-400" />
              <p className="mt-2 text-sm font-bold text-slate-800">Aucun registre d’incidents actifs connecté</p>
              <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-500">AppEvent conserve des événements historiques, sans état ouvert/résolu ni heure de fin. Il ne permet pas d’affirmer qu’aucun incident n’est actif.</p>
              {errors > 0 && <Link href="/admin/monitoring" className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-700">Voir les {errors} événements d’erreur <ArrowRight className="h-3.5 w-3.5" /></Link>}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mb-4 grid items-stretch gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="overflow-hidden">
          <CardContent className="p-4 sm:p-5">
            <div className="mb-2 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-black text-slate-950">Latence des API</h2><p className="mt-1 text-xs text-slate-500">Médiane et 95e percentile · millisecondes · {selected.label}</p></div><Link href="/admin/observability" className="inline-flex min-h-8 items-center gap-1 text-xs font-bold text-blue-700 hover:text-blue-900">Performance <ArrowRight className="h-3.5 w-3.5" /></Link></div>
            <div role="img" aria-label="Graphique de latence API vide : les percentiles API ne sont pas mesurés" className="relative mt-3 h-48 overflow-hidden rounded-lg border border-slate-100 bg-white">
              <div className="absolute inset-0 flex flex-col justify-between px-10 py-4" aria-hidden="true">{["p95", "", "", "Médiane", ""].map((label, index) => <div key={index} className="relative border-t border-slate-100"><span className="absolute -left-9 -top-2 text-[10px] text-slate-400">{label}</span></div>)}</div>
              <div className="absolute inset-0 grid place-items-center px-8 text-center"><div className="rounded-lg bg-white/95 px-3 py-2"><Timer className="mx-auto h-5 w-5 text-slate-400" /><p className="mt-1 text-xs font-bold text-slate-700">Médiane et p95 API non mesurés</p><p className="mt-1 max-w-sm text-[10px] leading-4 text-slate-500">L’instrumentation actuelle ne collecte pas les durées des requêtes serveur. Les Web Vitals TTFB ({ttfbSamples.toLocaleString("fr-CA")} échantillons) mesurent le navigateur et ne remplacent pas les percentiles API.</p></div></div>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-600" /> p95 · non mesuré</span><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-600" /> Médiane · non mesurée</span><span>Source attendue : instrumentation des routes API</span></div>
            {ttfbMean !== null && <p className="mt-2 rounded-md bg-slate-50 px-2.5 py-2 text-[10px] leading-4 text-slate-600">Mesure complémentaire disponible : TTFB navigateur moyen de {formatDuration(ttfbMean)} sur {ttfbSamples.toLocaleString("fr-CA")} échantillons (PerformanceTelemetryHour, dernière mesure {formatDateTime(ttfb?.updatedAt ?? null)}). Ce n’est ni une latence API, ni une médiane/p95.</p>}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardContent className="p-4 sm:p-5">
            <div className="mb-3"><h2 className="text-base font-black text-slate-950">Répartition des échecs</h2><p className="mt-1 text-xs text-slate-500">Nombre et proportion · {selected.label}</p></div>
            <div className="divide-y divide-slate-100">
              <FailureRow icon={FileText} name="Pages" href="/admin/monitoring" />
              <FailureRow icon={Activity} name="API" href="/admin/monitoring" />
              <FailureRow icon={Pencil} name="Actions" href="/admin/monitoring" />
            </div>
            <p className="mt-3 text-[10px] leading-4 text-slate-500">Les statuts HTTP, les tentatives totales et les échecs par catégorie ne sont pas collectés. {eventsAvailable ? "Les événements AppEvent restent consultables dans le journal." : "Le journal AppEvent est indisponible pour le moment."}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-[10px] text-slate-500">
        <span>Sources : PostgreSQL SELECT 1, AppEvent et PerformanceTelemetryHour · période {selected.label}</span>
        <span>Dernière mesure reçue : {formatDateTime(lastMeasured)} · Vue actualisée {formatDateTime(new Date())}</span>
      </div>
    </div>
  </AdminShell>;
}

async function readQuery<T extends import("pg").QueryResultRow>(sql: string, params: readonly unknown[] = []): Promise<ReadResult<T>> {
  try { return { rows: (await query<T>(sql, params)).rows, ok: true }; } catch { return { rows: [], ok: false }; }
}

function healthLabel(state: HealthState) {
  return { ok: "Répond", warning: "Signal observé", failed: "Échec", unknown: "Non vérifié", not_configured: "Non configuré", disabled: "Désactivé · optionnel" }[state];
}
function healthTone(state: HealthState): "green" | "red" | "amber" | "slate" {
  return state === "ok" ? "green" : state === "failed" ? "red" : state === "warning" ? "amber" : "slate";
}

function DependencyCard({ icon: Icon, name, status, detail, source, href, tone }: { icon: typeof Database; name: string; status: string; detail: string; source: string; href?: string; tone: "green" | "red" | "amber" | "slate" }) {
  const content = <div className="flex min-h-[94px] items-start gap-3 p-3.5 sm:p-4"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tone === "green" ? "bg-emerald-50 text-emerald-700" : tone === "red" ? "bg-rose-50 text-rose-700" : tone === "amber" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-500"}`}><Icon className="h-5 w-5" /></span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><h2 className="truncate text-sm font-black text-slate-900">{name}</h2>{href && <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />}</div><p className={`mt-1 text-xs font-bold ${tone === "green" ? "text-emerald-700" : tone === "red" ? "text-rose-700" : tone === "amber" ? "text-amber-800" : "text-slate-500"}`}>{tone === "green" || tone === "red" || tone === "amber" ? "● " : "○ "}{status}</p><p className="mt-1 truncate text-[10px] text-slate-600">{detail}</p><p className="mt-1 truncate text-[9px] text-slate-400">{source}</p></div></div>;
  return <Card className="overflow-hidden border-slate-200/80 shadow-sm">{href ? <Link href={href} aria-label={`${name} : ${status}. ${detail}`} className="block transition hover:bg-slate-50 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">{content}</Link> : content}</Card>;
}

function JourneyRow({ icon: Icon, name, observed, href }: { icon: typeof Database; name: string; observed: string; href?: string }) {
  return <tr className="border-b border-slate-100 last:border-0"><td className="py-2.5 pr-3"><span className="inline-flex items-center gap-2 font-semibold text-slate-800"><Icon className="h-4 w-4 shrink-0 text-slate-600" />{name}</span></td><td className="py-2.5 pr-3"><span className="inline-flex items-center gap-1.5 text-slate-600"><span className="h-2 w-2 rounded-full bg-slate-400" />Non mesuré</span></td><td className="py-2.5 pr-3 tabular-nums text-slate-500">—</td><td className="py-2.5 pr-3 tabular-nums text-slate-500">—</td><td className="py-2.5 pr-3 text-slate-500">Non disponible</td><td className="max-w-[230px] py-2.5 text-slate-500">{href ? <Link href={href} className="underline decoration-slate-300 underline-offset-2 hover:text-blue-700">{observed}</Link> : observed}</td></tr>;
}

function FailureRow({ icon: Icon, name, href }: { icon: typeof Database; name: string; href: string }) {
  return <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 py-3"><span className="inline-flex items-center gap-2 text-xs font-bold text-slate-800"><Icon className="h-4 w-4 text-slate-500" />{name}</span><span className="text-right text-[11px] text-slate-500">Non mesuré</span><Link href={href} aria-label={`Détails des échecs ${name}`} className="grid h-8 w-8 place-items-center rounded-lg text-blue-700 hover:bg-blue-50"><ArrowRight className="h-4 w-4" /></Link></div>;
}

function formatDuration(ms: number) { return `${ms.toLocaleString("fr-CA", { maximumFractionDigits: 1 })} ms`; }
function formatDateTime(date: Date | null) { return date ? new Intl.DateTimeFormat("fr-CA", { dateStyle: "short", timeStyle: "short", timeZone: "America/Toronto" }).format(date) : "aucune donnée sur la période"; }
function relativeTime(date: Date) { const minutes = Math.floor(Math.max(0, Date.now() - date.getTime()) / 60_000); return minutes < 1 ? "à l’instant" : `il y a ${minutes} min`; }
