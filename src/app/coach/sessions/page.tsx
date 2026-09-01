import Link from "next/link";
import { Plus } from "lucide-react";
import { CoachShell } from "@/components/coach/coach-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SessionCard } from "@/components/training/session-card";
import { demoSession, weekSessions } from "@/lib/data";
import { requireCoach } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function SessionsPage() {
  const { clubId } = await requireCoach();
  if (clubId === "dev-club") {
    return <DemoSessionsPage />;
  }

  const sessions = await prisma.trainingSession.findMany({
    where: { week: { clubId } },
    orderBy: { date: "desc" },
    include: {
      week: { include: { group: true } },
      blocks: { include: { assignments: true } }
    }
  });

  return (
    <CoachShell active="Seances">
      <div className="mb-6 flex items-center justify-between">
        <div><h1 className="text-3xl font-black">Seances</h1><p className="text-slate-500">Modeles, duplication rapide et impression bassin.</p></div>
        <Button asChild><Link href="/coach/sessions/new"><Plus className="h-4 w-4" /> Nouvelle seance</Link></Button>
      </div>
      <Card>
        <CardHeader><CardTitle>Cette semaine</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              title={session.title}
              focus={session.focus}
              group={session.week.group.name}
              href={`/coach/sessions/${session.id}`}
              printHref={`/coach/sessions/${session.id}/print`}
              status={session.status}
              duration={session.duration}
              volume={session.blocks.reduce((sum, block) => sum + block.estimatedVolume, 0)}
              athleteCount={uniqueAssignmentCount(session.blocks)}
            />
          ))}
          {sessions.length === 0 && <EmptyState title="Aucune seance publiee" description="Cree une premiere seance pour lancer un pilote." />}
        </CardContent>
      </Card>
    </CoachShell>
  );
}

function DemoSessionsPage() {
  const sessions = [demoSession, ...weekSessions.filter((session) => session.title).slice(0, 4)];

  return (
    <CoachShell active="Seances">
      <div className="mb-6 flex items-center justify-between">
        <div><h1 className="text-3xl font-black">Seances</h1><p className="text-slate-500">Mode demo local sans PostgreSQL.</p></div>
        <Button asChild><Link href="/coach/sessions/demo"><Plus className="h-4 w-4" /> Seance demo</Link></Button>
      </div>
      <Card>
        <CardHeader><CardTitle>Cette semaine</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {sessions.map((session, index) => (
            <SessionCard
              key={`${session.title}-${index}`}
              title={session.title}
              focus={session.focus}
              href="/coach/sessions/demo"
              printHref="/coach/sessions/demo/print"
              status={index === 0 ? "Pret" : "Planifie"}
              duration={session.duration}
              volume={"volume" in session ? session.volume : session.blocks.reduce((sum, block) => sum + block.volume, 0)}
              athleteCount={"athletes" in session ? session.athletes : new Set(session.blocks.flatMap((block) => block.assignedTo)).size}
            />
          ))}
        </CardContent>
      </Card>
    </CoachShell>
  );
}

function uniqueAssignmentCount(blocks: Array<{ assignments: Array<{ athleteId: string }> }>) {
  return new Set(blocks.flatMap((block) => block.assignments.map((assignment) => assignment.athleteId))).size;
}
