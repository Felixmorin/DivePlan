"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const storageKey = "diveplan-admin-theme";

export function AdminThemeToggle({ placement }: { placement: "sidebar" | "mobile" }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey) === "dark";
    window.setTimeout(() => setDark(saved), 0);
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
    role="switch"
    aria-label="Thème sombre"
    aria-checked={dark}
    className={`admin-theme-toggle admin-theme-toggle--${placement}`}
  >
    <span className="admin-theme-icon" aria-hidden="true">{dark ? <Moon /> : <Sun />}</span>
    <span className="admin-theme-copy"><span>Apparence</span><strong>{dark ? "Sombre" : "Clair"}</strong></span>
    <span className={`admin-theme-track${dark ? " is-dark" : ""}`} aria-hidden="true"><span /></span>
  </button>;
}
