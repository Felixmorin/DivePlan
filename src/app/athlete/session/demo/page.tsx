import { notFound, redirect } from "next/navigation";
import { SessionPlayer } from "@/components/athlete/session-player";
import { getAssignedReadySession, getAthleteSession, getCurrentAthlete } from "@/lib/athlete-session";
import { completeAthleteSession, startAthleteSession } from "../[id]/actions";

export const dynamic = "force-dynamic";

export default async function AthleteSessionDemoPage() {
  const athlete = await getCurrentAthlete();

  if (!athlete) {
    redirect("/login");
  }

  const readySession = await getAssignedReadySession(athlete.id);
  const session = readySession ? await getAthleteSession(readySession.id, athlete.id) : null;

  if (!session) {
    notFound();
  }

  return <SessionPlayer session={session} onStart={startAthleteSession} onComplete={completeAthleteSession} />;
}
