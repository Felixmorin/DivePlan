import { FeatureAccessGate } from "@/components/coach/feature-access-gate";

export default function PlanningLayout({ children }: { children: React.ReactNode }) {
  return <FeatureAccessGate featureId="calendar">{children}</FeatureAccessGate>;
}
