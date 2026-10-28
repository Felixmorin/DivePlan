import type { ReactNode } from "react";
import Link from "@/components/ui/app-link";
const tabs = [
  { id: "overview", label: "Aperçu" }, { id: "evaluations", label: "Évaluations" },
  { id: "competition", label: "Liste de compétitions" }, { id: "history", label: "Historique des séances" }
];
/** Route-backed sections: only the selected section is loaded and serialized. */
export function AthleteProfileTabs({ activeTab, athleteId, children }: { activeTab: string; athleteId: string; children: ReactNode }) {
  return <>
    <nav className="athlete-tabs" aria-label="Sections du profil">
      {tabs.map(tab => <Link key={tab.id} scroll={false} href={`/coach/athletes/${encodeURIComponent(athleteId)}?tab=${tab.id}`} aria-current={activeTab === tab.id ? "page" : undefined} className={activeTab === tab.id ? "is-active" : ""}>{tab.label}</Link>)}
    </nav>
    <section className="athlete-tab-panel" aria-label={tabs.find(tab => tab.id === activeTab)?.label}>{children}</section>
  </>;
}
