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
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div><p className="mb-1 text-[10px] font-semibold text-slate-500">Entraîneur <span className="mx-2">/</span> Séances</p><h1 className="text-[28px] font-black leading-tight tracking-tight">Séances</h1><p className="text-[11px] text-slate-600">Planifiez et consultez les entraînements de vos groupes.</p></div>
      <Button asChild variant="action" className="min-h-8 rounded-lg bg-cyan-500 px-3 text-[10px] hover:bg-cyan-600"><Link href="/coach/sessions/new"><Plus className="h-3.5 w-3.5" /> Nouvelle séance</Link></Button>
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
