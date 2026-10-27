import { observationTrigger, resourcePath, resourceType, type RequestObservation } from "@/lib/request-observation";
import { isExternalWebVitalsError } from "@/lib/client-errors";

type TransferBucket = {
  route: string;
  resourceType: string;
  requests: number;
  transferBytes: number;
  cacheHits: number;
};

const observations: RequestObservation[] = [];
// Bounded memory; overflow still contributes to the legacy aggregates.
const maxPendingObservations = 60;
let pageId: string | null = null;
const buckets = new Map<string, TransferBucket>();
let currentRoute = typeof window === "undefined" ? "/" : window.location.pathname;
const transitions = [{ at: 0, route: currentRoute }];
const telemetryEnabled = process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_LOCAL_TELEMETRY === "true";

if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    if (isExternalWebVitalsError(event.error)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
}

function record(entry: PerformanceResourceTiming | PerformanceNavigationTiming) {
  if (!telemetryEnabled || typeof window === "undefined") return;
  try {
    // Attribute by request START, so a slow response is not assigned to the next page.
    const page = transitions.findLast((transition) => transition.at <= entry.startTime)?.route;
    if (!page || !/^\/(coach|athlete|admin)(\/|$)/.test(page)) return;
    const url = new URL(entry.name, window.location.href);
    if (url.origin !== window.location.origin || url.pathname.startsWith("/api/monitoring/transfer")) return;
    const route = resourcePath(page);
    const path = resourcePath(url.pathname);
    if (!route || !path) return;
    const type = resourceType(entry);
    const bytes = Math.min(100_000_000, Math.max(0, Math.round(entry.transferSize || 0)));
    const cacheHit = entry.transferSize === 0 && entry.encodedBodySize > 0;
    if (observations.length < maxPendingObservations && typeof crypto.randomUUID === "function") {
      pageId ??= crypto.randomUUID();
      const status = (entry as PerformanceResourceTiming & { responseStatus?: number }).responseStatus;
      observations.push({ id: crypto.randomUUID(), pageId, route, resourcePath: path, resourceType: type,
        trigger: observationTrigger(entry, url, type), startedAt: new Date(performance.timeOrigin + entry.startTime).toISOString(),
        durationMs: Math.round(entry.duration), transferBytes: bytes, cacheHit,
        status: status && status >= 100 && status <= 599 ? status : null });
      return;
    }
    const key = `${route}\n${type}`;
    const bucket = buckets.get(key) ?? { route, resourceType: type, requests: 0, transferBytes: 0, cacheHits: 0 };
    bucket.requests += 1;
    bucket.transferBytes += bytes;
    bucket.cacheHits += Number(cacheHit);
    // Avoid unbounded cardinality during long-running or broken client sessions.
    if (buckets.size < 40 || buckets.has(key)) buckets.set(key, bucket);
  } catch {
    // Monitoring must never interrupt page loading.
  }
}

function send(body: string) {
  try {
    if (navigator.sendBeacon?.("/api/monitoring/transfer", new Blob([body], { type: "application/json" }))) return;
    void fetch("/api/monitoring/transfer", {
      method: "POST", headers: { "content-type": "application/json" }, body,
      keepalive: true, credentials: "same-origin"
    }).catch(() => undefined);
  } catch {
    // Best-effort telemetry only. No retries, and collection excludes this endpoint.
  }
}

function flush() {
  if (!telemetryEnabled || typeof window === "undefined") return;
  // Keep each payload below the endpoint's 20 KB limit and beacon's keepalive budget.
  // Only observations are sent for detailed requests: the server derives their aggregates.
  const pending = observations.splice(0);
  for (let i = 0; i < pending.length; i += 20) send(JSON.stringify({ observations: pending.slice(i, i + 20) }));
  const batch = [...buckets.values()];
  buckets.clear();
  if (batch.length) send(JSON.stringify({ entries: batch }));
}

if (typeof window !== "undefined" && telemetryEnabled) {
  try {
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
    try {
      const navigationObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) record(entry as PerformanceNavigationTiming);
      });
      navigationObserver.observe({ type: "navigation", buffered: true });
    } catch {
      // Navigation observation is optional; keep resource collection and flushing alive.
    }
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
  transitions.push({ at: performance.now(), route: currentRoute });
  if (transitions.length > 200) transitions.shift();
}

