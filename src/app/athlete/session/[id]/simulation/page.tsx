import { notFound, redirect } from "next/navigation";
import { AthleteShell } from "@/components/athlete/athlete-shell";
import { CompetitionSimulationLive } from "@/components/competition-simulation-live";
import { getCurrentAthleteIdentity, getAthleteSession } from "@/lib/athlete-session";

export const dynamic = "force-dynamic";

export default async function AthleteCompetitionSimulationPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, athlete] = await Promise.all([params, getCurrentAthleteIdentity()]);
  if (!athlete) redirect("/login");
  const session = await getAthleteSession(id, athlete.id);
  if (!session) notFound();
  if (!session.competitionSimulation) notFound();
  if (session.completionStatus === "NOT_STARTED") redirect(`/athlete/session/${id}`);
  return <AthleteShell hideNav className="!bg-[#f4f8fc]"><CompetitionSimulationLive sessionId={id} /></AthleteShell>;
}
