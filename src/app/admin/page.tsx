import Link from "next/link";
import { Activity, ArrowDownUp, ArrowRight, CalendarDays, Database, RotateCw, ShieldCheck, Users, Waves, Zap } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdmin } from "@/lib/current-user";
import { query } from "@/lib/db";
import { addMontrealDays, formatMontrealDate, startOfMontrealWeek } from "@/lib/timezone";

export const dynamic = "force-dynamic";

type EventRow = { id: string; type: string; message: string; clubName: string | null; createdAt: Date };
type FreshnessRow = { transferAt: Date | null; databaseAt: Date | null; eventAt: Date | null };

export default async function AdminHomePage() {
  await requireAdmin();
  const weekStart = startOfMontrealWeek();
  const weekEnd = addMontrealDays(weekStart, 7);
  const [coachCounts, clubCounts, sessions, transfer, freshness, events] = await Promise.all([
    query<{ enabled: string; disabled: string }>(`SELECT count(*) FILTER (WHERE "accessEnabled")::text AS enabled, count(*) FILTER (WHERE NOT "accessEnabled")::text AS disabled FROM "User" WHERE role = 'COACH'`),
    query<{ count: string }>(`SELECT count(*)::text AS count FROM "Club"`),
    query<{ count: string }>(`SELECT count(*)::text AS count FROM "TrainingSession" WHERE date >= $1 AND date < $2 AND status <> 'CANCELLED'`, [weekStart, weekEnd]),
    query<{ requests: string; bytes: string }>(`SELECT COALESCE(SUM(requests), 0)::text AS requests, COALESCE(SUM("transferBytes"), 0)::text AS bytes FROM "TransferTelemetryHour" WHERE hour >= NOW() - INTERVAL '24 hours'`),
    query<FreshnessRow>(`SELECT (SELECT MAX("updatedAt") FROM "TransferTelemetryHour" WHERE hour >= NOW() - INTERVAL '24 hours') AS "transferAt", (SELECT MAX("updatedAt") FROM "DatabaseEgressTelemetryHour" WHERE hour >= NOW() - INTERVAL '24 hours') AS "databaseAt", (SELECT MAX("createdAt") FROM "AppEvent" WHERE "createdAt" >= NOW() - INTERVAL '24 hours') AS "eventAt"`),
    query<EventRow>(`SELECT e.id, e.type, e.message, c.name AS "clubName", e."createdAt" FROM "AppEvent" e LEFT JOIN "Club" c ON c.id = e."clubId" ORDER BY e."createdAt" DESC LIMIT 5`)
  ]);

  const enabled = Number(coachCounts.rows[0]?.enabled ?? 0);
  const disabled = Number(coachCounts.rows[0]?.disabled ?? 0);
  const transferRequests = Number(transfer.rows[0]?.requests ?? 0);
  const transferUpdated = freshness.rows[0]?.transferAt;
  const freshnessItems = [
    { label: "Transferts observés", icon: ArrowDownUp, date: freshness.rows[0]?.transferAt ?? null },
    { label: "Résultats PostgreSQL", icon: Database, date: freshness.rows[0]?.databaseAt ?? null },
    { label: "Événements applicatifs", icon: Zap, date: freshness.rows[0]?.eventAt ?? null }
  ];

  return <AdminShell active="Vue d’ensemble">
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-black tracking-tight sm:text-[34px]">Administration de la plateforme</h1><span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-50 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-cyan-800"><Waves className="h-3.5 w-3.5" /> Administrateur</span></div><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Gestion globale de DivePlan, de ses coachs, de ses clubs et de ses services.</p></div>
      <div className="flex items-center gap-3"><p className="max-w-48 text-right text-xs leading-5 text-slate-500">{transferUpdated ? <>Collecte transfert mise à jour<br /><time dateTime={new Date(transferUpdated).toISOString()} className="font-semibold text-slate-700">{formatDate(transferUpdated)}</time></> : "Aucune collecte de transfert sur 24 h"}</p><Link href="/admin" aria-label="Actualiser le tableau de bord" title="Actualiser" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-cyan-500 hover:text-cyan-800 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"><RotateCw className="h-4 w-4" /></Link></div>
    </header>

    <section aria-label="Indicateurs de la plateforme" className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
      <MetricCard href={disabled ? "/admin/coaches?status=disabled" : "/admin/coaches"} icon={Users} label="Coachs avec accès" value={enabled.toLocaleString("fr-CA")} detail={disabled ? `Voir ${disabled.toLocaleString("fr-CA")} compte${disabled === 1 ? "" : "s"} désactivé${disabled === 1 ? "" : "s"}` : "Tous les accès actifs"} tone="blue" />
      <MetricCard icon={ShieldCheck} label="Clubs" value={Number(clubCounts.rows[0]?.count ?? 0).toLocaleString("fr-CA")} detail="Espaces configurés" tone="violet" />
      <MetricCard icon={CalendarDays} label="Séances cette semaine" value={Number(sessions.rows[0]?.count ?? 0).toLocaleString("fr-CA")} detail="Semaine en cours · heure de Montréal" tone="green" />
      <MetricCard href="/admin/observability" icon={Activity} label="Requêtes de transfert" value={transferRequests.toLocaleString("fr-CA")} detail="Agrégats observés · dernières 24 h" tone="red" />
    </section>

    <section className="mt-4 grid gap-4 xl:grid-cols-2">
      <Card className="overflow-hidden"><CardContent className="p-5 sm:p-6"><div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4"><div><h2 className="text-lg font-black">Fraîcheur des données</h2><p className="mt-1 text-sm text-slate-500">Dernière écriture observée sur chaque flux.</p></div><Activity className="h-5 w-5 text-cyan-700" /></div><div className="divide-y divide-slate-100">{freshnessItems.map(({ label, icon: Icon, date }) => <div key={label} className="grid grid-cols-[40px_1fr_auto] items-center gap-3 py-3.5"><span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700"><Icon className="h-[18px] w-[18px]" /></span><p className="text-sm font-semibold">{label}</p><p className="text-right text-xs text-slate-500">{date ? <time dateTime={new Date(date).toISOString()} className="font-semibold text-slate-700">{formatDate(date)}</time> : <span className="text-slate-400">Aucune donnée · 24 h</span>}</p></div>)}</div><p className="mt-2 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">Ces horodatages indiquent la collecte des agrégats existants; ils ne représentent pas la disponibilité ou la facturation Vercel.</p></CardContent></Card>

      <Card className="overflow-hidden"><CardContent className="p-5 sm:p-6"><div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4"><div><h2 className="text-lg font-black">Activité récente</h2><p className="mt-1 text-sm text-slate-500">Derniers événements enregistrés dans DivePlan.</p></div><Link href="/admin/observability" className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm font-bold text-sky-800 hover:bg-sky-50 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">Observabilité<ArrowRight className="h-4 w-4" /></Link></div>
        {events.rows.length ? <ul className="divide-y divide-slate-100">{events.rows.map((event, index) => <li key={event.id} className="grid grid-cols-[40px_1fr_auto] items-center gap-3 py-3"><span className={`grid h-10 w-10 place-items-center rounded-xl ${index === 0 ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-700"}`}><Activity className="h-[18px] w-[18px]" /></span><div className="min-w-0"><p className="truncate text-sm font-bold">{event.message || event.type}</p><p className="mt-0.5 truncate text-xs text-slate-500">{event.clubName ?? "Événement système"}</p></div><time dateTime={new Date(event.createdAt).toISOString()} className="text-right text-[11px] leading-4 text-slate-500">{formatDate(event.createdAt)}</time></li>)}</ul> : <p className="py-8 text-center text-sm text-slate-500">Aucun événement enregistré.</p>}
      </CardContent></Card>
    </section>

    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="mb-4 flex items-center justify-between"><div><h2 className="text-lg font-black">Actions rapides</h2><p className="mt-1 text-sm text-slate-500">Accédez directement aux outils de gestion.</p></div><Zap className="h-5 w-5 text-slate-500" /></div><div className="grid gap-3 md:grid-cols-2"><QuickAction href="/admin/coaches" icon={Users} title="Gérer les accès coach" detail="Créer, filtrer ou rétablir un compte coach." /><QuickAction href="/admin/observability" icon={Activity} title="Ouvrir l’observabilité" detail="Explorer les transferts, événements et mesures disponibles." /></div></section>
  </AdminShell>;
}

