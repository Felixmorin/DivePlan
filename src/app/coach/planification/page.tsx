import { CoachShell } from "@/components/coach/coach-shell";
import { AnnualPlan } from "@/components/coach/annual-plan";
import { requireFullAccessCoach } from "@/lib/current-user";

export default async function PlanificationPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireFullAccessCoach();
  const params = await searchParams;
  const requestedMode = params.data;
  const dataMode = process.env.NODE_ENV === "development" &&
    (requestedMode === "worst" || requestedMode === "empty" || requestedMode === "one")
    ? requestedMode
    : "demo";
  return (
    <CoachShell active="Planification">
      <AnnualPlan dataMode={dataMode} />
    </CoachShell>
  );
}
