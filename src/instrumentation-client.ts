import { isExternalWebVitalsError } from "@/lib/client-errors";

type TransferBucket = {
  route: string;
  resourceType: string;
  requests: number;
  transferBytes: number;
  cacheHits: number;
};

const buckets = new Map<string, TransferBucket>();
let currentRoute = typeof window === "undefined" ? "/" : window.location.pathname;
const telemetryEnabled = process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_LOCAL_TELEMETRY === "true";

if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    if (isExternalWebVitalsError(event.error)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
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
  if (!telemetryEnabled || typeof window === "undefined" || !/^\/(coach|athlete|admin)(\/|$)/.test(currentRoute)) return;
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

function flush() {
  if (!telemetryEnabled || typeof window === "undefined") return;
  const batch = [...buckets.values()];
  buckets.clear();
  if (batch.length === 0) return;
  const body = JSON.stringify({ entries: batch });
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
    window.setInterval(flush, 60_000);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
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
