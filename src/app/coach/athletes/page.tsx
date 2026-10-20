import type { ReactNode } from "react";
import { Activity, CalendarDays, UserRound, UserPlus } from "lucide-react";
import { AthleteDirectory } from "@/app/coach/athletes/athlete-directory";
import { SeasonStatsButton } from "@/app/coach/athletes/season-stats-button";
import { CreateAthleteAccountForm } from "@/app/coach/athletes/create-athlete-account-form";
import { CoachShell } from "@/components/coach/coach-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { athletes as demoAthletes } from "@/lib/data";
import { requireCoach } from "@/lib/current-user";
import { query } from "@/lib/db";
import { avatarUrlForPage } from "@/lib/avatar";
import { resolveAvatarUrls } from "@/lib/avatar-storage";
import { parseMontrealSessionDate, startOfMontrealDay } from "@/lib/timezone";

export const dynamic = "force-dynamic";

export type AthleteRow = {
  id: string;
  firstName: string;
  lastName: string;
  avatar?: string | null;
  level: string;
  groupName: string;
  groupId?: string | null;
  birthDate?: string | null;
  active: boolean;
  nextSession?: { id: string; title: string; date: Date; status: string };
  lastActivity?: string;
  volume: number;
  completedSessions: number;
  averageVolume: number | null;
  competitionDivesAtLeastFive: number;
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
  const [athletesResult, groupsResult, competitionListResult] = await Promise.all([
      query<AthleteListResult & { groupId: string | null; birthDate: Date | null }>(
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
       SELECT a.id, u."firstName", u."lastName", u.avatar, a.level, a."groupId", a."birthDate", g.name AS "groupName", a.active,
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
    query<{ id: string; name: string }>(`SELECT id, name FROM "TrainingGroup" WHERE "clubId" = $1 ORDER BY name ASC`, [clubId]),
    query<{ athleteId: string; diveCount: number }>(
      `WITH dive_volumes AS (
         SELECT l."athleteId", d."diveCode", s.height, s.label AS "heightLabel", SUM(l."repetitionsCompleted")::int AS volume
         FROM "AthleteDiveLog" l
         JOIN "PoolDive" d ON d.id = l."poolDiveId"
         JOIN "PoolSection" s ON s.id = d."poolSectionId"
         GROUP BY l."athleteId", d."diveCode", s.height, s.label
       ), competition_dive_volumes AS (
         SELECT cd.id, cd."athleteId", COALESCE(SUM(dv.volume), 0)::int AS volume
         FROM "CompetitionDiveList" cl
         JOIN "CompetitionDive" cd ON cd."listId" = cl.id
         LEFT JOIN dive_volumes dv ON dv."athleteId" = cd."athleteId" AND dv."diveCode" = cd."diveCode"
           AND CASE
             WHEN cd.height <> 'PLATFORM' THEN dv.height = cd.height
             WHEN dv.height NOT IN ('PLATFORM', 'CUSTOM') THEN FALSE
             WHEN dv.height = 'PLATFORM' AND dv."heightLabel" IS NULL THEN TRUE
             WHEN cd."platformHeight" IS NULL THEN FALSE
             ELSE (regexp_match(lower(replace(COALESCE(dv."heightLabel", ''), ',', '.')), '(3|5|7\\.5|10)\\s*m(?:t)?'))[1] = cd."platformHeight"::text
           END
         WHERE cl.name = 'Liste de compétition'
         GROUP BY cd.id, cd."athleteId"
       )
       SELECT "athleteId", COUNT(*) FILTER (WHERE volume >= 5)::int AS "diveCount"
       FROM competition_dive_volumes
       GROUP BY "athleteId"`, []
    )
  ]);
  const athletes = athletesResult.rows;
  const athleteAvatarUrls = await resolveAvatarUrls(athletes.map((athlete) => athlete.avatar));
  const groups = groupsResult.rows;
  const competitionDiveCountByAthlete = new Map(competitionListResult.rows.map((row) => [row.athleteId, Number(row.diveCount)]));
  const athleteIds = athletes.map((athlete) => athlete.id);
  const today = startOfMontrealDay();
  const seasonStartYear = today.getMonth() >= 8 ? today.getFullYear() : today.getFullYear() - 1;
  const seasonLabel = `${seasonStartYear}-${seasonStartYear + 1}`;
  const seasonStart = parseMontrealSessionDate(`${seasonStartYear}-09-01`, "00:00");
  const seasonEnd = parseMontrealSessionDate(`${seasonStartYear + 1}-09-01`, "00:00");
  const [sessions, seasonStatsResult, allTimeSessionStatsResult] = await Promise.all([athleteIds.length ? query<{ athleteId: string; id: string; title: string; date: Date; status: string }>(
    `SELECT DISTINCT ON (assignment."athleteId") assignment."athleteId", s.id, s.title, s.date, s.status
     FROM "TrainingSession" s
     JOIN "TrainingWeek" w ON w.id = s."weekId"
     JOIN "SessionBlock" block ON block."sessionId" = s.id
     JOIN "SessionBlockAssignment" assignment ON assignment."sessionBlockId" = block.id
     WHERE w."clubId" = $1 AND s.status = 'READY' AND s.date >= $2
       AND assignment."athleteId" = ANY($3::text[])
     ORDER BY assignment."athleteId", s.date ASC, s.id`,
    [clubId, startOfMontrealDay(), athleteIds]
  ) : Promise.resolve({ rows: [] as Array<{ athleteId: string; id: string; title: string; date: Date; status: string }> }),
  query<{ volume: number; completedSessions: number }>(
    `SELECT
       (SELECT COALESCE(SUM(l."repetitionsCompleted"),0)::int FROM "AthleteDiveLog" l JOIN "TrainingSession" s ON s.id=l."sessionId" JOIN "TrainingWeek" w ON w.id=s."weekId" WHERE w."clubId"=$1 AND s.date >= $2 AND s.date < $3) AS volume,
       (SELECT COUNT(DISTINCT s.id)::int FROM "TrainingSession" s JOIN "TrainingWeek" w ON w.id=s."weekId"
        WHERE w."clubId"=$1 AND s.date >= $2 AND s.date < $3
          AND EXISTS (SELECT 1 FROM "AthleteDiveLog" l WHERE l."sessionId"=s.id AND l."repetitionsCompleted" >= 1)) AS "completedSessions"`,
    [clubId, seasonStart, seasonEnd]
  ),
  query<{ completedSessions: number }>(
    `SELECT COUNT(DISTINCT s.id)::int AS "completedSessions"
     FROM "TrainingSession" s JOIN "TrainingWeek" w ON w.id=s."weekId"
     WHERE w."clubId"=$1
       AND EXISTS (SELECT 1 FROM "AthleteDiveLog" l WHERE l."sessionId"=s.id AND l."repetitionsCompleted" >= 1)`,
    [clubId]
  )]);

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
      groupId: athlete.groupId,
      birthDate: athlete.birthDate?.toLocaleDateString("en-CA", { timeZone: "UTC" }) ?? null,
      active: athlete.active,
      nextSession: nextByAthlete.get(athlete.id),
      lastActivity: athlete.lastActivity ?? undefined,
      volume: Number(athlete.volume),
      completedSessions: athlete.completedSessions,
      averageVolume: athlete.averageVolume === null ? null : Number(athlete.averageVolume),
      competitionDivesAtLeastFive: competitionDiveCountByAthlete.get(athlete.id) ?? 0
    }));
  const groupStats = groups.map((group) => ({ name: group.name, athletes: rows.filter((row) => row.groupId === group.id).length }));
  const ungroupedAthletes = rows.filter((row) => !row.groupId).length;
  if (ungroupedAthletes > 0) groupStats.push({ name: "Sans groupe", athletes: ungroupedAthletes });

  return (
    <CoachShell active="Athletes">
      <div className="athlete-directory-page">
      <DirectoryHeader title="Athlètes" description="Suivez votre groupe et accédez aux profils" season={seasonLabel} groups={groupStats} volume={Number(seasonStatsResult.rows[0]?.volume ?? 0)} completedSessions={Number(seasonStatsResult.rows[0]?.completedSessions ?? 0)} />
      <DirectoryStats rows={rows} completedSessions={Number(allTimeSessionStatsResult.rows[0]?.completedSessions ?? 0)} />
      <AthleteAccountCard groups={groups} />
      <AthleteDirectory rows={rows} groups={groups} />
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
    averageVolume: null,
    competitionDivesAtLeastFive: 0
  }));

  return (
    <CoachShell active="Athletes">
      <div className="athlete-directory-page">
      <DirectoryHeader title="Athlètes" description="Suivez votre groupe et accédez aux profils" season={currentSeasonLabel()} groups={[{ name: "Provincial", athletes: rows.length }]} volume={rows.reduce((sum, row) => sum + row.volume, 0)} completedSessions={rows.reduce((sum, row) => sum + row.completedSessions, 0)} />
      <DirectoryStats rows={rows} completedSessions={0} />
      <AthleteAccountCard groups={[{ id: "provincial", name: "Provincial" }]} demo />
      <AthleteDirectory rows={rows} groups={[{ id: "provincial", name: "Provincial" }]} demo />
      </div>
    </CoachShell>
  );
}

