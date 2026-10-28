import { getRequestExport } from "@/lib/request-explorer";
import { requireAdmin } from "@/lib/current-user";
import { observationWindow, requestTriggers, resourceLabels, resourcePath } from "@/lib/request-observation";

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  await requireAdmin();
  const params = new URL(request.url).searchParams;
  const format = params.get("format");
  if (format !== "csv" && format !== "json") return new Response("Format invalide", { status: 400 });
  const rawHour = params.get("hour") ?? undefined;
  const rawPeriod = params.get("period") ?? undefined;
  const window = observationWindow({ hour: rawHour, period: rawPeriod });
  const rawRoute = params.get("route");
  const route = rawRoute ? resourcePath(rawRoute) : null;
  const rawType = params.get("type");
  const type = rawType && Object.hasOwn(resourceLabels, rawType) ? rawType : null;
  const rawTrigger = params.get("trigger");
  const trigger = rawTrigger && Object.hasOwn(requestTriggers, rawTrigger) ? rawTrigger : null;
  const rawPageId = params.get("pageId");
  const pageId = rawPageId && uuid.test(rawPageId) ? rawPageId : null;
  if (!window || (rawRoute && !route) || (rawType && !type) || (rawTrigger && !trigger) || (rawPageId && !pageId)) {
    return new Response("Filtres invalides", { status: 400 });
  }
  const rows = await getRequestExport({ ...window, route, type, trigger, pageId });
  const fields = ["id", "pageId", "route", "resourcePath", "resourceType", "resourceTypeLabel", "trigger", "triggerLabel", "startedAt", "receivedAt", "durationMs", "transferBytes", "cacheHit", "status", "clubId", "serverRequestId"];
  const records = rows.map(row => ({ ...row, resourceTypeLabel: resourceLabels[row.resourceType] ?? row.resourceType, triggerLabel: requestTriggers[row.trigger] ?? row.trigger }));
  const body = format === "json"
    ? JSON.stringify(records, null, 2)
    : [fields.join(","), ...records.map(record => fields.map(field => csvCell((record as Record<string, unknown>)[field])).join(","))].join("\r\n");
  const filename = `requêtes-individuelles-${window.from.toISOString().slice(0, 10)}.${format}`;
  return new Response(format === "json" ? body : `\uFEFF${body}`, {
    headers: {
      "Content-Type": format === "json" ? "application/json; charset=utf-8" : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}

function csvCell(value: unknown) {
  let text = value instanceof Date ? value.toISOString() : value == null ? "" : String(value);
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
