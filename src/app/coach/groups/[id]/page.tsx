import type * as React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, CheckSquare, Dumbbell, Plus } from "lucide-react";
import { CoachShell } from "@/components/coach/coach-shell";
import { AthleteAvatarGroup } from "@/components/coach/athlete-avatar-group";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCoach } from "@/lib/current-user";
import { query } from "@/lib/db";
import { formatMontrealDate } from "@/lib/timezone";

export const dynamic = "force-dynamic";

export default async function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, { clubId }] = await Promise.all([params, requireCoach()]);
  type AthleteResult = { id: string; level: string; firstName: string; lastName: string; avatar: string | null; status: string | null; sessionTitle: string | null; sessionDate: Date | null; recentVolume: number };
  const result = await query<AthleteResult & { groupId: string; groupName: string }>(
    `SELECT g.id AS "groupId", g.name AS "groupName", a.id, a.level, u."firstName", u."lastName", u.avatar,
       latest.status, latest."sessionTitle", latest."sessionDate",
       COALESCE((SELECT sum(l."repetitionsCompleted")::int FROM "AthleteDiveLog" l
         JOIN "TrainingSession" s ON s.id = l."sessionId" JOIN "TrainingWeek" w ON w.id = s."weekId"
         WHERE l."athleteId" = a.id AND w."clubId" = $2), 0) AS "recentVolume"
     FROM "TrainingGroup" g
     LEFT JOIN "Athlete" a ON a."groupId" = g.id AND a.active = true
     LEFT JOIN "User" u ON u.id = a."userId"
     LEFT JOIN LATERAL (
       SELECT c.status, s.title AS "sessionTitle", s.date AS "sessionDate"
       FROM "AthleteSessionCompletion" c JOIN "TrainingSession" s ON s.id = c."sessionId"
       WHERE c."athleteId" = a.id ORDER BY c."completedAt" DESC, c."startedAt" DESC LIMIT 1
     ) latest ON true
     WHERE g.id = $1 AND g."clubId" = $2 ORDER BY u."firstName" ASC`, [id, clubId]
  );
  const firstRow = result.rows[0];

  if (!firstRow) {
    notFound();
  }

  const group = { id: firstRow.groupId, name: firstRow.groupName };
  const athletes = result.rows.filter((row) => row.id !== null).map((row) => ({
    id: row.id, level: row.level, firstName: row.firstName, lastName: row.lastName, avatar: row.avatar,
    watch: row.status === "IN_PROGRESS" || row.status === "SKIPPED",
    lastActivity: row.sessionTitle && row.sessionDate ? `${row.sessionTitle} · ${formatMontrealDate(row.sessionDate)}` : "Aucune activite",
    recentVolume: Number(row.recentVolume)
  }));
  const watchCount = athletes.filter((athlete) => athlete.watch).length;
  const totalVolume = athletes.reduce((sum, athlete) => sum + athlete.recentVolume, 0);

  return (
    <CoachShell active="Groupes">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-black uppercase text-[var(--color-brand-strong)]">Groupe</p>
          <h1 className="mt-2 text-3xl font-black text-[var(--color-ink)]">{group.name}</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">Sélection multiple pour préparer une séance à partir du collectif.</p>
        </div>
        <Button asChild variant="action">
          <Link href="/coach/sessions/new"><Plus className="h-4 w-4" /> Nouvelle seance</Link>
        </Button>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <GroupStat icon={<Activity className="h-5 w-5" />} label="Athletes actifs" value={athletes.length} />
        <GroupStat icon={<Dumbbell className="h-5 w-5" />} label="A surveiller" value={watchCount} tone="warning" />
        <GroupStat icon={<CheckSquare className="h-5 w-5" />} label="Volume disponible" value={totalVolume} />
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-[var(--color-border)] bg-[var(--color-surface-raised)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Effectif</CardTitle>
              <CardDescription>Les athlètes sont lisibles par statut et volume sans ajouter de filtre artificiel.</CardDescription>
            </div>
            <AthleteAvatarGroup ids={athletes.map((athlete) => athlete.id)} athletes={athletes} limit={8} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="hidden lg:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-white text-xs font-black uppercase text-[var(--color-ink-muted)]">
                <tr>
                  <th className="px-5 py-3">Sélection</th>
                  <th className="px-4 py-3">Athlete</th>
                  <th className="px-4 py-3">Niveau</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3">Derniere activite</th>
                  <th className="px-5 py-3 text-right">Volume</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {athletes.map((athlete) => (
                  <tr key={athlete.id} className="transition duration-[var(--duration-fast)] hover:bg-[var(--color-surface-raised)]">
                    <td className="px-5 py-4">
                      <input type="checkbox" className="h-5 w-5 rounded border-[var(--color-border-strong)] text-[var(--color-brand)] focus-visible:shadow-[var(--focus-ring)]" aria-label={`Selectionner ${athlete.firstName} ${athlete.lastName}`} />
                    </td>
                    <td className="px-4 py-4"><AthleteIdentity athlete={athlete} groupName={group.name} /></td>
                    <td className="px-4 py-4 font-bold">{athlete.level}</td>
                    <td className="px-4 py-4"><Badge variant={athlete.watch ? "warning" : "success"}>{athlete.watch ? "à surveiller" : "actif"}</Badge></td>
                    <td className="px-4 py-4 text-[var(--color-ink-muted)]">{athlete.lastActivity}</td>
                    <td className="px-5 py-4 text-right text-lg font-black">{athlete.recentVolume}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-[var(--color-border)] lg:hidden">
            {athletes.map((athlete) => (
              <div key={athlete.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <label className="flex min-w-0 items-center gap-3">
                    <input type="checkbox" className="h-5 w-5 rounded border-[var(--color-border-strong)]" aria-label={`Selectionner ${athlete.firstName} ${athlete.lastName}`} />
                    <AthleteIdentity athlete={athlete} groupName={group.name} />
                  </label>
                  <Badge variant={athlete.watch ? "warning" : "success"}>{athlete.watch ? "à surveiller" : "actif"}</Badge>
                </div>
                <div className="mt-4 grid gap-3 text-sm">
                  <GroupMetric label="Niveau" value={athlete.level} />
                  <GroupMetric label="Activite" value={athlete.lastActivity} />
                  <GroupMetric label="Volume" value={`${athlete.recentVolume} reps`} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </CoachShell>
  );
}

function GroupStat({ icon, label, value, tone = "pool" }: { icon: React.ReactNode; label: string; value: number; tone?: "pool" | "warning" }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={tone === "warning" ? "flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--block-dryland-bg)] text-[var(--block-dryland-fg)]" : "flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--block-pool-bg)] text-[var(--block-pool-fg)]"}>
          {icon}
        </div>
        <div>
          <div className="text-2xl font-black">{value}</div>
          <div className="text-xs font-black uppercase text-[var(--color-ink-muted)]">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function AthleteIdentity({ athlete, groupName }: { athlete: { id: string; firstName: string; lastName: string; avatar: string | null }; groupName: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="h-11 w-11 border border-[var(--color-border)]">
        <AvatarImage src={athlete.avatar ?? undefined} />
        <AvatarFallback>{athlete.firstName[0]}{athlete.lastName[0]}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <Link href={`/coach/athletes/${athlete.id}`} className="block truncate font-black hover:text-[var(--color-brand-strong)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">
          {athlete.firstName} {athlete.lastName}
        </Link>
        <div className="truncate text-xs font-bold text-[var(--color-ink-muted)]">{groupName}</div>
      </div>
    </div>
  );
}

function GroupMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 rounded-[var(--radius-ui)] bg-[var(--color-surface-raised)] px-3">
      <span className="text-xs font-black uppercase text-[var(--color-ink-muted)]">{label}</span>
      <span className="min-w-0 truncate text-right font-bold">{value}</span>
    </div>
  );
}
