import type * as React from "react";
import Link from "next/link";
import { CalendarClock, Users, Waves } from "lucide-react";
import { CoachShell } from "@/components/coach/coach-shell";
import { AthleteAvatars } from "@/components/coach/athlete-avatars";
import { StatusPill } from "@/components/training/status-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireCoach } from "@/lib/current-user";
import { athletes as demoAthletes, demoSession } from "@/lib/data";
import { prisma } from "@/lib/prisma";
import { addMontrealDays, formatMontrealDate, startOfMontrealDay } from "@/lib/timezone";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const { clubId } = await requireCoach();

  if (clubId === "dev-club") {
    return <DemoGroupsPage />;
  }

  const groups = await prisma.trainingGroup.findMany({
    where: { clubId },
    orderBy: { name: "asc" },
    include: {
      coach: { include: { user: true } },
      athletes: {
        where: { active: true },
        include: {
          user: true,
          completions: {
            where: { status: { in: ["IN_PROGRESS", "SKIPPED"] } },
            select: { status: true },
            take: 1
          }
        },
        orderBy: { user: { firstName: "asc" } }
      },
      weeks: {
        include: {
          sessions: {
            where: { date: { gte: startOfMontrealDay() } },
            orderBy: { date: "asc" },
            take: 1
          }
        }
      }
    }
  });

  return (
    <CoachShell active="Groupes">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-black uppercase text-[var(--color-brand-strong)]">Groupes</p>
          <h1 className="mt-2 text-3xl font-black text-[var(--color-ink)]">Organisation bassin</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">Vue compacte des collectifs disponibles dans ce pilote.</p>
        </div>
        <Button asChild variant="action">
          <Link href="/coach/sessions/new">Preparer une seance</Link>
        </Button>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-[var(--color-border)] bg-[var(--color-surface-raised)]">
          <CardTitle>Groupes existants</CardTitle>
          <CardDescription>Les lignes deviennent des cartes sur mobile pour garder les actions tactiles.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {groups.length === 0 ? (
            <div className="p-5">
              <EmptyState title="Aucun groupe" description="Cree un groupe et assigne des athletes pour alimenter cette vue." />
            </div>
          ) : (
          <div className="hidden lg:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-white text-xs font-black uppercase text-[var(--color-ink-muted)]">
                <tr>
                  <th className="px-5 py-3">Groupe</th>
                  <th className="px-4 py-3">Athletes</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3">Prochaine seance</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => {
                  const nextSession = nextGroupSession(group);
                  const activeCount = group.athletes.length;
                  const watchCount = group.athletes.filter((athlete) => athlete.completions.length > 0).length;
                  const avatarAthletes = group.athletes.map((athlete) => ({
                    id: athlete.id,
                    firstName: athlete.user.firstName,
                    lastName: athlete.user.lastName,
                    avatar: athlete.user.avatar
                  }));

                  return (
                <tr key={group.id} className="border-t border-[var(--color-border)]">
                  <td className="px-5 py-4">
                    <div className="font-black text-[var(--color-ink)]">{group.name}</div>
                    <div className="text-xs font-bold text-[var(--color-ink-muted)]">Coach {group.coach.user.firstName} {group.coach.user.lastName}</div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <AthleteAvatars ids={avatarAthletes.map((athlete) => athlete.id)} athletes={avatarAthletes} limit={8} />
                      <span className="font-black">{activeCount}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="success">Actif</Badge>
                      {watchCount > 0 && <Badge variant="warning">{watchCount} a surveiller</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    {nextSession ? (
                      <div className="space-y-1">
                        <div className="font-black">{nextSession.title}</div>
                        <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-ink-muted)]">
                          <CalendarClock className="h-4 w-4" />
                          {formatMontrealDate(nextSession.date)} · {nextSession.duration} min
                          <StatusPill status={nextSession.status} className="min-h-6 px-2" />
                        </div>
                      </div>
                    ) : <span className="text-sm font-bold text-[var(--color-ink-muted)]">Aucune seance planifiee</span>}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Button asChild variant="outline">
                      <Link href={`/coach/groups/${group.id}`}>Ouvrir</Link>
                    </Button>
                  </td>
                </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}

          {groups.length > 0 && (
          <div className="p-4 lg:hidden">
            <div className="space-y-4">
            {groups.map((group) => {
              const nextSession = nextGroupSession(group);
              const activeCount = group.athletes.length;
              const watchCount = group.athletes.filter((athlete) => athlete.completions.length > 0).length;
              const avatarAthletes = group.athletes.map((athlete) => ({
                id: athlete.id,
                firstName: athlete.user.firstName,
                lastName: athlete.user.lastName,
                avatar: athlete.user.avatar
              }));

              return (
            <div key={group.id} className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black">{group.name}</h2>
                  <p className="mt-1 text-sm font-bold text-[var(--color-ink-muted)]">Coach {group.coach.user.firstName} {group.coach.user.lastName}</p>
                </div>
                <Badge variant="success">Actif</Badge>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <AthleteAvatars ids={avatarAthletes.map((athlete) => athlete.id)} athletes={avatarAthletes} limit={6} />
                <span className="text-sm font-black">{activeCount} athletes</span>
              </div>
              <div className="mt-4 grid gap-3 text-sm">
                <GroupMetric icon={<Waves className="h-4 w-4" />} label="Seance" value={nextSession?.title ?? "Aucune"} />
                <GroupMetric icon={<Users className="h-4 w-4" />} label="Statut" value={watchCount > 0 ? `${watchCount} a surveiller` : "Tous actifs"} />
              </div>
              <Button asChild className="mt-4 w-full" variant="action">
                <Link href={`/coach/groups/${group.id}`}>Ouvrir le groupe</Link>
              </Button>
            </div>
              );
            })}
            </div>
          </div>
          )}
        </CardContent>
      </Card>
    </CoachShell>
  );
}

