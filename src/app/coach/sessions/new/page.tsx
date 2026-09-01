import { CoachShell } from "@/components/coach/coach-shell";
import { SessionBuilder } from "@/components/coach/session-builder";
import { createTrainingSession } from "@/app/coach/sessions/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireCoach } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function NewSessionPage() {
  const { clubId } = await requireCoach();
  if (clubId === "dev-club") {
    return (
      <CoachShell active="Seances">
        <div className="mb-6">
          <p className="text-sm font-black uppercase text-[var(--color-brand-strong)]">Builder</p>
          <h1 className="mt-2 text-3xl font-black">Nouvelle seance</h1>
          <p className="mt-1 text-[var(--color-ink-muted)]">Mode demo local sans PostgreSQL.</p>
        </div>
        <Card>
          <CardHeader><CardTitle>Base de donnees requise</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-6 text-[var(--color-ink-muted)]">La creation de seance doit sauvegarder des blocs, exercices et assignations. Configure un `DATABASE_URL` valide pour utiliser ce module.</p>
            <Button asChild variant="action"><Link href="/coach/sessions/demo">Ouvrir la seance demo</Link></Button>
          </CardContent>
        </Card>
      </CoachShell>
    );
  }

  const [groups, athletes, drylandLibrary] = await Promise.all([
    prisma.trainingGroup.findMany({ where: { clubId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.athlete.findMany({
      where: { clubId, active: true },
      orderBy: { user: { firstName: "asc" } },
      select: { id: true, level: true, user: { select: { firstName: true, lastName: true, avatar: true } } }
    }),
    prisma.drylandExercise.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, category: true, defaultSets: true, defaultReps: true, defaultDuration: true, equipment: true }
    })
  ]);

  return (
    <CoachShell active="Seances">
      <div className="mb-6">
        <p className="text-sm font-black uppercase text-[var(--color-brand-strong)]">Builder</p>
        <h1 className="mt-2 text-3xl font-black">Nouvelle seance</h1>
        <p className="mt-1 text-[var(--color-ink-muted)]">Construire une seance complete en quelques minutes, avec blocs partageables et assignations fines.</p>
      </div>
      {groups.length === 0 || athletes.length === 0 || drylandLibrary.length === 0 ? (
        <EmptyState title="Donnees requises manquantes" description="Le builder a besoin d'un groupe, d'athletes actifs et d'exercices dryland pour publier une seance." action={<Button asChild><Link href="/coach/athletes">Verifier les athletes</Link></Button>} />
      ) : (
        <SessionBuilder
          athletes={athletes.map((athlete) => ({
            id: athlete.id,
            firstName: athlete.user.firstName,
            lastName: athlete.user.lastName,
            level: athlete.level,
            avatar: athlete.user.avatar
          }))}
          drylandLibrary={drylandLibrary.map((exercise) => ({
            id: exercise.id,
            name: exercise.name,
            category: exercise.category,
            sets: exercise.defaultSets,
            reps: exercise.defaultReps,
            duration: exercise.defaultDuration,
            equipment: exercise.equipment
          }))}
          groups={groups}
          onCreate={createTrainingSession}
        />
      )}
    </CoachShell>
  );
}
