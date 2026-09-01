import type * as React from "react";
import { Activity, AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";
import { CoachShell } from "@/components/coach/coach-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireCoach } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function MonitoringPage() {
  const { clubId } = await requireCoach();
  if (clubId === "dev-club") {
    const events = [
      { id: "demo-auth", type: "auth.login", message: "Connexion demo locale", source: "system demo" },
      { id: "demo-session", type: "session.viewed", message: "Seance demo ouverte", source: "system demo" },
      { id: "demo-db", type: "system.notice", message: "PostgreSQL non configure pour cette session", source: "system demo" }
    ];

    return (
      <CoachShell active="Monitoring">
        <PageHeader description="Mode demo local sans PostgreSQL." />
        <MonitoringStats events={events.length} failedLogins={0} completedSessions={0} />
        <EventJournal events={events} />
      </CoachShell>
    );
  }

  const [events, failedLogins, completedSessions] = await Promise.all([
    prisma.appEvent.findMany({
      where: { OR: [{ clubId }, { clubId: null }] },
      orderBy: { createdAt: "desc" },
      take: 80,
      include: { user: true }
    }),
    prisma.appEvent.count({ where: { clubId, type: "auth.failed", createdAt: { gte: sinceHours(24) } } }),
    prisma.athleteSessionCompletion.count({ where: { status: "COMPLETED", session: { week: { clubId } }, completedAt: { gte: sinceHours(24) } } })
  ]);

  return (
    <CoachShell active="Monitoring">
      <PageHeader description="Evenements produit et signaux de support visibles pour le role connecte." />
      <MonitoringStats events={events.length} failedLogins={failedLogins} completedSessions={completedSessions} />
      <EventJournal
        events={events.map((event) => ({
          id: event.id,
          type: event.type,
          message: event.message,
          source: event.user?.email ?? "system",
          date: event.createdAt.toLocaleString("fr-CA")
        }))}
      />
    </CoachShell>
  );
}

function PageHeader({ description }: { description: string }) {
  return (
    <div className="mb-6">
      <p className="text-sm font-black uppercase text-[var(--color-brand-strong)]">Administration</p>
      <h1 className="mt-2 text-3xl font-black text-[var(--color-ink)]">Monitoring</h1>
      <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{description}</p>
    </div>
  );
}

function MonitoringStats({ events, failedLogins, completedSessions }: { events: number; failedLogins: number; completedSessions: number }) {
  return (
    <div className="mb-6 grid gap-4 md:grid-cols-3">
      <MetricCard icon={<Activity className="h-5 w-5" />} label="Evenements" value={events} detail="recents" />
      <MetricCard icon={<AlertTriangle className="h-5 w-5" />} label="Connexions refusees" value={failedLogins} detail="24 dernieres heures" tone="warning" />
      <MetricCard icon={<CheckCircle2 className="h-5 w-5" />} label="Seances completees" value={completedSessions} detail="24 dernieres heures" tone="success" />
    </div>
  );
}

function MetricCard({ icon, label, value, detail, tone = "pool" }: { icon: React.ReactNode; label: string; value: number; detail: string; tone?: "pool" | "warning" | "success" }) {
  const toneClass =
    tone === "warning"
      ? "bg-[var(--block-dryland-bg)] text-[var(--block-dryland-fg)]"
      : tone === "success"
        ? "bg-[var(--color-success-soft)] text-[var(--color-success)]"
        : "bg-[var(--block-pool-bg)] text-[var(--block-pool-fg)]";

  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${toneClass}`}>{icon}</div>
        <div>
          <div className="text-3xl font-black text-[var(--color-ink)]">{value}</div>
          <div className="text-xs font-black uppercase text-[var(--color-ink-muted)]">{label}</div>
          <div className="text-xs font-bold text-[var(--color-ink-soft)]">{detail}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function EventJournal({ events }: { events: Array<{ id: string; type: string; message: string; source: string; date?: string }> }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-[var(--color-border)] bg-[var(--color-surface-raised)]">
        <CardTitle>Journal</CardTitle>
        <CardDescription>Lecture chronologique, sans donnees hors club.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {events.length > 0 ? (
          <div className="divide-y divide-[var(--color-border)]">
            {events.map((event) => (
              <div key={event.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="font-black text-[var(--color-ink)]">{event.message}</div>
                  <div className="mt-1 text-sm font-semibold text-[var(--color-ink-muted)]">{event.source}{event.date ? ` · ${event.date}` : ""}</div>
                </div>
                <Badge variant={event.type.includes("failed") ? "warning" : "outline"}>{event.type}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-5">
            <EmptyState title="Aucun evenement" description="Le journal se remplira lorsque l'application enregistrera une activite." icon={ShieldCheck} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function sinceHours(hours: number) {
  const date = new Date();
  date.setHours(date.getHours() - hours);
  return date;
}
