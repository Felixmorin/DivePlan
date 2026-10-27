import { Plus } from "lucide-react";
import Link from "@/components/ui/app-link";
import { CoachShell } from "@/components/coach/coach-shell";
import { Button } from "@/components/ui/button";
import { demoSession, weekSessions } from "@/lib/data";
import { requireCoach } from "@/lib/current-user";
import { withDatabaseEgressComponent } from "@/lib/db";
import { getCoachSessionsPage, type SessionFilters, type CoachSessionsPage } from "@/lib/coach-sessions-list";
import { SessionsList, type SessionListItem } from "./sessions-list";

export const dynamic = "force-dynamic";

export default async function SessionsPage({ searchParams }: { searchParams: Promise<SessionFilters> }) {
  const { clubId } = await withDatabaseEgressComponent("initial_session_load", () => requireCoach(), "/coach/sessions");
  if (clubId === "dev-club") return <DemoSessionsPage />;

  const filters = await searchParams;
  const data = await withDatabaseEgressComponent("initial_session_load", () => getCoachSessionsPage(clubId,filters), "/coach/sessions");
  return <CoachShell active="Seances"><SessionsPageContent sessions={data.sessions} pagination={data} /></CoachShell>;
}

function SessionsPageContent({ sessions, pagination }: { sessions: SessionListItem[]; pagination?: CoachSessionsPage }) {
  return <>
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><p className="mb-1 text-sm font-semibold text-slate-500">Entraîneur <span className="mx-2">/</span> Séances</p><h1 className="text-3xl font-black tracking-tight">Séances</h1><p className="mt-1 text-slate-600">Planifiez et consultez les entraînements de vos groupes.</p></div>
      <Button asChild><Link href="/coach/sessions/new"><Plus className="h-4 w-4" /> Nouvelle séance</Link></Button>
    </div>
    <SessionsList sessions={sessions} pagination={pagination} />
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
