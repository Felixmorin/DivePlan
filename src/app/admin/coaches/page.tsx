import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdmin } from "@/lib/current-user";
import { FeatureManagement } from "@/components/admin/feature-management";

export const dynamic = "force-dynamic";

export default async function AdminFeaturesPage() {
  await requireAdmin();
  return <AdminShell active="Fonctionnalités"><FeatureManagement /></AdminShell>;
}
