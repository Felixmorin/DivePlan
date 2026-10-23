import Link from "next/link";
import { Activity, ArrowDownUp, Database, ShieldAlert, Zap, CircleCheck, Clock3, LockKeyhole, FileText, Gauge } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdmin } from "@/lib/current-user";
import { query } from "@/lib/db";
import { formatMontrealDate } from "@/lib/timezone";

export const dynamic = "force-dynamic";

type RouteRow = { route: string; requests: string; bytes: string; totalRequests: string; totalBytes: string };
type VitalsRow = { route: string; metric: string; average: string; samples: string };
type EventRow = { type: string; clubName: string | null; createdAt: Date };

export default async function AdminObservabilityPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  await requireAdmin();
  const { period } = await searchParams;
  const hours = period === "72h" ? 72 : period === "7d" ? 168 : 24;
  const [transfer, database, vitals, eventCounts, recentEvents] = await Promise.all([
    query<RouteRow>(`SELECT route, SUM(requests)::text AS requests, SUM("transferBytes")::text AS bytes, SUM(SUM(requests)) OVER ()::text AS "totalRequests", SUM(SUM("transferBytes")) OVER ()::text AS "totalBytes" FROM "TransferTelemetryHour" WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour') GROUP BY route ORDER BY SUM("transferBytes") DESC LIMIT 30`, [hours]),
    query<{ requests: string; bytes: string }>(`SELECT COALESCE(SUM(requests), 0)::text AS requests, COALESCE(SUM("resultBytes"), 0)::text AS bytes FROM "DatabaseEgressTelemetryHour" WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour')`, [hours]),
    query<VitalsRow>(`SELECT route, metric, (SUM("ratedTotalValue") / NULLIF(SUM("ratedSamples"), 0))::text AS average, SUM("ratedSamples")::text AS samples FROM "PerformanceTelemetryHour" WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour') GROUP BY route, metric ORDER BY SUM("ratedSamples") DESC LIMIT 20`, [hours]),
    query<{ failedLogins: string; total: string }>(`SELECT count(*) FILTER (WHERE type = 'auth.failed')::text AS "failedLogins", count(*)::text AS total FROM "AppEvent" WHERE "createdAt" >= NOW() - ($1::int * INTERVAL '1 hour')`, [hours]),
    query<EventRow>(`SELECT e.type, c.name AS "clubName", e."createdAt" FROM "AppEvent" e LEFT JOIN "Club" c ON c.id = e."clubId" ORDER BY e."createdAt" DESC LIMIT 30`)
  ]);
  const transferBytes = Number(transfer.rows[0]?.totalBytes ?? 0);
  const failedLogins = Number(eventCounts.rows[0]?.failedLogins ?? 0);
  const totalRequests = Number(transfer.rows[0]?.totalRequests ?? 0);
  const eventsTotal = Number(eventCounts.rows[0]?.total ?? 0);
  return <AdminShell active="Observabilité">
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Plateforme · Santé technique</p><h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Observabilité</h1><p className="mt-2 text-base leading-6 text-slate-600">Surveillez les performances, les transferts et l’activité de DivePlan.</p></div>
      <nav aria-label="Période d’observation" className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">{[["24h", "24 h"], ["72h", "3 jours"], ["7d", "7 jours"]].map(([key, label]) => {
        const active = (key === "24h" && hours === 24) || (key === "72h" && hours === 72) || (key === "7d" && hours === 168);
        return <Link key={key} href={`/admin/observability?period=${key}`} aria-current={active ? "page" : undefined} className={`inline-flex min-h-9 items-center rounded-lg px-3.5 text-sm font-bold transition focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${active ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}>{label}</Link>;
      })}</nav>
    </header>

    <section aria-label="Indicateurs techniques" className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
      <Metric icon={ArrowDownUp} value={formatBytes(transferBytes)} label="Transferts observés" detail={`${Number(transfer.rows[0]?.totalRequests ?? 0).toLocaleString("fr-CA")} requêtes`} tone="blue" />
      <Metric icon={Database} value={formatBytes(Number(database.rows[0]?.bytes ?? 0))} label="Résultats PostgreSQL" detail={`${Number(database.rows[0]?.requests ?? 0).toLocaleString("fr-CA")} requêtes`} tone="violet" />
      <Metric icon={Activity} value={Number(eventCounts.rows[0]?.total ?? 0).toLocaleString("fr-CA")} label="Événements applicatifs" detail="Journal sur la période" tone="green" />
      <Metric icon={ShieldAlert} value={failedLogins.toLocaleString("fr-CA")} label="Échecs de connexion" detail="Événements auth.failed" tone="amber" />
    </section>

    <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Routes observées">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 sm:px-6"><div><h2 className="text-lg font-black text-slate-950">Routes observées</h2><p className="mt-1 text-sm text-slate-500">Volume de transfert agrégé par route · {periodLabel(hours)}</p></div><span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">{transfer.rows.length} routes</span></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-slate-50/90"><tr>{["Route", "Requêtes", "Données transférées", "Moyenne / requête"].map((h) => <th key={h} className="px-5 py-3 text-xs font-bold text-slate-600">{h}</th>)}</tr></thead><tbody>{transfer.rows.length ? transfer.rows.map((row, index) => <tr key={row.route} className={`border-t border-slate-100 ${index === 0 ? "bg-blue-50/80" : "hover:bg-slate-50/70"}`}><td className="px-5 py-3.5 font-bold text-slate-900">{row.route}</td><td className="px-5 py-3.5 tabular-nums text-slate-700">{Number(row.requests).toLocaleString("fr-CA")}</td><td className="px-5 py-3.5 font-medium text-slate-700">{formatBytes(Number(row.bytes))}</td><td className="px-5 py-3.5 text-slate-700">{formatBytes(Number(row.requests) ? Number(row.bytes) / Number(row.requests) : 0)}</td></tr>) : <tr><td colSpan={4} className="px-5 py-10 text-center text-sm text-slate-500">Aucune donnée de transfert sur cette période.</td></tr>}</tbody></table></div>
    </section>

    <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-label="Détails de l’observabilité">
      <div className="flex flex-wrap items-center gap-4 border-b border-slate-200 pb-5"><span className="grid h-14 w-14 place-items-center rounded-2xl bg-blue-100 text-blue-700"><Activity className="h-7 w-7" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-black text-slate-950">Santé de la plateforme</h2><span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800"><CircleCheck className="h-3.5 w-3.5" /> Données agrégées</span></div><p className="mt-1 text-sm text-slate-600">Les indicateurs disponibles pour l’ensemble des clubs sont regroupés ici.</p></div></div>
      <div className="grid gap-6 pt-5 lg:grid-cols-2"><div className="space-y-5"><div><h3 className="text-sm font-black text-slate-900">Périmètre de mesure</h3><p className="mt-2 text-sm leading-6 text-slate-600">Suivi des transferts par route, de la taille des résultats PostgreSQL, des Web Vitals et des événements applicatifs. Fenêtre analysée : {periodLabel(hours)}.</p></div><div className="border-t border-slate-100 pt-4"><h3 className="text-sm font-black text-slate-900">Résumé de la période</h3><div className="mt-3 space-y-2.5 text-sm text-slate-600"><SummaryLine icon={ArrowDownUp} label="Requêtes suivies" value={totalRequests.toLocaleString("fr-CA")} /><SummaryLine icon={Zap} label="Événements enregistrés" value={eventsTotal.toLocaleString("fr-CA")} /><SummaryLine icon={Clock3} label="Période" value={periodLabel(hours)} /></div></div></div>
        <div className="space-y-3"><InfoPanel icon={Gauge} title="Web Vitals" text={vitals.rows.length ? `${vitals.rows.length} mesures agrégées par route. Les moyennes et volumes d’échantillons sont détaillés ci-dessous.` : "Aucun échantillon Web Vitals disponible pour la période."} /><InfoPanel icon={LockKeyhole} title="Journal et sécurité" text={`${failedLogins.toLocaleString("fr-CA")} échec(s) de connexion parmi les événements récents. Les événements restent consultables dans le journal ci-dessous.`} /><InfoPanel icon={Database} title="Limites des données" text="Les volumes PostgreSQL représentent la taille estimée des résultats suivis. Le polling coach n’est pas instrumenté; les percentiles SQL et le FOT Vercel facturé ne sont pas disponibles." /></div>
      </div>
    </section>

    <section className="mt-5 grid items-start gap-4 xl:grid-cols-2">
      <Card className="overflow-hidden"><CardContent className="p-5 sm:p-6"><PanelHeading title="Web Vitals par route" detail="Moyennes et nombre d’échantillons" icon={Activity} /><DataTable headers={["Route", "Mesure", "Moyenne", "Échantillons"]} rows={vitals.rows.map((row) => [row.route, row.metric, formatMetric(row.metric, Number(row.average)), Number(row.samples).toLocaleString("fr-CA")])} empty="Aucune mesure Web Vitals sur cette période." /></CardContent></Card>
      <Card className="overflow-hidden"><CardContent className="p-5 sm:p-6"><PanelHeading title="Événements récents" detail="Dernières activités enregistrées dans DivePlan" icon={FileText} /><DataTable headers={["Type", "Club", "Heure locale"]} rows={recentEvents.rows.map((event) => [event.type, event.clubName ?? "Système", formatMontrealDate(event.createdAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })])} empty="Aucun événement enregistré." /></CardContent></Card>
    </section>
  </AdminShell>;
}

function Metric({ icon: Icon, value, label, detail, tone }: { icon: typeof Activity; value: string; label: string; detail: string; tone: "blue" | "violet" | "green" | "amber" }) {
  const tones = { blue: "bg-blue-100 text-blue-700", violet: "bg-violet-100 text-violet-700", green: "bg-emerald-100 text-emerald-700", amber: "bg-amber-100 text-amber-800" };
  return <Card className="min-h-[106px] border-slate-200/80 shadow-sm"><CardContent className="flex items-center gap-3 p-4"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tones[tone]}`}><Icon className="h-5 w-5" /></span><div className="min-w-0"><p className="truncate text-[11px] font-bold text-slate-600">{label}</p><p className="mt-0.5 truncate text-xl font-black tabular-nums text-slate-900">{value}</p><p className="mt-0.5 truncate text-[11px] text-slate-500">{detail}</p></div></CardContent></Card>;
}

