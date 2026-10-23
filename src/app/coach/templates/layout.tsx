import { FeatureAccessGate } from "@/components/coach/feature-access-gate";
export default function TemplatesLayout({ children }: { children: React.ReactNode }) { return <FeatureAccessGate featureId="templates">{children}</FeatureAccessGate>; }