function DirectoryHeader({ title, description, season, groups, volume, completedSessions }: { title: string; description: string; season: string; groups: Array<{ name: string; athletes: number }>; volume: number; completedSessions: number }) {
  return (
    <div className="athlete-directory-hero">
      <div className="athlete-directory-title">
        <h1>{title}</h1>
        <p>{description}</p>
        <span className="athlete-directory-season">Saison {season}</span>
      </div>
      <SeasonStatsButton season={season} groups={groups} volume={volume} completedSessions={completedSessions} />
    </div>
  );
}

function DirectoryStats({ rows, completedSessions }: { rows: AthleteRow[]; completedSessions: number }) {
  const volume = rows.reduce((total, row) => total + row.volume, 0);
  return <section className="athlete-directory-stats" aria-label="Statistiques du groupe">
    <Stat icon={<UserRound />} value={rows.filter((row) => row.active).length} label="athlètes actifs" />
    <Stat icon={<CalendarDays />} value={completedSessions} label="séances complétées" />
    <Stat icon={<Activity />} value={volume.toLocaleString("fr-CA")} label="répétitions" />
  </section>;
}

function Stat({ icon, value, label }: { icon: ReactNode; value: number | string; label: string }) {
  return <div className="athlete-directory-stat"><span className="athlete-directory-stat-icon">{icon}</span><strong>{value}</strong><span>{label}</span></div>;
}

function currentSeasonLabel() {
  const today = startOfMontrealDay();
  const startYear = today.getMonth() >= 8 ? today.getFullYear() : today.getFullYear() - 1;
  return `${startYear}-${startYear + 1}`;
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
