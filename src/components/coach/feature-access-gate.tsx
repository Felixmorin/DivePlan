import { redirect } from "next/navigation";
import { requireCoach } from "@/lib/current-user";
import { query } from "@/lib/db";

export async function FeatureAccessGate({ featureId, children }: { featureId: string; children: React.ReactNode }) {
  const { user } = await requireCoach();
  const access = await query<{ enabled: boolean }>(
    `SELECT enabled FROM "CoachFeatureAccess" WHERE "userId" = $1 AND "featureId" = $2`,
    [user.id, featureId]
  );
  if (access.rows[0]?.enabled === false) redirect("/coach?feature=unavailable");
  return children;
}
