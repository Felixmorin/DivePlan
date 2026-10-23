import { FeatureAccessGate } from "@/components/coach/feature-access-gate";
export default function MonitoringLayout({ children }: { children: React.ReactNode }) { return <FeatureAccessGate featureId="monitoring">{children}</FeatureAccessGate>; }
