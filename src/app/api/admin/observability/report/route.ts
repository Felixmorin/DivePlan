import { requireAdmin } from "@/lib/current-user";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

const periodHours: Record<string, number> = { "1h": 1, "3h": 3, "6h": 6, "12h": 12, "24h": 24, "72h": 72, "7d": 168 };
const detailLimit = 5_000;

type TelemetryRow = Record<string, string | number | boolean | Date | null>;

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

  const [transfers, database, vitals, browserObservations, browserCount, serverRequests, serverCount, appEvents] = await Promise.all([
    query<TelemetryRow>(`SELECT hour, route, "resourceType", SUM(requests)::text AS requests, SUM("transferBytes")::text AS "transferBytes", SUM("cacheHits")::text AS "cacheHits"
      FROM "TransferTelemetryHour" WHERE hour >= $1 GROUP BY hour, route, "resourceType" ORDER BY hour, route, "resourceType"`, [aggregateSince]),
    query<TelemetryRow>(`SELECT hour, route, component, SUM(requests)::text AS requests, SUM("resultBytes")::text AS "resultBytes", SUM("durationMs")::text AS "durationMs", MAX("maxDurationMs")::text AS "maxDurationMs", SUM("slowQueries")::text AS "slowQueries"
      FROM "DatabaseEgressTelemetryHour" WHERE hour >= $1 GROUP BY hour, route, component ORDER BY hour, route, component`, [aggregateSince]),
    query<TelemetryRow>(`SELECT hour, route, metric, SUM(samples)::text AS samples, SUM("totalValue")::text AS "totalValue", MAX("maxValue")::text AS "maxValue"
      FROM "PerformanceTelemetryHour" WHERE hour >= $1 GROUP BY hour, route, metric ORDER BY hour, route, metric`, [aggregateSince]),
    query<TelemetryRow>(`SELECT id::text, "pageId"::text AS "pageId", route, "resourcePath", "resourceType", trigger, "startedAt", durationMs, "transferBytes"::text AS "transferBytes", "cacheHit", status, "serverRequestId"::text AS "serverRequestId"
      FROM "RequestObservation" WHERE "startedAt" >= $1 ORDER BY "startedAt" DESC, id DESC LIMIT $2`, [since, limit]),
    query<{ count: string }>(`SELECT count(*)::text AS count FROM "RequestObservation" WHERE "startedAt" >= $1`, [since]),
    query<TelemetryRow>(`SELECT id::text, route, trigger, "startedAt", "queryCount", "resultBytes"::text AS "resultBytes", "sqlDurationMs", "errorCount"
      FROM "ServerRequestMetric" WHERE "startedAt" >= $1 ORDER BY "startedAt" DESC, id DESC LIMIT $2`, [since, limit]),
    query<{ count: string }>(`SELECT count(*)::text AS count FROM "ServerRequestMetric" WHERE "startedAt" >= $1`, [since]),
    query<TelemetryRow>(`SELECT date_trunc('hour', "createdAt") AS hour, type, count(*)::text AS count
      FROM "AppEvent" WHERE "createdAt" >= $1 GROUP BY date_trunc('hour', "createdAt"), type ORDER BY hour, type`, [since]),
  ]);

  const browserTotal = Number(browserCount.rows[0]?.count ?? 0);
  const serverTotal = Number(serverCount.rows[0]?.count ?? 0);
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
      "Compare les routes et heures entre elles, relève les statuts HTTP >= 400, les événements d'erreur, les hausses de volume, les durées SQL, les requêtes lentes et les Web Vitals dégradés.",
      "Pour chaque constat, cite les champs et valeurs concernés, estime la confiance, indique les explications bénignes possibles et propose une vérification concrète.",
      "N'invente pas de seuils absents du rapport. Signale les données manquantes et sépare les anomalies confirmées des pistes à vérifier.",
    ],
    coverage: {
      transferHourlyRows: transfers.rows.length,
      databaseEgressHourlyRows: database.rows.length,
      webVitalsHourlyRows: vitals.rows.length,
      browserObservations: { total: browserTotal, included: browserObservations.rows.length, limit, truncated: browserTotal > browserObservations.rows.length },
      serverRequests: { total: serverTotal, included: serverRequests.rows.length, limit, truncated: serverTotal > serverRequests.rows.length },
      appEventGroups: appEvents.rows.length,
      notes: [
        "Les tableaux horaires sont complets pour la période sélectionnée; ils sont agrégés par heure et par dimensions indiquées.",
        "Les agrégats horaires peuvent inclure le début de l'heure UTC qui précède la borne exacte de la période; les observations individuelles utilisent la borne exacte.",
        "Les observations navigateur ne sont collectées que pour les ressources same-origin visibles par le navigateur.",
        "Le statut HTTP peut être nul si le navigateur ne l'expose pas.",
        "Les événements applicatifs sont groupés par heure et par type; les textes et métadonnées ne sont pas exportés pour protéger la vie privée.",
      ],
    },
    telemetry: {
      browserTransfersHourly: transfers.rows,
      databaseEgressHourly: database.rows,
      webVitalsHourly: vitals.rows,
      browserObservations: browserObservations.rows,
      serverRequests: serverRequests.rows,
      appEventsHourlyByType: appEvents.rows,
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
