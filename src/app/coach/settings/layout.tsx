import { FeatureAccessGate } from "@/components/coach/feature-access-gate";
export default function SettingsLayout({ children }: { children: React.ReactNode }) { return <FeatureAccessGate featureId="settings">{children}</FeatureAccessGate>; }
