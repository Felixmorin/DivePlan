"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const storageKey = "diveplan-admin-theme";

export function AdminThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey) === "dark";
    setDark(saved);
    document.documentElement.classList.toggle("admin-dark", saved);
    const syncTheme = () => setDark(document.documentElement.classList.contains("admin-dark"));
    window.addEventListener("admin-theme-change", syncTheme);
    return () => window.removeEventListener("admin-theme-change", syncTheme);
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("admin-dark", next);
    window.localStorage.setItem(storageKey, next ? "dark" : "light");
    window.dispatchEvent(new Event("admin-theme-change"));
  }

  return <button
    type="button"
    onClick={toggleTheme}
    aria-label={dark ? "Activer le thème clair" : "Activer le thème sombre"}
    aria-pressed={dark}
    className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] admin-theme-toggle"
  >
    {dark ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
    <span>{dark ? "Thème clair" : "Thème sombre"}</span>
  </button>;
}
