import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdmin } from "@/lib/current-user";
import { FeatureManagement } from "@/components/admin/feature-management";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminFeaturesPage() {
  await requireAdmin();
  const [coaches, access] = await Promise.all([
    query<{ id: string; name: string; email: string }>(`SELECT id, "firstName" || ' ' || "lastName" AS name, email FROM "User" WHERE role = 'COACH' ORDER BY "lastName", "firstName"`),
    query<{ userId: string; featureId: string }>(`SELECT "userId", "featureId" FROM "CoachFeatureAccess" WHERE enabled = FALSE`)
  ]);
  const legacyRestrictedFeatures = ["planning", "simulations", "library", "templates", "observability", "monitoring", "settings"];
  const excluded = Object.fromEntries(["dashboard", "calendar", "planning", "sessions", "athletes", "simulations", "groups", "library", "templates", "observability", "monitoring", "settings"].map((featureId) => {
    const savedExclusions = access.rows.filter((row) => row.featureId === featureId).map((row) => row.userId);
    const existingRestrictions = legacyRestrictedFeatures.includes(featureId)
      ? coaches.rows.filter((coach) => coach.email.trim().toLowerCase() !== "felix@diveplan.com").map((coach) => coach.id)
      : [];
    return [featureId, [...new Set([...existingRestrictions, ...savedExclusions])]];
  }));
  return <AdminShell active="Fonctionnalités"><FeatureManagement coaches={coaches.rows.map(({ id, name }) => ({ id, name }))} excluded={excluded} /></AdminShell>;
}
