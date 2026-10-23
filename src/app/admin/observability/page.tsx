import Link from "next/link";
import { Activity, ArrowDownUp, Database, ShieldAlert } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdmin } from "@/lib/current-user";
import { query } from "@/lib/db";

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
    <header className="mb-5 flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-wider text-[var(--color-action)]">Administration · tous les clubs</p><h1 className="mt-1 text-3xl font-black">Monitoring et observabilité</h1><p className="mt-2 text-sm text-[var(--color-ink-muted)]">Agrégats techniques disponibles pour les {hours === 24 ? "24 dernières heures" : hours === 72 ? "3 derniers jours" : "7 derniers jours"}.</p></div><nav aria-label="Période" className="flex gap-2">{[["24h", "24 h"], ["72h", "3 jours"], ["7d", "7 jours"]].map(([key, label]) => <Link key={key} href={`/admin/observability?period=${key}`} aria-current={(key === "24h" && hours === 24) || (key === "72h" && hours === 72) || (key === "7d" && hours === 168) ? "page" : undefined} className={`rounded-lg border px-3 py-2 text-sm font-bold ${(key === "24h" && hours === 24) || (key === "72h" && hours === 72) || (key === "7d" && hours === 168) ? "bg-[var(--color-navy)] text-white" : "bg-white"}`}>{label}</Link>)}</nav></header>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={ArrowDownUp} value={formatBytes(transferBytes)} label="Transferts observés" detail={`${Number(transfer.rows[0]?.totalRequests ?? 0).toLocaleString("fr-CA")} requêtes`} />
      <Metric icon={Database} value={formatBytes(Number(database.rows[0]?.bytes ?? 0))} label="Résultats PostgreSQL" detail={`${Number(database.rows[0]?.requests ?? 0).toLocaleString("fr-CA")} requêtes`} />
      <Metric icon={Activity} value={Number(eventCounts.rows[0]?.total ?? 0).toLocaleString("fr-CA")} label="Événements applicatifs" detail="Agrégés dans le journal" />
      <Metric icon={ShieldAlert} value={failedLogins.toLocaleString("fr-CA")} label="Échecs de connexion" detail="Événements auth.failed" />
    </section>
    <Card className="mt-4"><CardContent className="p-5"><h2 className="font-black">Réponses 304 du polling coach</h2><p className="mt-1 text-sm text-[var(--color-ink-muted)]">La collecte proposée des résultats <code>full / unchanged / error</code> n’est pas active. Aucun ratio de corps JSON évité n’est disponible dans DivePlan pour le moment; aucun seuil cible n’est configuré.</p></CardContent></Card>
    <div className="mt-4 grid gap-4 xl:grid-cols-2">
      <Card><CardContent className="p-5"><h2 className="mb-3 font-black">Transferts par route</h2><DataTable headers={["Route normalisée", "Requêtes", "Octets"]} rows={transfer.rows.map((row) => [row.route, Number(row.requests).toLocaleString("fr-CA"), formatBytes(Number(row.bytes))])} empty="Aucune donnée de transfert sur cette période." /></CardContent></Card>
      <Card><CardContent className="p-5"><h2 className="mb-3 font-black">Web Vitals par route</h2><DataTable headers={["Route", "Mesure", "Moyenne", "Échantillons"]} rows={vitals.rows.map((row) => [row.route, row.metric, formatMetric(row.metric, Number(row.average)), Number(row.samples).toLocaleString("fr-CA")])} empty="Aucune mesure Web Vitals sur cette période." /></CardContent></Card>
    </div>
    <Card className="mt-4"><CardContent className="p-5"><h2 className="mb-3 font-black">Événements récents</h2><DataTable headers={["Type", "Club", "Heure locale"]} rows={recentEvents.rows.map((event) => [event.type, event.clubName ?? "Système", new Intl.DateTimeFormat("fr-CA", { dateStyle: "short", timeStyle: "short", timeZone: "America/Toronto" }).format(event.createdAt)])} empty="Aucun événement enregistré." /></CardContent></Card>
    <p className="mt-4 text-xs text-[var(--color-ink-muted)]">Les transferts et résultats PostgreSQL sont des agrégats existants. Ils ne mesurent pas le FOT Vercel facturé et ne donnent pas de percentile.</p>
  </AdminShell>;
}

function Metric({ icon: Icon, value, label, detail }: { icon: typeof Activity; value: string; label: string; detail: string }) {
  return <Card><CardContent className="flex items-center gap-3 p-4"><span className="rounded-xl bg-slate-100 p-3"><Icon className="h-5 w-5" /></span><div><p className="text-2xl font-black">{value}</p><p className="text-sm font-semibold">{label}</p><p className="text-xs text-[var(--color-ink-muted)]">{detail}</p></div></CardContent></Card>;
}

function DataTable({ headers, rows, empty }: { headers: string[]; rows: string[][]; empty: string }) {
  return rows.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{headers.map((header) => <th key={header} className="border-b px-2 py-2 text-xs text-slate-600">{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row[0]}-${index}`} className="border-b last:border-0">{row.map((cell, cellIndex) => <td key={cellIndex} className="px-2 py-2">{cell}</td>)}</tr>)}</tbody></table></div> : <p className="py-6 text-center text-sm text-[var(--color-ink-muted)]">{empty}</p>;
}

function formatBytes(bytes: number) { if (bytes < 1024) return `${Math.round(bytes)} o`; const units = ["Ko", "Mo", "Go"]; let value = bytes / 1024; let unit = 0; while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; } return `${value.toLocaleString("fr-CA", { maximumFractionDigits: 1 })} ${units[unit]}`; }
function formatMetric(metric: string, value: number) { return metric === "CLS" ? value.toLocaleString("fr-CA", { maximumFractionDigits: 3 }) : `${Math.round(value).toLocaleString("fr-CA")} ms`; }
