import Link from "next/link";
import { Edit, Printer } from "lucide-react";
import { AthleteAvatarGroup } from "@/components/coach/athlete-avatar-group";
import { CoachShell } from "@/components/coach/coach-shell";
import { BlockTypeBadge } from "@/components/training/block-type-badge";
import { StatusPill } from "@/components/training/status-pill";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCoachSession } from "@/lib/coach-session";

export const dynamic = "force-dynamic";

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCoachSession(id);
  const athletes = session.blocks.flatMap((block) =>
    block.assignments.map((assignment) => ({
      id: assignment.athlete.id,
      firstName: assignment.athlete.user.firstName,
      lastName: assignment.athlete.user.lastName,
      avatar: assignment.athlete.user.avatar
    }))
  );
  const uniqueAthletes = Array.from(new Map(athletes.map((athlete) => [athlete.id, athlete])).values());

  return (
    <CoachShell active="Seances">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <StatusPill status={session.status} />
          <h1 className="mt-2 text-3xl font-black">{session.title}</h1>
          <p className="text-[var(--color-ink-muted)]">{session.date.toLocaleDateString("fr-CA")} · {session.duration} min · {session.focus}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link href={`/coach/sessions/${session.id}/edit`}><Edit className="h-4 w-4" /> Modifier</Link></Button>
          <Button asChild><Link href={`/coach/sessions/${session.id}/print`}><Printer className="h-4 w-4" /> Imprimer</Link></Button>
        </div>
      </div>
      <div className="space-y-4">
        {session.blocks.map((block) => {
          const assignedIds = block.assignments.map((assignment) => assignment.athleteId);

          return (
            <Card key={block.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <BlockTypeBadge type={block.type} />
                    <CardTitle className="mt-2">{block.title}</CardTitle>
                  </div>
                  <div className="flex items-center gap-3"><span className="text-sm font-semibold text-[var(--color-ink-muted)]">Attribue a {assignedIds.length}</span><AthleteAvatarGroup ids={assignedIds} athletes={uniqueAthletes} /></div>
                </div>
              </CardHeader>
              <CardContent>
                {block.drylandExercises.length > 0 && <div className="grid gap-2 md:grid-cols-3">{block.drylandExercises.map((item) => <div key={item.exerciseId} className="rounded-2xl bg-[var(--color-surface-raised)] p-3"><div className="font-bold">{item.exercise.name}</div><div className="text-sm text-[var(--color-ink-muted)]">{item.sets ?? 1} x {item.reps ?? `${item.duration ?? 30} sec`}</div></div>)}</div>}
                {block.poolTraining && <div className="grid gap-4 md:grid-cols-2">{block.poolTraining.sections.map((section) => <div key={section.id}><div className="mb-2 font-black">{(section.label ?? section.height).toUpperCase()}</div>{section.dives.map((dive) => <div key={dive.id} className="flex justify-between border-b border-[var(--color-border)] py-2"><span className="font-bold">{dive.diveCode} · {dive.diveName}</span><span>{dive.repetitions} reps</span></div>)}</div>)}</div>}
                <p className="mt-4 text-sm text-[var(--color-ink-muted)]">Athletes: {block.assignments.map((assignment) => `${assignment.athlete.user.firstName} ${assignment.athlete.user.lastName}`).join(", ")}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </CoachShell>
  );
}
