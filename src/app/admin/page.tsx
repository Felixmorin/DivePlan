import Link from "next/link";
import { Activity, Users, ShieldCheck } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdmin } from "@/lib/current-user";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  await requireAdmin();
  const [coachCounts, clubCounts, telemetry] = await Promise.all([
    query<{ enabled: string; disabled: string }>(`SELECT count(*) FILTER (WHERE "accessEnabled")::text AS enabled, count(*) FILTER (WHERE NOT "accessEnabled")::text AS disabled FROM "User" WHERE role = 'COACH'`),
    query<{ count: string }>(`SELECT count(*)::text AS count FROM "Club"`),
    query<{ count: string }>(`SELECT count(*)::text AS count FROM "TransferTelemetryHour" WHERE hour >= NOW() - INTERVAL '24 hours'`)
  ]);
  const enabled = Number(coachCounts.rows[0]?.enabled ?? 0);
  const disabled = Number(coachCounts.rows[0]?.disabled ?? 0);
  return <AdminShell active="Vue d’ensemble">
    <header className="mb-6"><p className="text-xs font-black uppercase tracking-wider text-[var(--color-action)]">Administration</p><h1 className="mt-1 text-3xl font-black">Vue d’ensemble</h1><p className="mt-2 text-sm text-[var(--color-ink-muted)]">Gérez les accès coach et surveillez l’activité technique de DivePlan.</p></header>
    <section className="grid gap-3 sm:grid-cols-3">
      <Stat icon={Users} label="Coachs avec accès" value={enabled} detail={`${disabled} désactivé${disabled === 1 ? "" : "s"}`} />
      <Stat icon={ShieldCheck} label="Clubs" value={Number(clubCounts.rows[0]?.count ?? 0)} detail="Tous les espaces club" />
      <Stat icon={Activity} label="Agrégats de transfert" value={Number(telemetry.rows[0]?.count ?? 0)} detail="Heures avec données · dernières 24 h" />
    </section>
    <div className="mt-5 grid gap-4 md:grid-cols-2">
      <Link href="/admin/coaches" className="rounded-2xl border bg-white p-5 shadow-sm hover:border-[var(--color-action)]"><h2 className="font-black">Gérer les accès coach</h2><p className="mt-1 text-sm text-[var(--color-ink-muted)]">Créer un accès, choisir le club et suspendre ou rétablir un compte.</p></Link>
      <Link href="/admin/observability" className="rounded-2xl border bg-white p-5 shadow-sm hover:border-[var(--color-action)]"><h2 className="font-black">Monitoring et observabilité</h2><p className="mt-1 text-sm text-[var(--color-ink-muted)]">Consulter les agrégats techniques sur les clubs.</p></Link>
    </div>
  </AdminShell>;
}

function Stat({ icon: Icon, label, value, detail }: { icon: typeof Users; label: string; value: number; detail: string }) {
  return <Card><CardContent className="flex items-center gap-4 p-5"><span className="rounded-xl bg-slate-100 p-3"><Icon className="h-5 w-5" /></span><div><p className="text-2xl font-black">{value.toLocaleString("fr-CA")}</p><p className="text-sm font-semibold">{label}</p><p className="text-xs text-[var(--color-ink-muted)]">{detail}</p></div></CardContent></Card>;
}
