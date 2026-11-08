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

    const send = (payload: { action: string; path: string } | { actions: Array<{ action: string; path: string }> }) => {
      void fetch("/api/athlete/monitoring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitId, ...payload }),
        keepalive: true
      }).catch(() => undefined);
    };
    const log = (action: string, path = window.location.pathname) => send({ action, path });
    const pendingActions: Array<{ action: string; path: string }> = [];
    let flushTimer: number | undefined;
    const flush = () => {
      if (flushTimer !== undefined) window.clearTimeout(flushTimer);
      flushTimer = undefined;
      const actions = pendingActions.splice(0);
      if (actions.length) send({ actions });
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
      if (label) {
        pendingActions.push({ action: `Clic : ${label}`, path: window.location.pathname });
        if (pendingActions.length >= 10) flush();
        else if (flushTimer === undefined) flushTimer = window.setTimeout(flush, 5000);
      }
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("pagehide", flush);
    return () => { flush(); window.removeEventListener("pagehide", flush); document.removeEventListener("click", onClick, true); };
  }, [pathname]);

  return null;
}
