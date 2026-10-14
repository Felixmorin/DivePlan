import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Activity, CalendarDays, Plus, UserRound, UserPlus } from "lucide-react";
import { DeleteAthleteButton } from "@/app/coach/athletes/delete-athlete-button";
import { CreateAthleteAccountForm } from "@/app/coach/athletes/create-athlete-account-form";
import { CoachShell } from "@/components/coach/coach-shell";
import { StatusPill } from "@/components/training/status-pill";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { athletes as demoAthletes } from "@/lib/data";
import { requireCoach } from "@/lib/current-user";
import { query } from "@/lib/db";
import { avatarUrlForPage } from "@/lib/avatar";
import { resolveAvatarUrls } from "@/lib/avatar-storage";
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
      `WITH completion_stats AS (
         SELECT "athleteId", count(*) FILTER (WHERE status = 'COMPLETED')::int AS completed_sessions
         FROM "AthleteSessionCompletion" GROUP BY "athleteId"
       ), latest_activity AS (
         SELECT DISTINCT ON (c."athleteId") c."athleteId", s.title
         FROM "AthleteSessionCompletion" c JOIN "TrainingSession" s ON s.id = c."sessionId"
         WHERE c.status = 'COMPLETED'
         ORDER BY c."athleteId", c."completedAt" DESC NULLS LAST, c."startedAt" DESC NULLS LAST
       ), volume_stats AS (
         SELECT "athleteId", sum("repetitionsCompleted")::int AS volume
         FROM "AthleteDiveLog" GROUP BY "athleteId"
       )
       SELECT a.id, u."firstName", u."lastName", u.avatar, a.level, g.name AS "groupName", a.active,
         latest_activity.title AS "lastActivity", COALESCE(completion_stats.completed_sessions, 0) AS "completedSessions",
         COALESCE(volume_stats.volume, 0) AS volume,
         CASE WHEN COALESCE(completion_stats.completed_sessions, 0) = 0 THEN NULL
           ELSE COALESCE(volume_stats.volume, 0)::numeric / completion_stats.completed_sessions END AS "averageVolume"
       FROM "Athlete" a JOIN "User" u ON u.id = a."userId" LEFT JOIN "TrainingGroup" g ON g.id = a."groupId"
       LEFT JOIN completion_stats ON completion_stats."athleteId" = a.id
       LEFT JOIN latest_activity ON latest_activity."athleteId" = a.id
       LEFT JOIN volume_stats ON volume_stats."athleteId" = a.id
       WHERE a."clubId" = $1 ORDER BY g.name ASC NULLS LAST, u."firstName" ASC`, [clubId]
    ),
    query<{ id: string; name: string }>(`SELECT id, name FROM "TrainingGroup" WHERE "clubId" = $1 ORDER BY name ASC`, [clubId])
  ]);
  const athletes = athletesResult.rows;
  const athleteAvatarUrls = await resolveAvatarUrls(athletes.map((athlete) => athlete.avatar));
  const groups = groupsResult.rows;
  const athleteIds = athletes.map((athlete) => athlete.id);
  const sessions = athleteIds.length ? await query<{ athleteId: string; id: string; title: string; date: Date; status: string }>(
    `SELECT DISTINCT ON (assignment."athleteId") assignment."athleteId", s.id, s.title, s.date, s.status
     FROM "TrainingSession" s
     JOIN "TrainingWeek" w ON w.id = s."weekId"
     JOIN "SessionBlock" block ON block."sessionId" = s.id
     JOIN "SessionBlockAssignment" assignment ON assignment."sessionBlockId" = block.id
     WHERE w."clubId" = $1 AND s.status = 'READY' AND s.date >= $2
       AND assignment."athleteId" = ANY($3::text[])
     ORDER BY assignment."athleteId", s.date ASC, s.id`,
    [clubId, startOfMontrealDay(), athleteIds]
  ) : { rows: [] as Array<{ athleteId: string; id: string; title: string; date: Date; status: string }> };

  const nextByAthlete = new Map<string, AthleteRow["nextSession"]>();
  sessions.rows.forEach((session) => {
    if (!nextByAthlete.has(session.athleteId)) {
      nextByAthlete.set(session.athleteId, { id: session.id, title: session.title, date: session.date, status: session.status });
    }
  });

  const rows: AthleteRow[] = athletes.map((athlete, index) => ({
      id: athlete.id,
      firstName: athlete.firstName,
      lastName: athlete.lastName,
      avatar: athleteAvatarUrls[index] ?? avatarUrlForPage(athlete.avatar),
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
      <div className="athlete-directory-page">
      <DirectoryHeader title="Athlètes" description="Suivez votre groupe et accédez aux profils" actionHref="/coach/sessions/new" actionLabel="Créer une séance" />
      <DirectoryStats rows={rows} />
      <AthleteAccountCard groups={groups} />
      <AthleteDirectory rows={rows} />
      </div>
    </CoachShell>
  );
}

function DemoAthletesPage() {
  const rows: AthleteRow[] = demoAthletes.map((athlete) => ({
    id: athlete.id,
    firstName: athlete.firstName,
    lastName: athlete.lastName,
    avatar: avatarUrlForPage(athlete.avatar),
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
      <div className="athlete-directory-page">
      <DirectoryHeader title="Athlètes" description="Suivez votre groupe et accédez aux profils" actionHref="/coach/sessions/demo" actionLabel="Voir la séance" />
      <DirectoryStats rows={rows} />
      <AthleteAccountCard groups={[{ id: "provincial", name: "Provincial" }]} demo />
      <AthleteDirectory rows={rows} demo />
      </div>
    </CoachShell>
  );
}

function DirectoryHeader({ title, description, actionHref, actionLabel }: { title: string; description: string; actionHref: string; actionLabel: string }) {
  return (
    <div className="athlete-directory-hero">
      <div className="athlete-directory-title">
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <Button asChild variant="action">
        <Link href={actionHref}><Plus className="h-4 w-4" /> {actionLabel}</Link>
      </Button>
    </div>
  );
}

function DirectoryStats({ rows }: { rows: AthleteRow[] }) {
  const sessions = rows.reduce((total, row) => total + row.completedSessions, 0);
  const volume = rows.reduce((total, row) => total + row.volume, 0);
  return <section className="athlete-directory-stats" aria-label="Statistiques du groupe">
    <Stat icon={<UserRound />} value={rows.filter((row) => row.active).length} label="athlètes actifs" />
    <Stat icon={<CalendarDays />} value={sessions} label="séances complétées" />
    <Stat icon={<Activity />} value={volume.toLocaleString("fr-CA")} label="répétitions" />
  </section>;
}

function Stat({ icon, value, label }: { icon: ReactNode; value: number | string; label: string }) {
  return <div className="athlete-directory-stat"><span className="athlete-directory-stat-icon">{icon}</span><strong>{value}</strong><span>{label}</span></div>;
}

function AthleteAccountCard({ groups, demo = false }: { groups: AthleteGroup[]; demo?: boolean }) {
  return (
    <Card className="athlete-account-card mb-4 overflow-hidden">
      <CardHeader className="athlete-directory-card-heading border-b border-[var(--color-border)] bg-white">
        <div><CardTitle>Ajouter un athlète</CardTitle><CardDescription>Créez un nouveau compte athlète rapidement</CardDescription></div>
        <UserPlus className="h-5 w-5" />
      </CardHeader>
      <CardContent className="p-4">
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
    <Card className="athlete-list-card overflow-hidden">
      <CardHeader className="athlete-list-heading border-b border-[var(--color-border)] bg-white">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="athlete-list-title">
            <CardTitle>Votre groupe</CardTitle>
            <CardDescription>{rows.length} athlètes</CardDescription>
          </div>
          <div className="athlete-list-controls"><label className="athlete-search"><span className="sr-only">Rechercher un athlète</span><input type="search" placeholder="Rechercher un athlète…" /></label><select aria-label="Tous les groupes"><option>Tous les groupes</option></select><select aria-label="Tous les niveaux"><option>Tous les niveaux</option></select></div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="hidden grid-cols-[minmax(15rem,1.3fr)_minmax(7rem,.7fr)_minmax(13rem,1fr)_minmax(11rem,1fr)_6rem_9rem_7rem] border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] px-5 py-3 text-xs font-black uppercase text-[var(--color-ink-muted)] lg:grid">
          <span>Athlète</span><span>Groupe</span><span>Prochaine séance</span><span>Activité</span><span className="text-right">Volume</span><span className="text-right">Moy. / séance</span><span className="text-right">Actions</span>
        </div>
        <div className="divide-y divide-[var(--color-border)]">
          {rows.map((row) => (
            <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 p-4 transition duration-[var(--duration-fast)] hover:bg-[var(--color-surface-raised)] lg:grid-cols-[minmax(15rem,1.3fr)_minmax(7rem,.7fr)_minmax(13rem,1fr)_minmax(11rem,1fr)_6rem_9rem_7rem] lg:px-5">
              <div className="min-w-0"><Identity row={row} /></div>
              <div className="lg:hidden"><Badge variant={row.active ? "success" : "outline"}>{row.active ? "Actif" : "Inactif"}</Badge></div>
              <div className="col-span-2 lg:col-span-1"><Badge variant="outline">{row.groupName}</Badge></div>
              <div className="col-span-2 lg:col-span-1"><NextSession nextSession={row.nextSession} demo={demo} /></div>
              <div className="col-span-2 lg:col-span-1"><ActivitySummary row={row} /></div>
              <div className="athlete-volume"><span className="mr-2 text-xs font-bold text-[var(--color-ink-muted)] lg:hidden">Volume</span><strong>{row.volume}</strong><i style={{ "--volume": `${Math.max(10, Math.min(100, row.volume / Math.max(...rows.map((item) => item.volume), 1) * 100))}%` } as CSSProperties} /></div>
              <div className="text-lg font-black lg:text-right"><span className="mr-2 text-xs font-bold text-[var(--color-ink-muted)] lg:hidden">Moyenne</span>{row.averageVolume === null ? "—" : row.averageVolume.toFixed(1)}</div>
              <div className="col-span-2 lg:col-span-1 lg:text-right"><DeleteAthleteButton athleteId={row.id} demo={demo} compact /></div>
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
