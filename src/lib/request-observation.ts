import { normalizeTelemetryRoute } from "./telemetry-route";

export const requestTriggers = {
  navigation: "Ouverture de page", reload: "Rechargement", back_forward: "Retour / avance",
  asset: "Ressource de page", rsc: "Données de navigation Next.js", unknown: "Déclencheur inconnu"
} as const;
export const resourceLabels: Record<string, string> = {
  document: "Document", script: "Script", style: "Style", image: "Image", font: "Police", fetch: "Appel de données", other: "Autre"
};
export type RequestObservation = {
  id: string; pageId: string; route: string; resourcePath: string; resourceType: string;
  trigger: keyof typeof requestTriggers; startedAt: string; durationMs: number;
  transferBytes: number; cacheHit: boolean; status: number | null;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Strip query strings (including image optimizer source URLs) and dynamic identifiers. */
export function resourcePath(path: string): string | null {
  if (!path.startsWith("/") || path.startsWith("//") || /[?#\\]/.test(path)) return null;
  const normalized = normalizeTelemetryRoute(path);
  if (!normalized) return null;
  // Known dynamic routes must also redact short IDs and readable slugs.
  return normalized
    .replace(/^(\/(?:api\/)?(?:coach|athlete)\/(?:sessions?|groups|athletes))\/(?!new(?:\/|$))[^/]+/, "$1/:id")
    .replace(/^\/(uploads|avatars)\/.*$/, "/$1/:asset");
}

export function resourceType(entry: { entryType: string; initiatorType: string; name: string }) {
  if (entry.entryType === "navigation") return "document";
  const pathname = entry.name.split("?")[0];
  if (/\.(woff2?|ttf|otf)$/i.test(pathname)) return "font";
  if (/\.css$/i.test(pathname)) return "style";
  switch (entry.initiatorType) {
    case "script": return "script";
    case "css": case "link": return "style";
    case "img": case "image": return "image";
    case "font": return "font";
    case "fetch": case "xmlhttprequest": return "fetch";
    default: return "other";
  }
}

export function observationTrigger(entry: { entryType: string; type?: string }, url: URL, type: string): RequestObservation["trigger"] {
  if (entry.entryType === "navigation") {
    return entry.type === "reload" ? "reload" : entry.type === "back_forward" ? "back_forward" : "navigation";
  }
  // _rsc proves the payload type, not whether it was prefetched, polled or clicked.
  if (type === "fetch" && url.searchParams.has("_rsc")) return "rsc";
  return ["script", "style", "image", "font"].includes(type) ? "asset" : "unknown";
}

export function parseObservations(raw: unknown, now = Date.now()): RequestObservation[] | null {
  if (!Array.isArray(raw) || raw.length > 40) return null;
  const result = new Map<string, RequestObservation>();
  for (const value of raw) {
    if (!value || typeof value !== "object") return null;
    const v = value as Record<string, unknown>;
    const route = typeof v.route === "string" ? resourcePath(v.route) : null;
    const path = typeof v.resourcePath === "string" ? resourcePath(v.resourcePath) : null;
    const time = typeof v.startedAt === "string" ? Date.parse(v.startedAt) : NaN;
    if (!route || !/^\/(coach|athlete|admin)(\/|$)/.test(route) || !path || path.startsWith("/api/monitoring/transfer")
      || typeof v.id !== "string" || !uuid.test(v.id) || typeof v.pageId !== "string" || !uuid.test(v.pageId)
      || typeof v.resourceType !== "string" || !Object.hasOwn(resourceLabels, v.resourceType)
      || typeof v.trigger !== "string" || !Object.hasOwn(requestTriggers, v.trigger)
      || !Number.isFinite(time) || time < now - 86_400_000 || time > now + 300_000
      || typeof v.durationMs !== "number" || !Number.isFinite(v.durationMs) || v.durationMs < 0 || v.durationMs > 86_400_000
      || typeof v.transferBytes !== "number" || !Number.isSafeInteger(v.transferBytes) || v.transferBytes < 0 || v.transferBytes > 100_000_000
      || typeof v.cacheHit !== "boolean"
      || !(v.status === null || (typeof v.status === "number" && Number.isInteger(v.status) && v.status >= 100 && v.status <= 599))) return null;
    result.set(v.id, { id: v.id, pageId: v.pageId, route, resourcePath: path, resourceType: v.resourceType,
      trigger: v.trigger as RequestObservation["trigger"], startedAt: new Date(time).toISOString(),
      durationMs: Math.round(v.durationMs), transferBytes: v.transferBytes, cacheHit: v.cacheHit, status: v.status as number | null });
  }
  return [...result.values()];
}

export function observationWindow(params: { hour?: string; period?: string }, now = new Date()) {
  const hours = ({ "6h": 6, "12h": 12, "24h": 24, "72h": 72, "7d": 168 } as Record<string, number>)[params.period ?? ""] ?? 24;
  const hour = params.hour ? new Date(params.hour) : null;
  if (hour && (!Number.isFinite(hour.getTime()) || hour.getUTCMinutes() !== 0 || hour.getUTCSeconds() !== 0 || hour.getUTCMilliseconds() !== 0
    || hour.getTime() < now.getTime() - 168 * 3_600_000 || hour.getTime() > now.getTime())) return null;
  return { from: hour ?? new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000 - (hours - 1) * 3_600_000), to: hour ? new Date(hour.getTime() + 3_600_000) : new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000 + 3_600_000), hours };
}
