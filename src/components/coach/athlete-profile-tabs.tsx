"use client";

import { useState, type ReactNode } from "react";

const tabs = [
  { id: "overview", label: "Aperçu" },
  { id: "evaluations", label: "Évaluations" },
  { id: "competition", label: "Liste de compétitions" },
  { id: "history", label: "Historique des séances" }
] as const;

type TabId = (typeof tabs)[number]["id"];

export function AthleteProfileTabs({ overview, evaluations, competition, history }: {
  overview: ReactNode;
  evaluations: ReactNode;
  competition: ReactNode;
  history: ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const content: Record<TabId, ReactNode> = { overview, evaluations, competition, history };

  return <>
    <nav className="athlete-tabs" aria-label="Sections du profil" role="tablist">
      {tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`athlete-tab-${tab.id}`} id={`athlete-tab-trigger-${tab.id}`} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}
    </nav>
    <section role="tabpanel" id={`athlete-tab-${activeTab}`} aria-labelledby={`athlete-tab-trigger-${activeTab}`} className="athlete-tab-panel">
      {content[activeTab]}
    </section>
  </>;
}
