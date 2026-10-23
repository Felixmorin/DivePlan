import { FeatureAccessGate } from "@/components/coach/feature-access-gate";
export default function AthletesLayout({ children }: { children: React.ReactNode }) { return <FeatureAccessGate featureId="athletes">{children}</FeatureAccessGate>; }
