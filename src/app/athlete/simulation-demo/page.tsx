import { notFound, redirect } from "next/navigation";
import { AthleteShell } from "@/components/athlete/athlete-shell";
import { CompetitionVoteDemo } from "@/components/athlete/competition-vote-demo";
import { getCurrentAthleteIdentity } from "@/lib/athlete-session";
import { demoRoutesEnabled } from "@/lib/demo-routes";

export const dynamic = "force-dynamic";

export default async function AthleteSimulationDemoPage() {
  if (!demoRoutesEnabled()) notFound();
  if (!await getCurrentAthleteIdentity()) redirect("/login");
  return <AthleteShell hideNav className="!bg-[#071a2b]"><CompetitionVoteDemo /></AthleteShell>;
}
