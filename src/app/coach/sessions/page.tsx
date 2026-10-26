import { Plus } from "lucide-react";
import Link from "next/link";
import { CoachShell } from "@/components/coach/coach-shell";
import { Button } from "@/components/ui/button";
import { demoSession, weekSessions } from "@/lib/data";
import { requireCoach } from "@/lib/current-user";
import { query, withDatabaseEgressComponent } from "@/lib/db";
import { completeExpiredTrainingSessions, startDueTrainingSessions } from "@/lib/session-status";
import { SessionsList, type SessionListItem } from "./sessions-list";

export const dynamic = "force-dynamic";

export default async function SessionsPage() {
  const { clubId } = await requireCoach();
  if (clubId === "dev-club") return <DemoSessionsPage />;

  const result = await withDatabaseEgressComponent("initial_session_load", async () => {
    await completeExpiredTrainingSessions();
    await startDueTrainingSessions();
    return query<SessionListItem>(
      `SELECT s.id, s.title, g.name AS "groupName", s.status, s.duration, s.date, pe.location,
       COALESCE((SELECT sum(b."estimatedVolume")::int FROM "SessionBlock" b WHERE b."sessionId" = s.id), 0) AS volume,
       (SELECT count(*)::int FROM "SessionBlock" b WHERE b."sessionId" = s.id) AS "blockCount",
       (SELECT count(DISTINCT a."athleteId")::int FROM "SessionBlock" b JOIN "SessionBlockAssignment" a ON a."sessionBlockId" = b.id WHERE b."sessionId" = s.id) AS "athleteCount"
     FROM "TrainingSession" s JOIN "TrainingWeek" w ON w.id = s."weekId" JOIN "TrainingGroup" g ON g.id = w."groupId" LEFT JOIN "PlanningEvent" pe ON pe.id = s."planningEventId"
       WHERE w."clubId" = $1 ORDER BY s.date DESC`, [clubId]
    );
  });

  return <CoachShell active="Seances"><SessionsPageContent sessions={result.rows} /></CoachShell>;
}

function SessionsPageContent({ sessions }: { sessions: SessionListItem[] }) {
  return <>
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><p className="mb-1 text-sm font-semibold text-slate-500">Entraîneur <span className="mx-2">/</span> Séances</p><h1 className="text-3xl font-black tracking-tight">Séances</h1><p className="mt-1 text-slate-600">Planifiez et consultez les entraînements de vos groupes.</p></div>
      <Button asChild><Link href="/coach/sessions/new"><Plus className="h-4 w-4" /> Nouvelle séance</Link></Button>
    </div>
    <SessionsList sessions={sessions} />
  </>;
}

function DemoSessionsPage() {
  return <CoachShell active="Seances"><SessionsPageContent sessions={createDemoSessions()} /></CoachShell>;
}

function createDemoSessions(): SessionListItem[] {
  const samples = [demoSession, ...weekSessions.filter((session) => session.title).slice(0, 8)];
  const now = Date.now();
  return samples.map((session, index) => ({
    id: `demo-${index}`, title: session.title, groupName: index ? "Groupe pilote" : "Compétition Mustang",
    status: index ? "COMPLETED" : "READY", date: new Date(now + (index ? -index * 7 : 2) * 86400000).toISOString(), duration: session.duration,
    volume: "volume" in session ? session.volume : session.blocks.reduce((sum, block) => sum + block.volume, 0),
    athleteCount: "athletes" in session ? session.athletes : new Set(session.blocks.flatMap((block) => block.assignedTo)).size,
    blockCount: "blocks" in session ? session.blocks.length : 0,
    location: null,
  }));
}
