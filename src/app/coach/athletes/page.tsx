import type * as React from "react";
import Link from "next/link";
import { Activity, CalendarClock, Dumbbell, Plus, Trash2, UserPlus } from "lucide-react";
import { deleteAthlete } from "@/app/coach/athletes/actions";
import { CreateAthleteAccountForm } from "@/app/coach/athletes/create-athlete-account-form";
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
import { query } from "@/lib/db";
import { formatMontrealDate, parseMontrealSessionDate, startOfMontrealDay } from "@/lib/timezone";

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
  averageVolume: number | null;
};

type AthleteGroup = {
  id: string;
  name: string;
};

export default async function AthletesPage() {
  const { clubId } = await requireCoach();
  if (clubId === "dev-club") {
    return <DemoAthletesPage />;
  }

  type AthleteListResult = { id: string; firstName: string; lastName: string; avatar: string | null; level: string; groupName: string | null; active: boolean; lastActivity: string | null; completedSessions: number; volume: number; averageVolume: number | null };
  const [athletesResult, groupsResult] = await Promise.all([
    query<AthleteListResult>(
      `SELECT a.id, u."firstName", u."lastName", u.avatar, a.level, g.name AS "groupName", a.active,
         (SELECT s.title FROM "AthleteSessionCompletion" c JOIN "TrainingSession" s ON s.id = c."sessionId"
          WHERE c."athleteId" = a.id AND c.status = 'COMPLETED' ORDER BY c."completedAt" DESC LIMIT 1) AS "lastActivity",
         (SELECT count(*)::int FROM "AthleteSessionCompletion" c WHERE c."athleteId" = a.id AND c.status = 'COMPLETED') AS "completedSessions",
         COALESCE((SELECT sum(l."repetitionsCompleted")::int FROM "AthleteDiveLog" l WHERE l."athleteId" = a.id), 0) AS volume,
         CASE WHEN (SELECT count(*) FROM "AthleteSessionCompletion" c WHERE c."athleteId" = a.id AND c.status = 'COMPLETED') = 0 THEN NULL
          ELSE COALESCE((SELECT sum(l."repetitionsCompleted")::numeric FROM "AthleteDiveLog" l WHERE l."athleteId" = a.id), 0) /
            (SELECT count(*)::numeric FROM "AthleteSessionCompletion" c WHERE c."athleteId" = a.id AND c.status = 'COMPLETED') END AS "averageVolume"
       FROM "Athlete" a JOIN "User" u ON u.id = a."userId" LEFT JOIN "TrainingGroup" g ON g.id = a."groupId"
       WHERE a."clubId" = $1 ORDER BY g.name ASC NULLS LAST, u."firstName" ASC`, [clubId]
    ),
    query<{ id: string; name: string }>(`SELECT id, name FROM "TrainingGroup" WHERE "clubId" = $1 ORDER BY name ASC`, [clubId])
  ]);
  const athletes = athletesResult.rows;
  const groups = groupsResult.rows;
  const athleteIds = athletes.map((athlete) => athlete.id);
  const sessions = athleteIds.length ? await query<{ athleteId: string; id: string; title: string; date: Date; status: string }>(
    `WITH candidates AS (
       SELECT s.id, s.title, s.date, s.status FROM "TrainingSession" s JOIN "TrainingWeek" w ON w.id = s."weekId"
       WHERE w."clubId" = $1 AND s.status = 'READY' AND s.date >= $2
         AND EXISTS (SELECT 1 FROM "SessionBlock" b JOIN "SessionBlockAssignment" a ON a."sessionBlockId" = b.id
                     WHERE b."sessionId" = s.id AND a."athleteId" = ANY($3::text[]))
       ORDER BY s.date ASC LIMIT 20
     )
     SELECT a."athleteId", c.id, c.title, c.date, c.status FROM candidates c
     JOIN "SessionBlock" b ON b."sessionId" = c.id JOIN "SessionBlockAssignment" a ON a."sessionBlockId" = b.id
     WHERE a."athleteId" = ANY($3::text[]) ORDER BY c.date ASC`,
    [clubId, startOfMontrealDay(), athleteIds]
  ) : { rows: [] as Array<{ athleteId: string; id: string; title: string; date: Date; status: string }> };

  const nextByAthlete = new Map<string, AthleteRow["nextSession"]>();
  sessions.rows.forEach((session) => {
    if (!nextByAthlete.has(session.athleteId)) {
      nextByAthlete.set(session.athleteId, { id: session.id, title: session.title, date: session.date, status: session.status });
    }
  });

  const rows: AthleteRow[] = athletes.map((athlete) => ({
      id: athlete.id,
      firstName: athlete.firstName,
      lastName: athlete.lastName,
      avatar: athlete.avatar,
      level: athlete.level,
      groupName: athlete.groupName ?? "Sans groupe",
      active: athlete.active,
      nextSession: nextByAthlete.get(athlete.id),
      lastActivity: athlete.lastActivity ?? undefined,
      volume: Number(athlete.volume),
      completedSessions: athlete.completedSessions,
      averageVolume: athlete.averageVolume === null ? null : Number(athlete.averageVolume)
    }));

  return (
    <CoachShell active="Athletes">
      <DirectoryHeader title="Athletes" description="Reperer rapidement les groupes, statuts et prochaines seances." actionHref="/coach/sessions/new" actionLabel="Creer une seance" />
      <AthleteAccountCard groups={groups} />
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
    nextSession: { id: "demo", title: athlete.lastSession, date: parseMontrealSessionDate("2026-08-25"), status: "READY" },
    lastActivity: athlete.lastSession,
    volume: athlete.recentVolume,
    completedSessions: 0,
    averageVolume: null
  }));

  return (
    <CoachShell active="Athletes">
      <DirectoryHeader title="Athletes" description="Mode demo local sans PostgreSQL." actionHref="/coach/sessions/demo" actionLabel="Voir la seance" />
      <AthleteAccountCard groups={[{ id: "provincial", name: "Provincial" }]} demo />
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

function AthleteAccountCard({ groups, demo = false }: { groups: AthleteGroup[]; demo?: boolean }) {
  return (
    <Card className="mb-6 overflow-hidden">
      <CardHeader className="border-b border-[var(--color-border)] bg-white">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--color-success-soft)] text-[var(--color-success)]">
            <UserPlus className="h-5 w-5" />
          </div>
          <div>
            <CardTitle>Créer un compte athlète</CardTitle>
            <CardDescription>Remets-lui son nom d’utilisateur et son mot de passe temporaire. Il devra choisir son propre mot de passe à sa première connexion.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-5">
        <CreateAthleteAccountForm groups={groups} disabled={demo} />
      </CardContent>
    </Card>
  );
}

