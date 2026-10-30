import { notFound, redirect } from "next/navigation";
import { SessionPlayer } from "@/components/athlete/session-player";
import { getAthleteSession, getCurrentAthlete } from "@/lib/athlete-session";
import { completeAthleteSession, recordAthleteSessionPreview, saveAthleteDiveNote, saveAthleteProgress, saveCompetitionDiveEvaluation, startAthleteSession } from "./actions";
import { withDatabaseEgressComponent } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AthleteSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, athlete] = await withDatabaseEgressComponent("initial_session_load", () => Promise.all([params, getCurrentAthlete({ includeCompetitionDives: false })]), "/athlete/session/:id");

  if (!athlete) {
    redirect("/login");
  }

  const session = await withDatabaseEgressComponent("initial_session_load", () => getAthleteSession(id, athlete.id), "/athlete/session/:id");

  if (!session) {
    notFound();
  }

  return <SessionPlayer session={session} onStart={startAthleteSession} onPreview={recordAthleteSessionPreview} onSaveProgress={saveAthleteProgress} onComplete={completeAthleteSession} onSaveDiveNote={saveAthleteDiveNote} onSaveCompetitionEvaluation={saveCompetitionDiveEvaluation} />;
}
