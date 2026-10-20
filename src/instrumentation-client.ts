import { isExternalWebVitalsError } from "@/lib/client-errors";
import { metrics } from "@sentry/core";

type TransferBucket = {
  route: string;
  resourceType: string;
  requests: number;
  transferBytes: number;
  cacheHits: number;
};

type VitalName = "LCP" | "CLS" | "INP" | "FCP" | "TTFB";
type VitalBucket = { route: string; name: VitalName; value: number };

const buckets = new Map<string, TransferBucket>();
let currentRoute = typeof window === "undefined" ? "/" : window.location.pathname;
const documentRoute = currentRoute;
const vitalValues = new Map<VitalName, number>();
const vitalsReported = new Set<VitalName>();
const telemetryEnabled = process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_LOCAL_TELEMETRY === "true";
let clsWindowStart = 0;
let clsWindowLastShift = 0;
let clsWindowValue = 0;

if (typeof window !== "undefined") {
  // Keep analytics failures separate from errors raised by DivePlan.
  window.addEventListener(
    "error",
    (event) => {
      if (isExternalWebVitalsError(event.error)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true
  );
}

function resourceType(entry: PerformanceResourceTiming | PerformanceNavigationTiming) {
  if (entry.entryType === "navigation") return "document";
  switch (entry.initiatorType) {
    case "script": return "script";
    case "css": case "link": return "style";
    case "img": case "image": return "image";
    case "font": return "font";
    case "fetch": case "xmlhttprequest": return "fetch";
    default: return "other";
  }
}

function record(entry: PerformanceResourceTiming | PerformanceNavigationTiming) {
  if (!telemetryEnabled || typeof window === "undefined") return;
  if (!/^\/(coach|athlete)(\/|$)/.test(currentRoute)) return;
  try {
    const url = new URL(entry.name, window.location.href);
    if (url.origin !== window.location.origin || url.pathname.startsWith("/api/monitoring/transfer")) return;
    const type = resourceType(entry);
    const key = `${currentRoute}\n${type}`;
    const bucket = buckets.get(key) ?? { route: currentRoute, resourceType: type, requests: 0, transferBytes: 0, cacheHits: 0 };
    bucket.requests += 1;
    bucket.transferBytes += Math.max(0, entry.transferSize || 0);
    if (entry.transferSize === 0 && entry.encodedBodySize > 0) bucket.cacheHits += 1;
    buckets.set(key, bucket);
  } catch {
    // Monitoring must never interrupt page loading.
  }
}

function recordVital(name: VitalName, value: number) {
  if (!telemetryEnabled || !Number.isFinite(value) || value < 0) return;
  if (!/^\/(coach|athlete)(\/|$)/.test(documentRoute)) return;
  vitalValues.set(name, Math.max(vitalValues.get(name) ?? 0, value));
}

function flush(includeVitals = false) {
  if (!telemetryEnabled || typeof window === "undefined") return;
  const batch = [...buckets.values()];
  buckets.clear();
  const vitals: VitalBucket[] = [...vitalValues.entries()]
    .filter(() => includeVitals)
    .filter(([name]) => !vitalsReported.has(name))
    .map(([name, value]) => ({ route: documentRoute, name, value }));
  for (const vital of vitals) {
    const route = vital.route
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, ":id")
      .replace(/\/(?:[0-9]+|[0-9a-f]{8}-[0-9a-f-]{27,}|[a-z0-9_-]{20,})(?=\/|\b)/gi, "/:id");
    metrics.distribution(`web_vital.${vital.name.toLowerCase()}`, vital.value, {
      unit: vital.name === "CLS" ? "none" : "millisecond",
      attributes: { route },
    });
  }
  if (batch.length === 0 && vitals.length === 0) return;
  const body = JSON.stringify({ entries: batch, vitals });
  try {
    if (navigator.sendBeacon?.("/api/monitoring/transfer", new Blob([body], { type: "application/json" }))) {
      for (const vital of vitals) vitalsReported.add(vital.name);
      return;
    }
    void fetch("/api/monitoring/transfer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
      credentials: "same-origin"
    }).then((response) => {
      if (response.ok) for (const vital of vitals) vitalsReported.add(vital.name);
    }).catch(() => undefined);
  } catch {
    // Best-effort telemetry only.
  }
}

if (typeof window !== "undefined" && telemetryEnabled) {
  try {
    const navigation = performance.getEntriesByType("navigation")[0];
    if (navigation) record(navigation as PerformanceNavigationTiming);
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry instanceof PerformanceResourceTiming) record(entry);
      }
    });
    observer.observe({ type: "resource", buffered: true });
    const observeVital = (type: string, name: VitalName, read: (entry: PerformanceEntry) => number) => {
      try {
        const vitalObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) recordVital(name, read(entry));
        });
        vitalObserver.observe({ type, buffered: true });
      } catch {
        // Some browsers do not support every performance entry type.
      }
    };
    observeVital("largest-contentful-paint", "LCP", (entry) => entry.startTime);
    try {
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean };
          if (shift.hadRecentInput || !shift.value) continue;
          if (entry.startTime - clsWindowLastShift > 1000 || entry.startTime - clsWindowStart > 5000) {
            clsWindowStart = entry.startTime;
            clsWindowValue = 0;
          }
          clsWindowLastShift = entry.startTime;
          clsWindowValue += shift.value;
          recordVital("CLS", clsWindowValue);
        }
      });
      clsObserver.observe({ type: "layout-shift", buffered: true });
    } catch {
      // Some browsers do not support layout-shift entries.
    }
    observeVital("event", "INP", (entry) => (entry as PerformanceEntry & { duration?: number }).duration ?? 0);
    const navigationTiming = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (navigationTiming) recordVital("TTFB", navigationTiming.responseStart);
    observeVital("paint", "FCP", (entry) => entry.name === "first-contentful-paint" ? entry.startTime : 0);
    window.setInterval(flush, 60_000);
    window.addEventListener("pagehide", () => flush(true));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush(true);
    });
  } catch {
    // Resource Timing is optional on older browsers.
  }
}

export function onRouterTransitionStart(url: string) {
  try {
    currentRoute = new URL(url, window.location.origin).pathname;
  } catch {
    currentRoute = window.location.pathname;
  }
}
