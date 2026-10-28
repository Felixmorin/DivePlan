"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const STORAGE_KEY = "diveplan-visit-id";

export function AthleteActivityTracker() {
  const pathname = usePathname();

  useEffect(() => {
    let visitId = window.sessionStorage.getItem(STORAGE_KEY);
    if (!visitId) {
      visitId = crypto.randomUUID();
      window.sessionStorage.setItem(STORAGE_KEY, visitId);
    }

    const log = (action: string, path = window.location.pathname) => {
      void fetch("/api/athlete/monitoring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitId, action, path }),
        keepalive: true
      }).catch(() => undefined);
    };

    if (!window.sessionStorage.getItem(`${STORAGE_KEY}-started`)) {
      window.sessionStorage.setItem(`${STORAGE_KEY}-started`, "1");
      log("Ouverture de l’application", pathname);
    } else if (pathname) {
      log(`Navigation vers ${pathname}`, pathname);
    }

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const control = target.closest("a, button, [role='button'], input[type='submit']");
      if (!control) return;
      const label = (control.getAttribute("aria-label") || control.textContent || control.getAttribute("title") || "Action").replace(/\s+/g, " ").trim().slice(0, 100);
      if (label) log(`Clic : ${label}`);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pathname]);

  return null;
}
