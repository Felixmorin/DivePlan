import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdmin } from "@/lib/current-user";
import { FeatureManagement } from "@/components/admin/feature-management";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminFeaturesPage() {
  await requireAdmin();
  const [coaches, access] = await Promise.all([
    query<{ id: string; name: string }>(`SELECT id, "firstName" || ' ' || "lastName" AS name FROM "User" WHERE role = 'COACH' ORDER BY "lastName", "firstName"`),
    query<{ userId: string; featureId: string }>(`SELECT "userId", "featureId" FROM "CoachFeatureAccess" WHERE enabled = FALSE`)
  ]);
  const excluded = Object.fromEntries(["calendar", "sessions", "simulations", "evaluations", "planning"].map((id) => [id, access.rows.filter((row) => row.featureId === id).map((row) => row.userId)]));
  return <AdminShell active="Fonctionnalités"><FeatureManagement coaches={coaches.rows} excluded={excluded} /></AdminShell>;
}
