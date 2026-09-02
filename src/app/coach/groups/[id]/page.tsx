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
import { prisma } from "@/lib/prisma";
import { formatMontrealDate } from "@/lib/timezone";

export const dynamic = "force-dynamic";

type GroupAthlete = {
  id: string;
  level: string;
  user: { firstName: string; lastName: string; avatar: string | null };
  completions: Array<{ status: string; session: { title: string; date: Date } }>;
  diveLogs: Array<{ repetitionsCompleted: number }>;
};

export default async function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, { clubId }] = await Promise.all([params, requireCoach()]);
  const group = await prisma.trainingGroup.findFirst({
    where: { id, clubId },
    include: {
      athletes: {
        where: { active: true },
        include: {
          user: true,
          completions: {
            orderBy: [{ completedAt: "desc" }, { startedAt: "desc" }],
            take: 1,
            include: { session: { select: { title: true, date: true } } }
          },
          diveLogs: {
            where: { session: { week: { clubId } } },
            select: { repetitionsCompleted: true }
          }
        },
        orderBy: { user: { firstName: "asc" } }
      }
    }
  });

  if (!group) {
    notFound();
  }

  const athletes = group.athletes.map(toGroupAthlete);
  const watchCount = athletes.filter((athlete) => athlete.completions.some((completion) => completion.status === "IN_PROGRESS" || completion.status === "SKIPPED")).length;
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

function toGroupAthlete(athlete: GroupAthlete) {
  const latestCompletion = athlete.completions[0];
  const recentVolume = athlete.diveLogs.reduce((sum, log) => sum + log.repetitionsCompleted, 0);

  return {
    id: athlete.id,
    firstName: athlete.user.firstName,
    lastName: athlete.user.lastName,
    avatar: athlete.user.avatar,
    level: athlete.level,
    completions: athlete.completions,
    watch: latestCompletion?.status === "IN_PROGRESS" || latestCompletion?.status === "SKIPPED",
    lastActivity: latestCompletion ? `${latestCompletion.session.title} · ${formatMontrealDate(latestCompletion.session.date)}` : "Aucune activite",
    recentVolume
  };
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

function AthleteIdentity({ athlete, groupName }: { athlete: ReturnType<typeof toGroupAthlete>; groupName: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="h-11 w-11 border border-[var(--color-border)]">
        <AvatarImage src={athlete.avatar ?? undefined} />
        <AvatarFallback>{athlete.firstName[0]}{athlete.lastName[0]}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="truncate font-black">{athlete.firstName} {athlete.lastName}</div>
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
