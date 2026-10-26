import Link from "next/link";
import { Activity, ArrowDownUp, ArrowRight, Database, Gauge, Timer } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdmin } from "@/lib/current-user";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

type DatabaseRow = { requests: string; bytes: string; duration: string; maxDuration: string; slow: string; priorRequests: string; priorBytes: string; priorDuration: string };
type TransferRow = { route: string; requests: string; bytes: string; priorRequests: string; priorBytes: string };
type ComponentRow = { component: string; route: string; requests: string; bytes: string; averageMs: string };

const periods = [{ key: "24h", hours: 24, label: "24 h" }, { key: "7d", hours: 168, label: "7 jours" }, { key: "30d", hours: 720, label: "30 jours" }];

export default async function AdminOptimisationPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  await requireAdmin();
  const { period } = await searchParams;
  const selected = periods.find((item) => item.key === period) ?? periods[0];
  const [database, routes, components] = await Promise.all([
    query<DatabaseRow>(`SELECT
      COALESCE(SUM(requests) FILTER (WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour')), 0)::text AS requests,
      COALESCE(SUM("resultBytes") FILTER (WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour')), 0)::text AS bytes,
      COALESCE(SUM("durationMs") FILTER (WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour')), 0)::text AS duration,
      COALESCE(MAX("maxDurationMs") FILTER (WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour')), 0)::text AS "maxDuration",
      COALESCE(SUM("slowQueries") FILTER (WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour')), 0)::text AS slow,
      COALESCE(SUM(requests) FILTER (WHERE hour < NOW() - ($1::int * INTERVAL '1 hour') AND hour >= NOW() - ($1::int * 2 * INTERVAL '1 hour')), 0)::text AS "priorRequests",
      COALESCE(SUM("resultBytes") FILTER (WHERE hour < NOW() - ($1::int * INTERVAL '1 hour') AND hour >= NOW() - ($1::int * 2 * INTERVAL '1 hour')), 0)::text AS "priorBytes",
      COALESCE(SUM("durationMs") FILTER (WHERE hour < NOW() - ($1::int * INTERVAL '1 hour') AND hour >= NOW() - ($1::int * 2 * INTERVAL '1 hour')), 0)::text AS "priorDuration"
      FROM "DatabaseEgressTelemetryHour"
      WHERE hour >= NOW() - ($1::int * 2 * INTERVAL '1 hour')`, [selected.hours]),
    query<TransferRow>(`SELECT route,
      COALESCE(SUM(requests) FILTER (WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour')), 0)::text AS requests,
      COALESCE(SUM("transferBytes") FILTER (WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour')), 0)::text AS bytes,
      COALESCE(SUM(requests) FILTER (WHERE hour < NOW() - ($1::int * INTERVAL '1 hour') AND hour >= NOW() - ($1::int * 2 * INTERVAL '1 hour')), 0)::text AS "priorRequests",
      COALESCE(SUM("transferBytes") FILTER (WHERE hour < NOW() - ($1::int * INTERVAL '1 hour') AND hour >= NOW() - ($1::int * 2 * INTERVAL '1 hour')), 0)::text AS "priorBytes"
      FROM "TransferTelemetryHour"
      WHERE hour >= NOW() - ($1::int * 2 * INTERVAL '1 hour')
      GROUP BY route ORDER BY SUM("transferBytes") FILTER (WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour')) DESC NULLS LAST LIMIT 15`, [selected.hours]),
    query<ComponentRow>(`SELECT component, route, SUM(requests)::text AS requests, SUM("resultBytes")::text AS bytes,
      (SUM("durationMs") / NULLIF(SUM(requests), 0))::text AS "averageMs"
      FROM "DatabaseEgressTelemetryHour" WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour')
      GROUP BY component, route ORDER BY SUM("resultBytes") DESC`, [selected.hours])
  ]);
  const db = database.rows[0];
  const dbRequests = Number(db?.requests ?? 0);
  const dbBytes = Number(db?.bytes ?? 0);
  const dbMs = Number(db?.duration ?? 0);
  const priorDbRequests = Number(db?.priorRequests ?? 0);
  const priorDbBytes = Number(db?.priorBytes ?? 0);
  const priorDbMs = Number(db?.priorDuration ?? 0);
  const currentTransfer = routes.rows.reduce((sum, row) => sum + Number(row.bytes), 0);
  const previousTransfer = routes.rows.reduce((sum, row) => sum + Number(row.priorBytes), 0);
  const currentRequests = routes.rows.reduce((sum, row) => sum + Number(row.requests), 0);
  const previousRequests = routes.rows.reduce((sum, row) => sum + Number(row.priorRequests), 0);

  return <AdminShell active="Optimisation">
    <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Optimisation</h1><p className="mt-1 text-sm leading-6 text-slate-600">Suivez la performance des requêtes SQL et les volumes transférés par DivePlan.</p></div>
      <nav aria-label="Période d’analyse" className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">{periods.map((item) => <Link key={item.key} href={`/admin/optimisation?period=${item.key}`} aria-current={selected.key === item.key ? "page" : undefined} className={`inline-flex min-h-9 items-center rounded-lg px-3.5 text-sm font-bold transition focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${selected.key === item.key ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}>{item.label}</Link>)}</nav>
    </header>

    <section aria-label="Indicateurs de base de données" className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
      <Metric icon={Database} label="Egress PostgreSQL" value={formatBytes(dbBytes)} detail={`${dbRequests.toLocaleString("fr-CA")} requêtes mesurées`} />
      <Metric icon={Timer} label="Latence SQL moyenne" value={dbRequests ? `${(dbMs / dbRequests).toLocaleString("fr-CA", { maximumFractionDigits: 1 })} ms` : "—"} detail="Temps observé par l’application" />
      <Metric icon={Gauge} label="Requête la plus lente" value={`${Number(db?.maxDuration ?? 0).toLocaleString("fr-CA", { maximumFractionDigits: 0 })} ms`} detail="Maximum observé pendant une heure" />
      <Metric icon={Activity} label="Requêtes lentes" value={Number(db?.slow ?? 0).toLocaleString("fr-CA")} detail="Durée SQL supérieure ou égale à 200 ms" />
    </section>

    <section className="mt-4 grid gap-4 xl:grid-cols-2">
      <Card className="overflow-hidden"><CardContent className="p-4 sm:p-5">
        <PanelHeading icon={Database} title="Performance des requêtes SQL" detail={`${selected.label} · comparaison avec la période précédente de même durée`} />
        <div className="grid grid-cols-2 gap-3"><Summary label="Latence moyenne · actuelle" value={dbRequests ? `${(dbMs / dbRequests).toLocaleString("fr-CA", { maximumFractionDigits: 1 })} ms / requête` : "Aucune mesure"} /><Summary label="Latence moyenne · précédente" value={priorDbRequests ? `${(priorDbMs / priorDbRequests).toLocaleString("fr-CA", { maximumFractionDigits: 1 })} ms / requête` : "Aucune mesure"} /><Summary label="Egress PostgreSQL · actuel" value={`${formatBytes(dbBytes)} · ${dbRequests.toLocaleString("fr-CA")} requêtes`} /><Summary label="Egress PostgreSQL · précédent" value={`${formatBytes(priorDbBytes)} · ${priorDbRequests.toLocaleString("fr-CA")} requêtes`} /></div>
        <p className="mt-4 rounded-xl bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-600">La latence mesure le temps côté application, y compris l’attente de connexion, jusqu’à la réponse PostgreSQL. Les mesures commencent après l’application de la migration et le déploiement; les périodes antérieures ne sont pas reconstituées.</p>
      </CardContent></Card>
      <Card className="overflow-hidden"><CardContent className="p-4 sm:p-5">
        <PanelHeading icon={ArrowDownUp} title="Transfert par requête HTTP" detail={`${selected.label} comparé à la période précédente`} />
        <div className="grid grid-cols-2 gap-3"><Summary label="Période actuelle" value={`${formatBytes(currentTransfer)} · ${currentRequests.toLocaleString("fr-CA")} requêtes`} /><Summary label="Période précédente" value={`${formatBytes(previousTransfer)} · ${previousRequests.toLocaleString("fr-CA")} requêtes`} /></div>
        <p className="mt-4 text-xs leading-5 text-slate-600">Moyenne transférée par requête : <strong className="text-slate-900">{formatBytes(currentRequests ? currentTransfer / currentRequests : 0)}</strong> actuellement, contre <strong className="text-slate-900">{formatBytes(previousRequests ? previousTransfer / previousRequests : 0)}</strong> sur la période précédente. Ce ratio aide à distinguer une baisse de consommation d’une simple baisse d’activité.</p>
      </CardContent></Card>
    </section>

    <Card className="mt-4 overflow-hidden"><CardContent className="p-4 sm:p-5">
      <PanelHeading icon={ArrowRight} title="Routes à optimiser" detail="Classées par volume transféré sur la période actuelle" />
      <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead><tr className="text-xs text-slate-500"><th className="py-2 pr-4 font-semibold">Route</th><th className="py-2 pr-4 text-right font-semibold">Requêtes</th><th className="py-2 pr-4 text-right font-semibold">Transfert</th><th className="py-2 text-right font-semibold">Par requête</th></tr></thead><tbody>{routes.rows.map((row) => <tr key={row.route} className="border-t border-slate-100"><td className="max-w-[340px] truncate py-3 pr-4 font-medium text-slate-800" title={row.route}>{row.route}</td><td className="py-3 pr-4 text-right tabular-nums text-slate-600">{Number(row.requests).toLocaleString("fr-CA")}</td><td className="py-3 pr-4 text-right tabular-nums text-slate-600">{formatBytes(Number(row.bytes))}</td><td className="py-3 text-right tabular-nums font-semibold text-slate-900">{formatBytes(Number(row.requests) ? Number(row.bytes) / Number(row.requests) : 0)}</td></tr>)}{!routes.rows.length && <tr><td colSpan={4} className="py-8 text-center text-sm text-slate-500">Aucune mesure de transfert pour ces périodes. La collecte commencera lorsque le trafic instrumenté sera observé.</td></tr>}</tbody></table></div>
      <p className="mt-3 text-xs text-slate-500">Le transfert HTTP est ventilé par route. Ces mesures ne représentent pas le FOT facturé par Vercel.</p>
    </CardContent></Card>
    <Card className="mt-4 overflow-hidden"><CardContent className="p-4 sm:p-5">
      <PanelHeading icon={Database} title="Egress SQL par composant et route" detail={`${selected.label} · mesures depuis la migration 0023`} />
      <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr className="text-xs text-slate-500"><th className="py-2 pr-4">Composant</th><th className="py-2 pr-4">Route</th><th className="py-2 pr-4 text-right">Requêtes</th><th className="py-2 pr-4 text-right">Résultats SQL</th><th className="py-2 text-right">Latence moyenne</th></tr></thead><tbody>{components.rows.map((row) => <tr key={`${row.component}-${row.route}`} className="border-t border-slate-100"><td className="py-3 pr-4 font-semibold">{componentLabel(row.component)}</td><td className="max-w-[300px] truncate py-3 pr-4" title={row.route}>{row.route}</td><td className="py-3 pr-4 text-right tabular-nums">{Number(row.requests).toLocaleString("fr-CA")}</td><td className="py-3 pr-4 text-right tabular-nums">{formatBytes(Number(row.bytes))}</td><td className="py-3 text-right tabular-nums">{Number(row.averageMs).toLocaleString("fr-CA", { maximumFractionDigits: 1 })} ms</td></tr>)}{!components.rows.length && <tr><td colSpan={5} className="py-8 text-center text-sm text-slate-500">Aucune mesure SQL par composant pour cette période.</td></tr>}</tbody></table></div>
      <p className="mt-3 text-xs leading-5 text-slate-500">L’authentification inclut les résultats des recherches d’utilisateur rattaché à un club. Le chargement initial regroupe les requêtes de la liste coach et de l’accueil athlète. Les anciennes lignes restent classées « Autres requêtes ». Les octets correspondent à la taille JSON des lignes PostgreSQL, pas au trafic réseau facturé.</p>
    </CardContent></Card>
  </AdminShell>;
}

