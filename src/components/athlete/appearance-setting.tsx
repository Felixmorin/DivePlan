"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

const STORAGE_KEY = "diveplan-athlete-theme";

export function AppearanceSetting() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const isDark = saved !== "light";
    setDark(isDark);
    document.querySelectorAll<HTMLElement>(".athlete-app").forEach((app) => {
      app.dataset.athleteTheme = isDark ? "dark" : "light";
    });
  }, []);

  function toggleTheme() {
    const nextDark = !dark;
    setDark(nextDark);
    window.localStorage.setItem(STORAGE_KEY, nextDark ? "dark" : "light");
    document.querySelectorAll<HTMLElement>(".athlete-app").forEach((app) => {
      app.dataset.athleteTheme = nextDark ? "dark" : "light";
    });
  }

  return (
    <button type="button" className="preference-row w-full text-left" onClick={toggleTheme} aria-pressed={dark}>
      <span className="preference-icon mint">{dark ? <Moon /> : <Sun />}</span>
      <strong>Mode sombre</strong>
      <span className="preference-value">{dark ? "Activé" : "Désactivé"}</span>
      <span aria-hidden="true" className={`appearance-switch${dark ? " is-on" : ""}`}><i /></span>
    </button>
  );
}
