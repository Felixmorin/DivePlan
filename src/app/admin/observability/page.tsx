import Link from "next/link";
import { Activity, ArrowDownUp, Database, ShieldAlert, Zap } from "lucide-react";
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
  return <AdminShell active="Observabilité">
    <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="text-3xl font-black tracking-tight">Observabilité</h1><p className="mt-1 text-sm leading-6 text-slate-500">Mesures techniques agrégées, tous les clubs · {periodLabel(hours)}.</p></div>
      <nav aria-label="Période d’observation" className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">{[["24h", "24 h"], ["72h", "3 jours"], ["7d", "7 jours"]].map(([key, label]) => {
        const active = (key === "24h" && hours === 24) || (key === "72h" && hours === 72) || (key === "7d" && hours === 168);
        return <Link key={key} href={`/admin/observability?period=${key}`} aria-current={active ? "page" : undefined} className={`inline-flex min-h-9 items-center rounded-lg px-3 text-sm font-bold transition focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${active ? "bg-[#0b3555] text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}>{label}</Link>;
      })}</nav>
    </header>

    <section aria-label="Indicateurs techniques" className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
      <Metric icon={ArrowDownUp} value={formatBytes(transferBytes)} label="Transferts observés" detail={`${Number(transfer.rows[0]?.totalRequests ?? 0).toLocaleString("fr-CA")} requêtes`} tone="blue" />
      <Metric icon={Database} value={formatBytes(Number(database.rows[0]?.bytes ?? 0))} label="Résultats PostgreSQL" detail={`${Number(database.rows[0]?.requests ?? 0).toLocaleString("fr-CA")} requêtes`} tone="violet" />
      <Metric icon={Activity} value={Number(eventCounts.rows[0]?.total ?? 0).toLocaleString("fr-CA")} label="Événements applicatifs" detail="Journal sur la période" tone="green" />
      <Metric icon={ShieldAlert} value={failedLogins.toLocaleString("fr-CA")} label="Échecs de connexion" detail="Événements auth.failed" tone="amber" />
    </section>

    <section aria-label="État des mesures de polling" className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/75 p-4 sm:p-5">
      <div className="flex flex-wrap items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800"><Zap className="h-5 w-5" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-black text-slate-900">Réponses 304 du polling coach</h2><span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-amber-800">Collecte inactive</span></div><p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600">Le compteur <code className="rounded bg-white px-1 py-0.5 text-xs">full / unchanged / error</code> n’est pas collecté. Le ratio de réponses sans corps JSON n’est donc pas disponible, et aucun seuil cible n’est défini.</p></div></div>
    </section>

    <section className="mt-4 grid items-start gap-4 xl:grid-cols-2">
      <Card className="overflow-hidden"><CardContent className="p-5 sm:p-6"><PanelHeading title="Transferts par route" detail="Requêtes et volume observés" icon={ArrowDownUp} /><DataTable headers={["Route normalisée", "Requêtes", "Octets"]} rows={transfer.rows.map((row) => [row.route, Number(row.requests).toLocaleString("fr-CA"), formatBytes(Number(row.bytes))])} empty="Aucune donnée de transfert sur cette période." /></CardContent></Card>
      <Card className="overflow-hidden"><CardContent className="p-5 sm:p-6"><PanelHeading title="Web Vitals par route" detail="Moyennes et nombre d’échantillons" icon={Activity} /><DataTable headers={["Route", "Mesure", "Moyenne", "Échantillons"]} rows={vitals.rows.map((row) => [row.route, row.metric, formatMetric(row.metric, Number(row.average)), Number(row.samples).toLocaleString("fr-CA")])} empty="Aucune mesure Web Vitals sur cette période." /></CardContent></Card>
    </section>

    <Card className="mt-4 overflow-hidden"><CardContent className="p-5 sm:p-6"><PanelHeading title="Événements récents" detail="Dernières activités enregistrées dans DivePlan" icon={Zap} /><DataTable headers={["Type", "Club", "Heure locale"]} rows={recentEvents.rows.map((event) => [event.type, event.clubName ?? "Système", formatMontrealDate(event.createdAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })])} empty="Aucun événement enregistré." /></CardContent></Card>
    <p className="mt-4 text-xs leading-5 text-slate-500">Les transferts et résultats PostgreSQL sont des agrégats existants. Ils ne mesurent pas le FOT Vercel facturé et ne fournissent pas de percentiles.</p>
  </AdminShell>;
}

function Metric({ icon: Icon, value, label, detail, tone }: { icon: typeof Activity; value: string; label: string; detail: string; tone: "blue" | "violet" | "green" | "amber" }) {
  const tones = { blue: "bg-blue-100 text-blue-700", violet: "bg-violet-100 text-violet-700", green: "bg-emerald-100 text-emerald-700", amber: "bg-amber-100 text-amber-800" };
  return <Card className="min-h-[106px] border-slate-200/80 shadow-sm"><CardContent className="flex items-center gap-3 p-4"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tones[tone]}`}><Icon className="h-5 w-5" /></span><div className="min-w-0"><p className="truncate text-[11px] font-bold text-slate-600">{label}</p><p className="mt-0.5 truncate text-xl font-black tabular-nums text-slate-900">{value}</p><p className="mt-0.5 truncate text-[11px] text-slate-500">{detail}</p></div></CardContent></Card>;
}

function PanelHeading({ title, detail, icon: Icon }: { title: string; detail: string; icon: typeof Activity }) {
  return <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-100 pb-3"><div><h2 className="font-black">{title}</h2><p className="mt-1 text-xs text-slate-500">{detail}</p></div><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-700"><Icon className="h-4 w-4" /></span></div>;
}

function DataTable({ headers, rows, empty }: { headers: string[]; rows: string[][]; empty: string }) {
  return rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[440px] text-left text-sm"><thead className="bg-slate-50"><tr>{headers.map((header) => <th key={header} className="whitespace-nowrap border-b border-slate-100 px-3 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row[0]}-${index}`} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">{row.map((cell, cellIndex) => <td key={cellIndex} className={`max-w-64 px-3 py-2.5 text-xs ${cellIndex === 0 ? "font-semibold text-slate-800" : "text-slate-600"}`}><span className="block truncate">{cell}</span></td>)}</tr>)}</tbody></table></div> : <p className="py-8 text-center text-sm text-slate-500">{empty}</p>;
}

function formatBytes(bytes: number) { if (bytes < 1024) return `${Math.round(bytes)} o`; const units = ["Ko", "Mo", "Go"]; let value = bytes / 1024; let unit = 0; while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; } return `${value.toLocaleString("fr-CA", { maximumFractionDigits: 1 })} ${units[unit]}`; }
function formatMetric(metric: string, value: number) { return metric === "CLS" ? value.toLocaleString("fr-CA", { maximumFractionDigits: 3 }) : `${Math.round(value).toLocaleString("fr-CA")} ms`; }
function periodLabel(hours: number) { return hours === 24 ? "24 dernières heures" : hours === 72 ? "3 derniers jours" : "7 derniers jours"; }
