import Link from "@/components/ui/app-link";
import { Activity, ArrowDownUp, Bell, Database, Gauge, Info, TrendingUp } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdmin } from "@/lib/current-user";
import { query } from "@/lib/db";
import { CostsDashboard, CostsChart, RouteTable, AlertConfig, type ChartPoint, type RouteMetric } from "./costs-dashboard";

export const dynamic = "force-dynamic";
type DailyRow = { day: string; transfer: string; sql: string; sqlRequests: string; transferAt: Date | null; sqlAt: Date | null };

export default async function AdminObservabilityPage({ searchParams }: { searchParams: Promise<{ period?: string; aggregation?: string }> }) {
  await requireAdmin();
  const params = await searchParams;
  const period = ["7d", "30d", "90d"].includes(params.period ?? "") ? params.period! : "30d";
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
  let data: DailyRow[] = [];
  let routes: RouteMetric[] = [];
  let failed = false;
  try {
    const [daily, routeRows] = await Promise.all([
      query<DailyRow>(`SELECT to_char(d.day, 'MM-DD') AS day, COALESCE(t.bytes,0)::text AS transfer, COALESCE(s.bytes,0)::text AS sql, COALESCE(s.requests,0)::text AS "sqlRequests", t.updated AS "transferAt", s.updated AS "sqlAt" FROM generate_series(current_date - ($1::int - 1), current_date, interval '1 day') d(day) LEFT JOIN LATERAL (SELECT sum("transferBytes") bytes, max("updatedAt") updated FROM "TransferTelemetryHour" WHERE hour >= d.day AND hour < d.day + interval '1 day') t ON true LEFT JOIN LATERAL (SELECT sum("resultBytes") bytes, sum(requests) requests, max("updatedAt") updated FROM "DatabaseEgressTelemetryHour" WHERE hour >= d.day AND hour < d.day + interval '1 day') s ON true ORDER BY d.day`, [days]),
      query<RouteMetric>(`SELECT route, sum(requests)::text AS requests, sum("transferBytes")::text AS bytes, max("updatedAt") AS updated FROM "TransferTelemetryHour" WHERE hour >= NOW() - ($1::int * INTERVAL '1 day') GROUP BY route ORDER BY sum("transferBytes") DESC LIMIT 10`, [days])
    ]);
    data = daily.rows; routes = routeRows.rows;
  } catch (error) { console.error("Costs dashboard telemetry unavailable", error); failed = true; }
  const points: ChartPoint[] = data.map((row) => ({ day: row.day.slice(5), transfer: Number(row.transfer), sql: Number(row.sql), transferAt: row.transferAt?.toISOString() ?? null, sqlAt: row.sqlAt?.toISOString() ?? null }));
  const sumTransfer = points.reduce((sum, point) => sum + point.transfer, 0);
  const sumSql = points.reduce((sum, point) => sum + point.sql, 0);
  const sumSqlRequests = data.reduce((sum, row) => sum + Number(row.sqlRequests), 0);
  const latestTransfer = data.map((row) => row.transferAt).filter((date): date is Date => date instanceof Date).sort((a,b) => b.getTime()-a.getTime())[0] ?? null;
  const latestSql = data.map((row) => row.sqlAt).filter((date): date is Date => date instanceof Date).sort((a,b) => b.getTime()-a.getTime())[0] ?? null;
  return <AdminShell active="Coûts et quotas">
    <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div><p className="mb-1 text-xs font-semibold text-slate-500"><Link href="/admin">Admin</Link> / <Link href="/admin/observability">Observabilité</Link> / <span className="text-slate-800">Coûts et quotas</span></p><h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Coûts et quotas</h1><p className="mt-1 text-sm text-slate-600">Suivez la consommation, les limites et les tendances par service.</p></div>
      <CostsDashboard period={period} aggregation={params.aggregation === "week" || params.aggregation === "month" ? params.aggregation : "day"} />
    </header>
    <div className="mb-3 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950"><Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600"/><div><strong>Estimation application ≠ mesure fournisseur</strong><p className="mt-1 text-blue-900">Les octets transférés sont une télémétrie navigateur DivePlan; les résultats SQL sont mesurés par l’instrumentation applicative. Ni l’un ni l’autre ne représente les métriques facturées par Supabase. Aucune source fournisseur ni coût monétaire n’est configuré.</p></div></div>
    {failed && <p role="alert" className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">Données indisponibles. Vérifiez la base de données puis actualisez la page.</p>}
    <section aria-label="Consommation mesurée" className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
      <Metric icon={ArrowDownUp} title="Transfert estimé DivePlan" value={formatBytes(sumTransfer)} source="Instrumentation navigateur" freshness={latestTransfer}/>
      <Metric icon={Database} title="Résultats SQL transférés" value={formatBytes(sumSql)} source="Instrumentation SQL · octets de résultats" freshness={latestSql}/>
      <Metric icon={Database} title="Requêtes de base de données" value={sumSqlRequests.toLocaleString("fr-CA")} source="DatabaseEgressTelemetryHour · total de requêtes" freshness={latestSql}/>\n      <Metric icon={Gauge} title="Transfert fournisseur" value="Non mesuré" source="Aucune connexion aux statistiques fournisseur" freshness={null}/>
      <Metric icon={Database} title="Stockage et quotas" value="Non mesurés" source="Limites et consommation fournisseur indisponibles" freshness={null}/>
    </section>
    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,.9fr)]">
      <Card><CardContent className="p-4 sm:p-5"><div className="mb-3 flex items-center gap-2"><TrendingUp className="h-5 w-5 text-blue-600"/><div><h2 className="font-black text-slate-950">Consommation quotidienne</h2><p className="text-xs text-slate-500">Octets observés · {period === "7d" ? "7" : period === "90d" ? "90" : "30"} derniers jours</p></div></div><CostsChart points={points} aggregation={params.aggregation === "week" || params.aggregation === "month" ? params.aggregation : "day"}/></CardContent></Card>
      <Card><CardContent className="p-4 sm:p-5"><h2 className="flex items-center gap-2 font-black text-slate-950"><Gauge className="h-5 w-5 text-blue-600"/>Quotas et prévisions</h2><p className="mt-1 text-sm text-slate-600">Les limites, dates de renouvellement et projections fournisseur ne sont pas disponibles dans les sources configurées.</p><div className="mt-4 divide-y divide-slate-100">{["Transfert fournisseur", "Stockage", "Fonctions", "Requêtes de base de données"].map((name)=><div key={name} className="flex items-center justify-between gap-2 py-3 text-sm"><span>{name}<span className="block text-xs text-slate-500">Limite · renouvellement · source fournisseur</span></span><b className="shrink-0 text-slate-500">Non mesuré</b></div>)}</div><p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">Une projection fiable nécessite un quota fournisseur et un historique de consommation correspondant.</p></CardContent></Card>
    </div>
    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,.9fr)]">
      <Card><CardContent className="p-4 sm:p-5"><h2 className="flex items-center gap-2 font-black text-slate-950"><Activity className="h-5 w-5 text-blue-600"/>Principales hausses — routes et fonctionnalités</h2><p className="mt-1 text-xs text-slate-500">Classement par volume estimé de transfert, sans comparaison de période de référence.</p><RouteTable routes={routes}/></CardContent></Card>
      <Card><CardContent id="alert-panel" className="p-4 sm:p-5"><h2 className="flex items-center gap-2 font-black text-slate-950"><Bell className="h-5 w-5 text-blue-600"/>Alertes de consommation</h2><p className="mt-2 text-sm text-slate-600">Aucune règle persistante configurée. Le projet ne dispose pas de stockage pour des règles d’alerte ou d’historique d’envoi.</p><AlertConfig/><p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">Historique des alertes : données indisponibles.</p></CardContent></Card>
    </div>
    <p className="mt-3 text-xs text-slate-500">Source: TransferTelemetryHour et DatabaseEgressTelemetryHour. Agrégats stockés par heure; l’historique est limité à la période de collecte.</p>
  </AdminShell>;
}
function Metric({ icon: Icon, title, value, source, freshness }: { icon: typeof Activity; title: string; value: string; source: string; freshness: Date | null }) { return <Card><CardContent className="p-4"><div className="flex items-start gap-3"><span className="rounded-lg bg-blue-50 p-2 text-blue-600"><Icon className="h-5 w-5"/></span><div className="min-w-0"><h2 className="text-sm font-bold text-slate-800">{title}</h2><p className="mt-2 text-2xl font-black tabular-nums text-slate-950">{value}</p><p className="mt-1 text-xs text-slate-600">Période sélectionnée</p><p className="mt-2 text-xs text-slate-500">{source}</p><p className="mt-1 text-xs text-slate-500">{freshness ? `Mis à jour ${new Intl.RelativeTimeFormat("fr-CA", {numeric:"auto"}).format(-Math.max(0, Math.round((Date.now()-freshness.getTime())/60000)), "minute")}` : "Fraîcheur : non disponible"}</p></div></div></CardContent></Card>; }
function formatBytes(bytes: number) { if (!bytes) return "0 octet"; const units = ["octets", "Ko", "Mo", "Go", "To"]; const i = Math.min(units.length-1, Math.floor(Math.log(bytes)/Math.log(1024))); return `${(bytes/1024**i).toLocaleString("fr-CA", {maximumFractionDigits:1})} ${units[i]}`; }








