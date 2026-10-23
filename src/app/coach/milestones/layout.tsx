import { FeatureAccessGate } from "@/components/coach/feature-access-gate";

export default function MilestonesLayout({ children }: { children: React.ReactNode }) {
  return <FeatureAccessGate featureId="simulations">{children}</FeatureAccessGate>;
}
