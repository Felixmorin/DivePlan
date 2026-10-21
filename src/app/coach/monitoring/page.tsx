import { AlertTriangle, CheckCircle2, FileText, Shield } from "lucide-react";
import { CoachShell } from "@/components/coach/coach-shell";
import { Card, CardContent } from "@/components/ui/card";
import { requireFullAccessCoach } from "@/lib/current-user";
import { query } from "@/lib/db";
import { MonitoringJournal } from "./monitoring-journal";

export const dynamic = "force-dynamic";

export default async function MonitoringPage() {
  const { clubId } = await requireFullAccessCoach();
  if (clubId === "dev-club") {
    const events = [
      { id: "demo-auth", type: "auth.login", message: "Connexion démo locale", source: "system demo", date: new Date().toISOString() },
      { id: "demo-session", type: "session.viewed", message: "Séance démo ouverte", source: "system demo", date: new Date(Date.now() - 60 * 60 * 1000).toISOString() },
      { id: "demo-db", type: "system.notice", message: "PostgreSQL non configuré pour cette session", source: "system demo", date: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString() }
    ];
    return <MonitoringContent events={events} failedLogins={0} completedSessions={0} />;
  }

  const since = sinceHours(24);
  const [eventsResult, failedResult, completedResult] = await Promise.all([
    query<{ id: string; type: string; message: string; email: string | null; createdAt: Date }>(
      `SELECT e.id, e.type, e.message, u.email, e."createdAt" FROM "AppEvent" e
       LEFT JOIN "User" u ON u.id = e."userId" ORDER BY e."createdAt" DESC LIMIT 80`),
    query<{ count: string }>(`SELECT count(*)::text AS count FROM "AppEvent" WHERE type = 'auth.failed' AND "createdAt" >= $1`, [since]),
    query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "AthleteSessionCompletion" c
       JOIN "TrainingSession" s ON s.id = c."sessionId" JOIN "TrainingWeek" w ON w.id = s."weekId"
       WHERE c.status = 'COMPLETED' AND c."completedAt" >= $1`, [since])
  ]);
  return <MonitoringContent
    events={eventsResult.rows.map((e) => ({ id: e.id, type: e.type, message: e.message, source: e.email ?? "Système", date: e.createdAt.toISOString() }))}
    failedLogins={Number(failedResult.rows[0]?.count ?? 0)}
    completedSessions={Number(completedResult.rows[0]?.count ?? 0)}
  />;
}

function MonitoringContent({ events, failedLogins, completedSessions }: { events: Array<{ id: string; type: string; message: string; source: string; date: string }>; failedLogins: number; completedSessions: number }) {
  return <CoachShell active="Monitoring">
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-3xl font-black tracking-tight">Monitoring</h1><p className="mt-1 max-w-lg text-sm text-[var(--color-ink-muted)]">Suivez l’activité de l’application et les événements système en temps réel.</p></div>
    </header>
    <section aria-label="Statistiques de monitoring" className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard icon={FileText} color="blue" value={events.length} label="Événements" />
      <MetricCard icon={AlertTriangle} color="amber" value={failedLogins} label="Alertes actives" />
      <MetricCard icon={Shield} color="red" value={0} label="Connexions suspectes" />
      <MetricCard icon={CheckCircle2} color="green" value={completedSessions} label="Séances complétées" />
    </section>
    <MonitoringJournal events={events} />
  </CoachShell>;
}

function MetricCard({ icon: Icon, color, value, label }: { icon: typeof FileText; color: string; value: number; label: string }) {
  const colors: Record<string, string> = { blue: "bg-sky-100 text-sky-600", amber: "bg-amber-100 text-amber-700", red: "bg-red-100 text-red-600", green: "bg-emerald-100 text-emerald-600" };
  return <Card><CardContent className="flex items-center gap-4 p-4"><span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ${colors[color]}`}><Icon className="h-6 w-6" /></span><div><p className="text-3xl font-black leading-none">{value.toLocaleString("fr-CA")}</p><p className="mt-1 text-sm text-[var(--color-ink-muted)]">{label}</p></div></CardContent></Card>;
}

function sinceHours(hours: number) { const date = new Date(); date.setHours(date.getHours() - hours); return date; }