function DemoGroupsPage() {
  const watchCount = demoAthletes.filter((athlete) => athlete.status === "surveiller").length;
  const nextSession = {
    title: demoSession.title,
    date: addMontrealDays(startOfMontrealDay(), 1),
    duration: demoSession.duration,
    status: "READY"
  };

  return (
    <CoachShell active="Groupes">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-black uppercase text-[var(--color-brand-strong)]">Groupes</p>
          <h1 className="mt-2 text-3xl font-black text-[var(--color-ink)]">Organisation bassin</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">Mode demo local sans PostgreSQL.</p>
        </div>
        <Button asChild variant="action">
          <Link href="/coach/sessions/demo">Ouvrir la seance demo</Link>
        </Button>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-[var(--color-border)] bg-[var(--color-surface-raised)]">
          <CardTitle>Groupes existants</CardTitle>
          <CardDescription>Les donnees demo restent locales tant qu&apos;une base PostgreSQL valide n&apos;est pas configuree.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="hidden lg:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-white text-xs font-black uppercase text-[var(--color-ink-muted)]">
                <tr>
                  <th className="px-5 py-3">Groupe</th>
                  <th className="px-4 py-3">Athletes</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3">Prochaine seance</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-[var(--color-border)]">
                  <td className="px-5 py-4">
                    <div className="font-black text-[var(--color-ink)]">{demoSession.group}</div>
                    <div className="text-xs font-bold text-[var(--color-ink-muted)]">Coach Felix Lavoie</div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <AthleteAvatars ids={demoAthletes.map((athlete) => athlete.id)} athletes={demoAthletes} limit={8} />
                      <span className="font-black">{demoAthletes.length}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="success">Actif</Badge>
                      {watchCount > 0 && <Badge variant="warning">{watchCount} a surveiller</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="space-y-1">
                      <div className="font-black">{nextSession.title}</div>
                      <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-ink-muted)]">
                        <CalendarClock className="h-4 w-4" />
                        {formatMontrealDate(nextSession.date)} · {nextSession.duration} min
                        <StatusPill status={nextSession.status} className="min-h-6 px-2" />
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Button asChild variant="outline">
                      <Link href="/coach/sessions/demo">Ouvrir</Link>
                    </Button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="p-4 lg:hidden">
            <div className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black">{demoSession.group}</h2>
                  <p className="mt-1 text-sm font-bold text-[var(--color-ink-muted)]">Coach Felix Lavoie</p>
                </div>
                <Badge variant="success">Actif</Badge>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <AthleteAvatars ids={demoAthletes.map((athlete) => athlete.id)} athletes={demoAthletes} limit={6} />
                <span className="text-sm font-black">{demoAthletes.length} athletes</span>
              </div>
              <div className="mt-4 grid gap-3 text-sm">
                <GroupMetric icon={<Waves className="h-4 w-4" />} label="Seance" value={nextSession.title} />
                <GroupMetric icon={<Users className="h-4 w-4" />} label="Statut" value={watchCount > 0 ? `${watchCount} a surveiller` : "Tous actifs"} />
              </div>
              <Button asChild className="mt-4 w-full" variant="action">
                <Link href="/coach/sessions/demo">Ouvrir le groupe</Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </CoachShell>
  );
}

type GroupWithRelations = Awaited<ReturnType<typeof prisma.trainingGroup.findMany>>[number] & {
  weeks: Array<{ sessions: Array<{ title: string; date: Date; duration: number; status: string }> }>;
};

function nextGroupSession(group: GroupWithRelations) {
  return group.weeks.flatMap((week) => week.sessions).sort((a, b) => Number(a.date) - Number(b.date))[0] ?? null;
}

function GroupMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-h-11 min-w-0 items-center justify-between gap-3 overflow-hidden rounded-[var(--radius-ui)] bg-[var(--color-surface-raised)] px-3">
      <span className="flex shrink-0 items-center gap-2 text-xs font-black uppercase text-[var(--color-ink-muted)]">{icon}{label}</span>
      <span className="min-w-0 truncate text-right font-bold">{value}</span>
    </div>
  );
}
