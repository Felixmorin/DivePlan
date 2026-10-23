import Link from "next/link";
import { Activity, ArrowRight, Users, ShieldCheck } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdmin } from "@/lib/current-user";
import { query } from "@/lib/db";
import { formatMontrealDate } from "@/lib/timezone";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  await requireAdmin();
  const [coachCounts, clubCounts, telemetry] = await Promise.all([
    query<{ enabled: string; disabled: string }>(`SELECT count(*) FILTER (WHERE "accessEnabled")::text AS enabled, count(*) FILTER (WHERE NOT "accessEnabled")::text AS disabled FROM "User" WHERE role = 'COACH'`),
    query<{ count: string }>(`SELECT count(*)::text AS count FROM "Club"`),
    query<{ hours: string; lastUpdatedAt: Date | null }>(`SELECT count(DISTINCT hour)::text AS hours, max("updatedAt") AS "lastUpdatedAt" FROM "TransferTelemetryHour" WHERE hour >= NOW() - INTERVAL '24 hours'`)
  ]);
  const enabled = Number(coachCounts.rows[0]?.enabled ?? 0);
  const disabled = Number(coachCounts.rows[0]?.disabled ?? 0);
  const observedHours = Number(telemetry.rows[0]?.hours ?? 0);
  const lastUpdatedAt = telemetry.rows[0]?.lastUpdatedAt;
  return <AdminShell active="Vue d’ensemble">
    <header className="mb-7"><h1 className="text-3xl font-black tracking-tight">Vue d’ensemble</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-ink-muted)]">Accès des coachs et activité de collecte sur les dernières 24 heures.</p></header>
    <section aria-label="État de l’administration" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <Card><CardContent className="p-5"><div className="flex items-start gap-4"><span className="rounded-xl bg-slate-100 p-3"><Users className="h-5 w-5" /></span><div><p className="text-sm font-semibold text-[var(--color-ink-muted)]">Coachs avec accès</p><p className="mt-1 text-3xl font-black tabular-nums">{enabled.toLocaleString("fr-CA")}</p><p className="mt-1 text-sm text-[var(--color-ink-muted)]">Comptes actifs</p></div></div><div className="mt-4 border-t pt-3">{disabled ? <Link href="/admin/coaches?status=disabled" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[var(--color-action)] hover:underline focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">Voir {disabled.toLocaleString("fr-CA")} compte{disabled === 1 ? "" : "s"} désactivé{disabled === 1 ? "" : "s"}<ArrowRight className="h-4 w-4" /></Link> : <p className="py-2 text-sm text-[var(--color-ink-muted)]">Aucun compte désactivé</p>}</div></CardContent></Card>
      <Card><CardContent className="p-5"><div className="flex items-start gap-4"><span className="rounded-xl bg-slate-100 p-3"><Activity className="h-5 w-5" /></span><div><p className="text-sm font-semibold text-[var(--color-ink-muted)]">Collecte de transfert</p><p className="mt-1 text-3xl font-black tabular-nums">{observedHours}<span className="ml-1 text-base font-semibold text-[var(--color-ink-muted)]">/ 24 h</span></p><p className="mt-1 text-sm text-[var(--color-ink-muted)]">Créneaux horaires avec données</p></div></div><div className="mt-4 border-t pt-3"><p className="min-h-11 py-2 text-sm text-[var(--color-ink-muted)]">{lastUpdatedAt ? <>Dernière mise à jour : <time dateTime={new Date(lastUpdatedAt).toISOString()} className="font-semibold text-[var(--color-ink)]">{formatMontrealDate(lastUpdatedAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time> (Montréal)</> : "Aucune collecte de transfert dans les dernières 24 h"}</p></div></CardContent></Card>
      <Card><CardContent className="flex min-h-full items-center gap-4 p-5"><span className="rounded-xl bg-slate-100 p-3"><ShieldCheck className="h-5 w-5" /></span><div><p className="text-3xl font-black tabular-nums">{Number(clubCounts.rows[0]?.count ?? 0).toLocaleString("fr-CA")}</p><p className="text-sm font-semibold">Clubs</p><p className="text-xs text-[var(--color-ink-muted)]">Espaces configurés</p></div></CardContent></Card>
    </section>
    <div className="mt-5 grid gap-3 md:grid-cols-2">
      <ActionLink href="/admin/coaches" title="Gérer les accès coach" detail="Créer un compte, changer son club ou rétablir un accès." />
      <ActionLink href="/admin/observability" title="Ouvrir l’observabilité" detail="Explorer les agrégats techniques et leur évolution." />
    </div>
  </AdminShell>;
}

function ActionLink({ href, title, detail }: { href: string; title: string; detail: string }) {
  return <Link href={href} className="group flex min-h-28 items-center justify-between gap-4 rounded-2xl border bg-white p-5 shadow-sm transition hover:border-[var(--color-action)] hover:shadow-md focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"><span><span className="block font-black">{title}</span><span className="mt-1 block text-sm leading-5 text-[var(--color-ink-muted)]">{detail}</span></span><ArrowRight aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--color-action)] transition-transform group-hover:translate-x-1" /></Link>;
}
