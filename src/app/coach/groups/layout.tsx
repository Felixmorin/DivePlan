import { FeatureAccessGate } from "@/components/coach/feature-access-gate";
export default function GroupsLayout({ children }: { children: React.ReactNode }) { return <FeatureAccessGate featureId="groups">{children}</FeatureAccessGate>; }