function AthleteDirectory({ rows, demo = false }: { rows: AthleteRow[]; demo?: boolean }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Aucun athlete dans ce club"
        description="Crée un compte athlète pour démarrer la planification."
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
                <th className="px-4 py-3">Prochaine seance</th>
                <th className="px-4 py-3">Activite</th>
                <th className="px-5 py-3 text-right">Volume</th>
                <th className="px-5 py-3 text-right">Volume moyen / entraînement</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map((row) => (
                <tr key={row.id} className="transition duration-[var(--duration-fast)] hover:bg-[var(--color-surface-raised)]">
                  <td className="px-5 py-4"><Identity row={row} /></td>
                  <td className="px-4 py-4"><Badge variant="outline">{row.groupName}</Badge></td>
                  <td className="px-4 py-4"><NextSession nextSession={row.nextSession} demo={demo} /></td>
                  <td className="px-4 py-4"><ActivitySummary row={row} /></td>
                  <td className="px-5 py-4 text-right text-lg font-black">{row.volume}</td>
                  <td className="px-5 py-4 text-right text-lg font-black">{row.averageVolume === null ? "—" : row.averageVolume.toFixed(1)}</td>
                  <td className="px-5 py-4 text-right"><DeleteAthleteButton athleteId={row.id} demo={demo} /></td>
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
              <div className="mt-4"><DeleteAthleteButton athleteId={row.id} demo={demo} /></div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DeleteAthleteButton({ athleteId, demo }: { athleteId: string; demo: boolean }) {
  return (
    <form action={demo ? undefined : deleteAthlete}>
      <input type="hidden" name="athleteId" value={athleteId} />
      <Button type="submit" variant="outline" size="sm" disabled={demo} className="text-[var(--color-danger)] hover:border-[var(--color-danger)]">
        <Trash2 className="h-4 w-4" /> Supprimer
      </Button>
    </form>
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
        <Link href={`/coach/athletes/${row.id}`} className="block truncate font-black text-[var(--color-ink)] hover:text-[var(--color-brand-strong)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">
          {row.firstName} {row.lastName}
        </Link>
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
        {formatMontrealDate(nextSession.date, { weekday: "short", day: "2-digit", month: "short" })}
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
