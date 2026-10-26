"use client";

import { useReportWebVitals } from "next/web-vitals";
import { useEffect } from "react";

type VitalName = "LCP" | "INP" | "CLS" | "FCP" | "TTFB";
type Vital = { route: string; name: VitalName; value: number };

const enabled = process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_LOCAL_TELEMETRY === "true";
const names = new Set<VitalName>(["LCP", "INP", "CLS", "FCP", "TTFB"]);
const initialRoute = typeof window === "undefined" ? "/" : window.location.pathname;

function report(metric: { name: string; value: number }) {
  if (!enabled || !names.has(metric.name as VitalName) || !Number.isFinite(metric.value) || metric.value < 0) return;
  if (typeof window === "undefined" || !/^\/(coach|athlete|admin)(\/|$)/.test(initialRoute)) return;
  const values = (window as Window & { __divePlanVitals?: Map<string, Vital> }).__divePlanVitals ?? new Map<string, Vital>();
  values.set(metric.name, { route: initialRoute, name: metric.name as VitalName, value: metric.value });
  (window as Window & { __divePlanVitals?: Map<string, Vital> }).__divePlanVitals = values;
}

function flushVitals() {
  if (typeof window === "undefined") return;
  const values = (window as Window & { __divePlanVitals?: Map<string, Vital> }).__divePlanVitals;
  if (!values?.size) return;
  const body = JSON.stringify({ vitals: [...values.values()] });
  values.clear();
  try {
    if (navigator.sendBeacon?.("/api/monitoring/transfer", new Blob([body], { type: "application/json" }))) return;
    void fetch("/api/monitoring/transfer", {
      method: "POST", headers: { "content-type": "application/json" }, body,
      keepalive: true, credentials: "same-origin"
    }).catch(() => undefined);
  } catch {
    // Best-effort telemetry only.
  }
}

export function PerformanceVitals() {
  useReportWebVitals(report);
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushVitals();
    };
    window.addEventListener("pagehide", flushVitals);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flushVitals);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);
  return null;
}
