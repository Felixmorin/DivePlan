import Link from "next/link";
import { notFound } from "next/navigation";
import { Edit, Printer } from "lucide-react";
import { AthleteAvatarGroup } from "@/components/coach/athlete-avatar-group";
import { CoachShell } from "@/components/coach/coach-shell";
import { BlockTypeBadge } from "@/components/training/block-type-badge";
import { StatusPill } from "@/components/training/status-pill";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { athleteName, demoSession } from "@/lib/data";
import { demoRoutesEnabled } from "@/lib/demo-routes";

export default function SessionDetailPage() {
  if (!demoRoutesEnabled()) {
    notFound();
  }

  return (
    <CoachShell active="Seances">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <StatusPill status={demoSession.status} />
          <h1 className="mt-2 text-3xl font-black text-[var(--color-ink)]">{demoSession.title}</h1>
          <p className="mt-1 text-sm leading-6 text-[var(--color-ink-muted)]">{demoSession.date} · {demoSession.duration} min · {demoSession.focus}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button asChild variant="outline"><Link href="/coach/sessions/demo/edit"><Edit className="h-4 w-4" /> Modifier</Link></Button>
          <Button asChild variant="action"><Link href="/coach/sessions/demo/print"><Printer className="h-4 w-4" /> Imprimer</Link></Button>
        </div>
      </div>
      <div className="space-y-4">
        {demoSession.blocks.map((block) => (
          <Card key={block.id}>
            <CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><BlockTypeBadge type={block.type} /><CardTitle className="mt-2">{block.title}</CardTitle></div><div className="flex items-center gap-3"><span className="text-sm font-semibold text-[var(--color-ink-muted)]">Attribué à {block.assignedTo.length}</span><AthleteAvatarGroup ids={block.assignedTo} /></div></div></CardHeader>
            <CardContent>
              {block.exercises && <div className="grid gap-2 md:grid-cols-3">{block.exercises.map((exercise) => <div key={exercise.name} className="rounded-2xl bg-[var(--color-surface-raised)] p-3"><div className="font-bold">{exercise.name}</div><div className="text-sm text-[var(--color-ink-muted)]">{exercise.sets} x {exercise.reps ?? exercise.duration}</div></div>)}</div>}
              {block.pool && <div className="grid gap-4 md:grid-cols-2">{[["1 metre", block.pool.oneMeter], ["3 metres", block.pool.threeMeter]].map(([height, dives]) => <div key={String(height)}><div className="mb-2 font-black">{String(height).toUpperCase()}</div>{(dives as typeof block.pool.oneMeter).map((dive) => <div key={dive.code} className="flex justify-between border-b border-[var(--color-border)] py-2"><span className="font-bold">{dive.code} · {dive.name}</span><span>{dive.reps} reps</span></div>)}</div>)}</div>}
              <p className="mt-4 break-words text-sm leading-6 text-[var(--color-ink-muted)]">Athlètes: {block.assignedTo.map(athleteName).join(", ")}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </CoachShell>
  );
}
