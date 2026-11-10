"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useState } from "react";

export function CoachShellFrame({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div data-collapsed={collapsed} className="group/coach min-h-screen overflow-x-hidden bg-[var(--color-coach-bg)] text-[var(--color-ink)]">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        aria-label={collapsed ? "Déployer le menu" : "Replier le menu"}
        aria-expanded={!collapsed}
        aria-controls="coach-sidebar"
        className="fixed left-60 top-6 z-20 hidden h-8 w-8 items-center justify-center rounded-lg text-white/65 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] lg:flex group-data-[collapsed=true]/coach:left-16"
      >
        {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
      </button>
      {children}
    </div>
  );
}
