import type * as React from "react";
import Link from "next/link";
import { CalendarClock, Users, Waves } from "lucide-react";
import { CoachShell } from "@/components/coach/coach-shell";
import { AthleteAvatars } from "@/components/coach/athlete-avatars";
import { StatusPill } from "@/components/training/status-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { athletes, demoSession } from "@/lib/data";

export default function GroupsPage() {
  const activeCount = athletes.length;
  const watchCount = athletes.filter((athlete) => athlete.status === "surveiller").length;

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
                    <div className="font-black text-[var(--color-ink)]">Provincial</div>
                    <div className="text-xs font-bold text-[var(--color-ink-muted)]">Coach Felix Lavoie</div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <AthleteAvatars ids={athletes.map((athlete) => athlete.id)} limit={8} />
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
                    <div className="space-y-1">
                      <div className="font-black">{demoSession.title}</div>
                      <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-ink-muted)]">
                        <CalendarClock className="h-4 w-4" />
                        {demoSession.date} · {demoSession.duration} min
                        <StatusPill status="READY" className="min-h-6 px-2" />
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Button asChild variant="outline">
                      <Link href="/coach/groups/provincial">Ouvrir</Link>
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
                  <h2 className="text-xl font-black">Provincial</h2>
                  <p className="mt-1 text-sm font-bold text-[var(--color-ink-muted)]">Coach Felix Lavoie</p>
                </div>
                <Badge variant="success">Actif</Badge>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <AthleteAvatars ids={athletes.map((athlete) => athlete.id)} limit={6} />
                <span className="text-sm font-black">{activeCount} athletes</span>
              </div>
              <div className="mt-4 grid gap-3 text-sm">
                <GroupMetric icon={<Waves className="h-4 w-4" />} label="Seance" value={demoSession.title} />
                <GroupMetric icon={<Users className="h-4 w-4" />} label="Statut" value={watchCount > 0 ? `${watchCount} a surveiller` : "Tous actifs"} />
              </div>
              <Button asChild className="mt-4 w-full" variant="action">
                <Link href="/coach/groups/provincial">Ouvrir le groupe</Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </CoachShell>
  );
}

function GroupMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-h-11 min-w-0 items-center justify-between gap-3 overflow-hidden rounded-[var(--radius-ui)] bg-[var(--color-surface-raised)] px-3">
      <span className="flex shrink-0 items-center gap-2 text-xs font-black uppercase text-[var(--color-ink-muted)]">{icon}{label}</span>
      <span className="min-w-0 truncate text-right font-bold">{value}</span>
    </div>
  );
}
