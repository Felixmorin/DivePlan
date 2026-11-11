import { requireAdmin } from "@/lib/current-user";
import { query } from "@/lib/db";
import type { QueryResultRow } from "pg";

export const dynamic = "force-dynamic";

const periodHours: Record<string, number> = { "1h": 1, "3h": 3, "6h": 6, "12h": 12, "24h": 24, "72h": 72, "7d": 168 };
const detailLimit = 5_000;

type TelemetryRow = Record<string, string | number | boolean | Date | null>;
type CollectionIssue = { source: string; category: "schema_unavailable" | "query_failed"; code: string | null };

async function readRows<Row extends QueryResultRow>(issues: CollectionIssue[], source: string, sql: string, values: unknown[] = []) {
  try {
    return (await query<Row>(sql, values)).rows;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : null;
    issues.push({ source, category: code === "42P01" || code === "42703" ? "schema_unavailable" : "query_failed", code });
    return [] as Row[];
  }
}

export async function GET(request: Request) {
  await requireAdmin();
  const period = new URL(request.url).searchParams.get("period") ?? "24h";
  const hours = periodHours[period];
  if (!hours) return new Response("Période invalide", { status: 400 });

  const from = new Date(Date.now() - hours * 3_600_000);
  const to = new Date();
  const since = from.toISOString();
  const aggregateSince = new Date(Math.floor(from.getTime() / 3_600_000) * 3_600_000).toISOString();
  const limit = detailLimit;
  const collectionIssues: CollectionIssue[] = [];

  const [transfers, database, vitals, browserObservations, browserCount, serverRequests, serverCount, appEvents, eventUsers, eventUsersHourly, requestFrequency] = await Promise.all([
    readRows<TelemetryRow>(collectionIssues, "browserTransfersHourly", `SELECT hour, route, "resourceType", SUM(requests)::text AS requests, SUM("transferBytes")::text AS "transferBytes", SUM("cacheHits")::text AS "cacheHits"
      FROM "TransferTelemetryHour" WHERE hour >= $1 GROUP BY hour, route, "resourceType" ORDER BY hour, route, "resourceType"`, [aggregateSince]),
    readRows<TelemetryRow>(collectionIssues, "databaseEgressHourly", `SELECT hour, route, component, SUM(requests)::text AS requests, SUM("resultBytes")::text AS "resultBytes", SUM("durationMs")::text AS "durationMs", MAX("maxDurationMs")::text AS "maxDurationMs", SUM("slowQueries")::text AS "slowQueries"
      FROM "DatabaseEgressTelemetryHour" WHERE hour >= $1 GROUP BY hour, route, component ORDER BY hour, route, component`, [aggregateSince]),
    readRows<TelemetryRow>(collectionIssues, "webVitalsHourly", `SELECT hour, route, metric, SUM(samples)::text AS samples, SUM("totalValue")::text AS "totalValue", MAX("maxValue")::text AS "maxValue"
      FROM "PerformanceTelemetryHour" WHERE hour >= $1 GROUP BY hour, route, metric ORDER BY hour, route, metric`, [aggregateSince]),
    readRows<TelemetryRow>(collectionIssues, "browserObservations", `SELECT id::text, "pageId"::text AS "pageId", route, "resourcePath", "resourceType", trigger, "startedAt", "durationMs", "transferBytes"::text AS "transferBytes", "cacheHit", status, "serverRequestId"::text AS "serverRequestId"
      FROM "RequestObservation" WHERE "startedAt" >= $1 ORDER BY "startedAt" DESC, id DESC LIMIT $2`, [since, limit]),
    readRows<{ count: string }>(collectionIssues, "browserObservationsCount", `SELECT count(*)::text AS count FROM "RequestObservation" WHERE "startedAt" >= $1`, [since]),
    readRows<TelemetryRow>(collectionIssues, "serverRequests", `SELECT id::text, route, trigger, "startedAt", "queryCount", "resultBytes"::text AS "resultBytes", "sqlDurationMs", "errorCount"
      FROM "ServerRequestMetric" WHERE "startedAt" >= $1 ORDER BY "startedAt" DESC, id DESC LIMIT $2`, [since, limit]),
    readRows<{ count: string }>(collectionIssues, "serverRequestsCount", `SELECT count(*)::text AS count FROM "ServerRequestMetric" WHERE "startedAt" >= $1`, [since]),
    readRows<TelemetryRow>(collectionIssues, "appEventsHourlyByType", `SELECT date_trunc('hour', "createdAt") AS hour, type, count(*)::text AS count
      FROM "AppEvent" WHERE "createdAt" >= $1 GROUP BY date_trunc('hour', "createdAt"), type ORDER BY hour, type`, [since]),
    readRows<TelemetryRow>(collectionIssues, "eventUsers", `SELECT count(DISTINCT "userId")::text AS "usersWithEvents", count(*) FILTER (WHERE "userId" IS NULL)::text AS "eventsWithoutUser"
      FROM "AppEvent" WHERE "createdAt" >= $1 AND "createdAt" <= $2`, [since, to.toISOString()]),
    readRows<TelemetryRow>(collectionIssues, "eventUsersHourly", `SELECT date_trunc('hour', "createdAt") AS hour, count(DISTINCT "userId")::text AS "usersWithEvents"
      FROM "AppEvent" WHERE "createdAt" >= $1 AND "createdAt" <= $2 GROUP BY 1 ORDER BY 1`, [since, to.toISOString()]),
    readRows<TelemetryRow>(collectionIssues, "requestFrequency", `WITH per_page_minute AS (
      SELECT "resourcePath", "pageId", date_trunc('minute', "startedAt") AS minute, count(*) AS requests
      FROM "RequestObservation" WHERE "startedAt" >= $1 AND "startedAt" <= $2 AND "resourceType" = 'fetch'
      GROUP BY "resourcePath", "pageId", date_trunc('minute', "startedAt")
    ) SELECT "resourcePath", sum(requests)::text AS requests, count(DISTINCT "pageId")::text AS pages,
      max(requests)::text AS "maxRequestsPerPageMinute" FROM per_page_minute GROUP BY "resourcePath" ORDER BY sum(requests) DESC, "resourcePath"`, [since, to.toISOString()]),
  ]);

  const browserTotal = browserCount[0]?.count == null ? null : Number(browserCount[0].count);
  const serverTotal = serverCount[0]?.count == null ? null : Number(serverCount[0].count);
  const issuesBySource = new Set(collectionIssues.map((issue) => issue.source.replace(/Count$/, "")));
  const report = {
    title: "Rapport de télémétrie DivePlan",
    schemaVersion: 1,
    generatedAt: to.toISOString(),
    period: { label: period, hours, from: from.toISOString(), to: to.toISOString(), timezone: "UTC" },
    privacy: {
      scope: "Toutes les données de télémétrie du site, tous clubs confondus.",
      anonymized: true,
      excluded: ["Identifiants et noms de clubs", "Identifiants, noms et adresses courriel des utilisateurs", "Messages et métadonnées des événements applicatifs", "Contenu SQL et paramètres", "Corps des requêtes et réponses"],
    },
    analysisGuide: [
      "Analyse les mesures comme des indices, pas comme une preuve isolée d'anomalie.",
      "Distingue les agrégats horaires des observations individuelles et rappelle toute limite de couverture ou troncature.",
      "Les requêtes navigateur de type script/style/image/font représentent des ressources chargées, pas des visites ni des actions API.",
      "Pour suspecter une boucle, cherche des appels répétés et rapprochés vers la même route ou ressource; une page avec plusieurs scripts ou des ressources en cache ne suffit pas.",
      "Utilise les utilisateurs ayant produit un événement comme indicateur partiel d'activité, pas comme nombre total d'utilisateurs ni comme mesure de concurrence. Examine les pics par page et minute sans présumer qu'ils indiquent une boucle.",
      "Compare les routes et heures entre elles, relève les statuts HTTP >= 400, les événements d'erreur, les hausses de volume, les durées SQL, les requêtes lentes et les Web Vitals dégradés.",
      "Pour chaque constat, cite les champs et valeurs concernés, estime la confiance, indique les explications bénignes possibles et propose une vérification concrète.",
      "N'invente pas de seuils absents du rapport. Signale les données manquantes et sépare les anomalies confirmées des pistes à vérifier.",
    ],
    coverage: {
      transferHourlyRows: transfers.length,
      databaseEgressHourlyRows: database.length,
      webVitalsHourlyRows: vitals.length,
      browserObservations: { total: browserTotal, included: browserObservations.length, limit, truncated: browserTotal === null ? null : browserTotal > browserObservations.length },
      serverRequests: { total: serverTotal, included: serverRequests.length, limit, truncated: serverTotal === null ? null : serverTotal > serverRequests.length },
      appEventGroups: appEvents.length,
      unavailableSources: [...issuesBySource],
      collectionIssues,
      notes: [
        "Les tableaux horaires sont complets pour la période sélectionnée; ils sont agrégés par heure et par dimensions indiquées.",
        "Les agrégats horaires peuvent inclure le début de l'heure UTC qui précède la borne exacte de la période; les observations individuelles utilisent la borne exacte.",
        "Les observations navigateur ne sont collectées que pour les ressources same-origin visibles par le navigateur.",
        "Le statut HTTP peut être nul si le navigateur ne l'expose pas.",
        "Les événements applicatifs sont groupés par heure et par type; les textes et métadonnées ne sont pas exportés pour protéger la vie privée.",
        "Les utilisateurs distincts proviennent uniquement des événements associés à un utilisateur; leur nombre horaire ne mesure pas les connexions simultanées.",
        "La fréquence par page concerne uniquement les fetch observés, sans identifiant de page exporté dans cet agrégat; une page n'est pas nécessairement un utilisateur. Les détails sont soumis à la rétention des observations.",
      ],
    },
    telemetry: {
      browserTransfersHourly: transfers,
      databaseEgressHourly: database,
      webVitalsHourly: vitals,
      browserObservations,
      serverRequests,
      appEventsHourlyByType: appEvents,
      activity: { eventUsers: eventUsers[0] ?? null, eventUsersHourly, requestFrequency },
    },
  };

  const body = JSON.stringify(report, null, 2);
  const filename = `rapport-telemetrie-diveplan-${period}-${to.toISOString().slice(0, 10)}.json`;
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
