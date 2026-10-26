import { AlertTriangle, CheckCircle2, FileText, Shield } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdmin } from "@/lib/current-user";
import { query } from "@/lib/db";
import { MonitoringJournal } from "@/app/coach/monitoring/monitoring-journal";

export const dynamic = "force-dynamic";

export default async function AdminMonitoringPage() {
  await requireAdmin();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [eventsResult, failedResult, completedResult] = await Promise.all([
    query<{ id: string; type: string; message: string; email: string | null; createdAt: Date }>(
      `SELECT e.id, e.type, e.message, u.email, e."createdAt" FROM "AppEvent" e
       LEFT JOIN "User" u ON u.id = e."userId" ORDER BY e."createdAt" DESC LIMIT 500`),
    query<{ count: string }>(`SELECT count(*)::text AS count FROM "AppEvent" WHERE type = 'auth.failed' AND "createdAt" >= $1`, [since]),
    query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "AthleteSessionCompletion" c
       JOIN "TrainingSession" s ON s.id = c."sessionId" JOIN "TrainingWeek" w ON w.id = s."weekId"
       WHERE c.status = 'COMPLETED' AND c."completedAt" >= $1`, [since])
  ]);
  const events = eventsResult.rows.map((event) => ({ id: event.id, type: event.type, message: event.message, source: event.email ?? "Système", date: event.createdAt.toISOString() }));

  return <AdminShell active="Monitoring">
    <header className="mb-6">
      <h1 className="text-3xl font-black tracking-tight">Monitoring</h1>
      <p className="mt-1 max-w-lg text-sm text-[var(--color-ink-muted)]">Suivez l’activité de l’application et les événements système en temps réel.</p>
    </header>
    <section aria-label="Statistiques de monitoring" className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard icon={FileText} color="blue" value={events.length} label="Événements" />
      <MetricCard icon={AlertTriangle} color="amber" value={Number(failedResult.rows[0]?.count ?? 0)} label="Alertes actives" />
      <MetricCard icon={Shield} color="red" value={0} label="Connexions suspectes" />
      <MetricCard icon={CheckCircle2} color="green" value={Number(completedResult.rows[0]?.count ?? 0)} label="Séances complétées" />
    </section>
    <MonitoringJournal events={events} />
  </AdminShell>;
}

function MetricCard({ icon: Icon, color, value, label }: { icon: typeof FileText; color: string; value: number; label: string }) {
  const colors: Record<string, string> = { blue: "bg-sky-100 text-sky-600", amber: "bg-amber-100 text-amber-700", red: "bg-red-100 text-red-600", green: "bg-emerald-100 text-emerald-600" };
  return <Card><CardContent className="flex items-center gap-4 p-4"><span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ${colors[color]}`}><Icon className="h-6 w-6" /></span><div><p className="text-3xl font-black leading-none">{value.toLocaleString("fr-CA")}</p><p className="mt-1 text-sm text-[var(--color-ink-muted)]">{label}</p></div></CardContent></Card>;
}