function Metric({ icon: Icon, label, value, detail }: { icon: typeof Activity; label: string; value: string; detail: string }) {
  return <Card className="min-h-[108px] border-slate-200/80 shadow-sm"><CardContent className="flex items-center gap-3 p-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-100 text-blue-700"><Icon className="h-5 w-5" /></span><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-600">{label}</p><p className="mt-0.5 truncate text-2xl font-black tabular-nums text-slate-950">{value}</p><p className="mt-0.5 truncate text-[11px] text-slate-500">{detail}</p></div></CardContent></Card>;
}
function PanelHeading({ icon: Icon, title, detail }: { icon: typeof Activity; title: string; detail: string }) { return <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-100 pb-3"><div><h2 className="font-black text-slate-950">{title}</h2><p className="mt-1 text-xs text-slate-500">{detail}</p></div><Icon className="h-5 w-5 shrink-0 text-slate-600" /></div>; }
function Summary({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-slate-200 p-3"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-1 text-sm font-bold tabular-nums text-slate-900">{value}</p></div>; }
function componentLabel(component: string) { return ({ authentication: "Authentification", initial_session_load: "Chargement initial", other: "Autres requêtes" } as Record<string, string>)[component] ?? component; }
function formatBytes(bytes: number) { if (bytes < 1024) return `${Math.round(bytes)} o`; const units = ["Ko", "Mo", "Go"]; let value = bytes / 1024; let unit = 0; while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; } return `${value.toLocaleString("fr-CA", { maximumFractionDigits: 1 })} ${units[unit]}`; }