function MetricCard({ href, icon: Icon, label, value, detail, tone }: { href?: string; icon: typeof Users; label: string; value: string; detail: string; tone: "blue" | "violet" | "green" | "red" }) {
  const tones = { blue: "bg-blue-50 text-blue-700", violet: "bg-violet-50 text-violet-700", green: "bg-emerald-50 text-emerald-700", red: "bg-rose-50 text-rose-700" };
  const content = <><span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl ${tones[tone]}`}><Icon className="h-6 w-6" /></span><span className="min-w-0"><span className="block text-sm font-bold text-slate-700">{label}</span><span className="mt-1 block text-[30px] font-black leading-9 tracking-tight tabular-nums text-slate-900">{value}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{detail}</span></span>{href && <ArrowRight aria-hidden="true" className="ml-auto h-4 w-4 shrink-0 text-slate-400" />}</>;
  return href ? <Link href={href} className="group flex min-h-[142px] items-start gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-md focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">{content}</Link> : <div className="flex min-h-[142px] items-start gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">{content}</div>;
}

function QuickAction({ href, icon: Icon, title, detail }: { href: string; icon: typeof Users; title: string; detail: string }) {
  return <Link href={href} className="group flex min-h-[76px] items-center gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-sky-300 hover:bg-sky-50/40 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><Icon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block font-bold">{title}</span><span className="mt-0.5 block text-xs leading-5 text-slate-500">{detail}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-hover:translate-x-1" /></Link>;
}

function formatDate(date: Date) {
  return formatMontrealDate(date, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
