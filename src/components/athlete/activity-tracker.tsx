"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const STORAGE_KEY = "diveplan-visit-id";

export function AthleteActivityTracker() {
  const pathname = usePathname();
  const pendingActions = useRef<Array<{ action: string; path: string }>>([]);
  const enqueue = useRef<(action: string, path: string) => void>(() => {});

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
    let flushTimer: number | undefined;
    const flush = () => {
      if (flushTimer !== undefined) window.clearTimeout(flushTimer);
      flushTimer = undefined;
      const actions = pendingActions.current.splice(0);
      if (actions.length) send({ actions });
    };
    enqueue.current = (action, path) => {
      pendingActions.current.push({ action, path });
      if (pendingActions.current.length >= 10) flush();
      else if (flushTimer === undefined) flushTimer = window.setTimeout(flush, 5000);
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const control = target.closest("a, button, [role='button'], input[type='submit']");
      if (!control) return;
      const label = (control.getAttribute("aria-label") || control.textContent || control.getAttribute("title") || "Action").replace(/\s+/g, " ").trim().slice(0, 100);
      if (label) enqueue.current(`Clic : ${label}`, window.location.pathname);
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("pagehide", flush);
    return () => { flush(); window.removeEventListener("pagehide", flush); document.removeEventListener("click", onClick, true); };
  }, []);

  useEffect(() => {
    if (!pathname) return;
    if (!window.sessionStorage.getItem(`${STORAGE_KEY}-started`)) {
      window.sessionStorage.setItem(`${STORAGE_KEY}-started`, "1");
      enqueue.current("Ouverture de l’application", pathname);
    } else {
      enqueue.current(`Navigation vers ${pathname}`, pathname);
    }
  }, [pathname]);

  return null;
}
