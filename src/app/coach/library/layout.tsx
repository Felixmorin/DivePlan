import { FeatureAccessGate } from "@/components/coach/feature-access-gate";
export default function LibraryLayout({ children }: { children: React.ReactNode }) { return <FeatureAccessGate featureId="library">{children}</FeatureAccessGate>; }
