import { FeatureAccessGate } from "@/components/coach/feature-access-gate";
export default function ObservabilityLayout({ children }: { children: React.ReactNode }) { return <FeatureAccessGate featureId="observability">{children}</FeatureAccessGate>; }
