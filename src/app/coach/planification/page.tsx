import { CoachShell } from "@/components/coach/coach-shell";
import { AnnualPlan } from "@/components/coach/annual-plan";
import { requireFullAccessCoach } from "@/lib/current-user";

export default async function PlanificationPage() {
  await requireFullAccessCoach();
  return (
    <CoachShell active="Planification">
      <AnnualPlan />
    </CoachShell>
  );
}
