import { CoachShell } from "@/components/coach/coach-shell";
import { AnnualPlan } from "@/components/coach/annual-plan";

export default function PlanificationPage() {
  return (
    <CoachShell active="Planification">
      <AnnualPlan />
    </CoachShell>
  );
}
