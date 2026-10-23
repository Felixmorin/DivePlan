import { FeatureAccessGate } from "@/components/coach/feature-access-gate";

export default function AnnualPlanningLayout({ children }: { children: React.ReactNode }) {
  return <FeatureAccessGate featureId="planning">{children}</FeatureAccessGate>;
}
