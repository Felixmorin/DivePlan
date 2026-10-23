import { FeatureAccessGate } from "@/components/coach/feature-access-gate";

export default function SessionsLayout({ children }: { children: React.ReactNode }) {
  return <FeatureAccessGate featureId="sessions">{children}</FeatureAccessGate>;
}
