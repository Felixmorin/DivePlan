import type * as React from "react";
import Link from "next/link";
import { Activity, CalendarClock, Dumbbell, FileUp, Plus } from "lucide-react";
import { CoachShell } from "@/components/coach/coach-shell";
import { AthleteAvatarGroup } from "@/components/coach/athlete-avatar-group";
import { StatusPill } from "@/components/training/status-pill";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { athletes as demoAthletes } from "@/lib/data";
import { requireCoach } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { ImportAthletesForm } from "./import-athletes-form";

export const dynamic = "force-dynamic";

type AthleteRow = {
  id: string;
  firstName: string;
  lastName: string;
  avatar?: string | null;
  level: string;
  groupName: string;
  active: boolean;
  nextSession?: { id: string; title: string; date: Date; status: string };
  lastActivity?: string;
  volume: number;
  completedSessions: number;
};

export default async function AthletesPage() {
  const { clubId } = await requireCoach();
  if (clubId === "dev-club") {
    return <DemoAthletesPage />;
  }

  const athletes = await prisma.athlete.findMany({
    where: { clubId },
    orderBy: [{ group: { name: "asc" } }, { user: { firstName: "asc" } }],
    include: {
      user: true,
      group: true,
      completions: { where: { status: "COMPLETED" }, include: { session: true }, orderBy: { completedAt: "desc" } },
      diveLogs: true
    }
  });

  const athleteIds = athletes.map((athlete) => athlete.id);
  const sessions = athleteIds.length
    ? await prisma.trainingSession.findMany({
        where: {
          week: { clubId },
          status: "READY",
          date: { gte: startOfToday() },
          blocks: { some: { assignments: { some: { athleteId: { in: athleteIds } } } } }
        },
        orderBy: { date: "asc" },
        include: { blocks: { include: { assignments: true } } },
        take: 20
      })
    : [];

  const nextByAthlete = new Map<string, AthleteRow["nextSession"]>();
  sessions.forEach((session) => {
    session.blocks.forEach((block) => {
      block.assignments.forEach((assignment) => {
        if (!nextByAthlete.has(assignment.athleteId)) {
          nextByAthlete.set(assignment.athleteId, { id: session.id, title: session.title, date: session.date, status: session.status });
        }
      });
    });
  });

  const rows: AthleteRow[] = athletes.map((athlete) => {
    const lastCompletion = athlete.completions[0];
    return {
      id: athlete.id,
      firstName: athlete.user.firstName,
      lastName: athlete.user.lastName,
      avatar: athlete.user.avatar,
      level: athlete.level,
      groupName: athlete.group?.name ?? "Sans groupe",
      active: athlete.active,
      nextSession: nextByAthlete.get(athlete.id),
      lastActivity: lastCompletion?.session.title,
      volume: athlete.diveLogs.reduce((sum, log) => sum + log.repetitionsCompleted, 0),
      completedSessions: athlete.completions.length
    };
  });

  return (
    <CoachShell active="Athletes">
      <DirectoryHeader title="Athletes" description="Reperer rapidement les groupes, statuts et prochaines seances." actionHref="/coach/sessions/new" actionLabel="Creer une seance" />
      <ImportCard />
      <AthleteDirectory rows={rows} />
    </CoachShell>
  );
}

function DemoAthletesPage() {
  const rows: AthleteRow[] = demoAthletes.map((athlete) => ({
    id: athlete.id,
    firstName: athlete.firstName,
    lastName: athlete.lastName,
    avatar: athlete.avatar,
    level: athlete.level,
    groupName: "Provincial",
    active: athlete.status !== "surveiller",
    nextSession: { id: "demo", title: athlete.lastSession, date: new Date("2026-08-25T16:30:00"), status: "READY" },
    lastActivity: athlete.lastSession,
    volume: athlete.recentVolume,
    completedSessions: 0
  }));

  return (
    <CoachShell active="Athletes">
      <DirectoryHeader title="Athletes" description="Mode demo local sans PostgreSQL." actionHref="/coach/sessions/demo" actionLabel="Voir la seance" />
      <AthleteDirectory rows={rows} demo />
    </CoachShell>
  );
}

function DirectoryHeader({ title, description, actionHref, actionLabel }: { title: string; description: string; actionHref: string; actionLabel: string }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-sm font-black uppercase text-[var(--color-brand-strong)]">Annuaire coach</p>
        <h1 className="mt-2 text-3xl font-black text-[var(--color-ink)]">{title}</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{description}</p>
      </div>
      <Button asChild variant="action">
        <Link href={actionHref}><Plus className="h-4 w-4" /> {actionLabel}</Link>
      </Button>
    </div>
  );
}