function PanelHeading({ title, detail, icon: Icon }: { title: string; detail: string; icon: typeof Activity }) {
  return <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-100 pb-3"><div><h2 className="font-black">{title}</h2><p className="mt-1 text-xs text-slate-500">{detail}</p></div><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-700"><Icon className="h-4 w-4" /></span></div>;
}

function InfoPanel({ icon: Icon, title, text }: { icon: typeof Activity; title: string; text: string }) { return <div className="rounded-xl border border-slate-200 p-4"><div className="flex items-start gap-3"><Icon className="mt-0.5 h-5 w-5 shrink-0 text-slate-800" /><div><h3 className="text-sm font-bold text-slate-900">{title}</h3><p className="mt-1 text-sm leading-5 text-slate-600">{text}</p></div></div></div>; }
function SummaryLine({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) { return <div className="flex items-center gap-2"><Icon className="h-4 w-4 text-slate-500" /><span className="flex-1">{label}</span><strong className="text-slate-900">{value}</strong></div>; }

function DataTable({ headers, rows, empty }: { headers: string[]; rows: string[][]; empty: string }) {
  return rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[440px] text-left text-sm"><thead className="bg-slate-50"><tr>{headers.map((header) => <th key={header} className="whitespace-nowrap border-b border-slate-100 px-3 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row[0]}-${index}`} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">{row.map((cell, cellIndex) => <td key={cellIndex} className={`max-w-64 px-3 py-2.5 text-xs ${cellIndex === 0 ? "font-semibold text-slate-800" : "text-slate-600"}`}><span className="block truncate">{cell}</span></td>)}</tr>)}</tbody></table></div> : <p className="py-8 text-center text-sm text-slate-500">{empty}</p>;
}

function formatBytes(bytes: number) { if (bytes < 1024) return `${Math.round(bytes)} o`; const units = ["Ko", "Mo", "Go"]; let value = bytes / 1024; let unit = 0; while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; } return `${value.toLocaleString("fr-CA", { maximumFractionDigits: 1 })} ${units[unit]}`; }
function formatMetric(metric: string, value: number) { return metric === "CLS" ? value.toLocaleString("fr-CA", { maximumFractionDigits: 3 }) : `${Math.round(value).toLocaleString("fr-CA")} ms`; }
function periodLabel(hours: number) { return hours === 24 ? "24 dernières heures" : hours === 72 ? "3 derniers jours" : "7 derniers jours"; }
