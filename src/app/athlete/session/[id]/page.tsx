import { notFound, redirect } from "next/navigation";
import { SessionPlayer } from "@/components/athlete/session-player";
import { getAthleteSession, getCurrentAthlete } from "@/lib/athlete-session";
import { completeAthleteSession, saveAthleteProgress, startAthleteSession } from "./actions";

export const dynamic = "force-dynamic";

export default async function AthleteSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, athlete] = await Promise.all([params, getCurrentAthlete()]);

  if (!athlete) {
    redirect("/login");
  }

  const session = await getAthleteSession(id, athlete.id);

  if (!session) {
    notFound();
  }

  return <SessionPlayer session={session} onStart={startAthleteSession} onSaveProgress={saveAthleteProgress} onComplete={completeAthleteSession} />;
}