function ImportCard() {
  return (
    <Card className="mb-6 overflow-hidden">
      <CardHeader className="border-b border-[var(--color-border)] bg-[var(--color-surface-raised)]">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--block-pool-bg)] text-[var(--block-pool-fg)]">
            <FileUp className="h-5 w-5" />
          </div>
          <div>
            <CardTitle>Import CSV</CardTitle>
            <CardDescription>Colonnes supportees: firstName, lastName, email, level, group.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-5">
        <ImportAthletesForm />
      </CardContent>
    </Card>
  );
}

function AthleteDirectory({ rows, demo = false }: { rows: AthleteRow[]; demo?: boolean }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Aucun athlete dans ce club"
        description="Ajoute des athletes par CSV ou cree une invitation pour demarrer la planification."
        action={<Button asChild variant="action"><Link href="/coach/invitations">Inviter un athlete</Link></Button>}
      />
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-[var(--color-border)] bg-white">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Liste active</CardTitle>
            <CardDescription>{rows.length} athletes visibles selon le role connecte.</CardDescription>
          </div>
          <AthleteAvatarGroup ids={rows.map((row) => row.id)} athletes={rows} limit={8} />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="hidden lg:block">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-[var(--color-surface-raised)] text-xs font-black uppercase text-[var(--color-ink-muted)]">
              <tr>
                <th className="px-5 py-3">Athlete</th>
                <th className="px-4 py-3">Groupe</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Prochaine seance</th>
                <th className="px-4 py-3">Activite</th>
                <th className="px-5 py-3 text-right">Volume</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map((row) => (
                <tr key={row.id} className="transition duration-[var(--duration-fast)] hover:bg-[var(--color-surface-raised)]">
                  <td className="px-5 py-4"><Identity row={row} /></td>
                  <td className="px-4 py-4"><Badge variant="outline">{row.groupName}</Badge></td>
                  <td className="px-4 py-4"><Badge variant={row.active ? "success" : "outline"}>{row.active ? "Actif" : "Inactif"}</Badge></td>
                  <td className="px-4 py-4"><NextSession nextSession={row.nextSession} demo={demo} /></td>
                  <td className="px-4 py-4"><ActivitySummary row={row} /></td>
                  <td className="px-5 py-4 text-right text-lg font-black">{row.volume}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-[var(--color-border)] lg:hidden">
          {rows.map((row) => (
            <div key={row.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <Identity row={row} />
                <Badge variant={row.active ? "success" : "outline"}>{row.active ? "Actif" : "Inactif"}</Badge>
              </div>
              <div className="mt-4 grid gap-3 text-sm">
                <MobileMetric icon={<Dumbbell className="h-4 w-4" />} label="Groupe" value={row.groupName} />
                <MobileMetric icon={<CalendarClock className="h-4 w-4" />} label="Prochaine" value={row.nextSession ? row.nextSession.title : "Aucune seance publiee"} />
                <MobileMetric icon={<Activity className="h-4 w-4" />} label="Activite" value={`${row.completedSessions} completees · ${row.volume} reps`} />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function Identity({ row }: { row: AthleteRow }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="h-11 w-11 border border-[var(--color-border)]">
        <AvatarImage src={row.avatar ?? undefined} />
        <AvatarFallback>{row.firstName[0]}{row.lastName[0]}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="truncate font-black text-[var(--color-ink)]">{row.firstName} {row.lastName}</div>
        <div className="truncate text-xs font-bold text-[var(--color-ink-muted)]">{row.level}</div>
      </div>
    </div>
  );
}

function NextSession({ nextSession, demo }: { nextSession?: AthleteRow["nextSession"]; demo?: boolean }) {
  if (!nextSession) {
    return <span className="text-sm font-semibold text-[var(--color-ink-soft)]">Aucune seance publiee</span>;
  }

  return (
    <div className="space-y-1">
      <Link href={demo ? "/coach/sessions/demo" : `/coach/sessions/${nextSession.id}`} className="font-black text-[var(--color-ink)] hover:text-[var(--color-brand-strong)]">
        {nextSession.title}
      </Link>
      <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-ink-muted)]">
        {nextSession.date.toLocaleDateString("fr-CA", { weekday: "short", day: "2-digit", month: "short" })}
        <StatusPill status={nextSession.status} className="min-h-6 px-2" />
      </div>
    </div>
  );
}

function ActivitySummary({ row }: { row: AthleteRow }) {
  return (
    <div className="space-y-1">
      <div className="font-black text-[var(--color-ink)]">{row.completedSessions} seances completees</div>
      <div className="text-xs font-bold text-[var(--color-ink-muted)]">{row.lastActivity ?? "Aucun historique disponible"}</div>
    </div>
  );
}

function MobileMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--radius-ui)] bg-[var(--color-surface-raised)] px-3 py-2">
      <span className="flex items-center gap-2 text-xs font-black uppercase text-[var(--color-ink-muted)]">{icon}{label}</span>
      <span className="min-w-0 truncate text-right font-bold text-[var(--color-ink)]">{value}</span>
    </div>
  );
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}
