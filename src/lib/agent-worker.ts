import "server-only";
import { query } from "@/lib/db";

type RouteVolume = { route: string; requests: string; bytes: string };
type Vital = { route: string; metric: string; average: string; samples: string };
type EventCount = { type: string; count: string };

export async function runNextAgentJobs() {
  let processed = 0;
  for (let index = 0; index < 5; index += 1) {
    const claimed = await query<{ id: string; agentId: string }>(
      `WITH candidate AS (
         SELECT id FROM "AiAgentRun" WHERE status = 'pending' ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE "AiAgentRun" r SET status = 'running', "startedAt" = NOW()
       FROM candidate WHERE r.id = candidate.id RETURNING r.id, r."agentId"`,
    );
    const run = claimed.rows[0];
    if (!run) break;
    processed += 1;
    try {
      const [vitals, routes, errors] = await Promise.all([
        query<Vital>(`SELECT route, metric, (SUM("ratedTotalValue") / NULLIF(SUM("ratedSamples"),0))::text AS average, SUM("ratedSamples")::text AS samples
          FROM "PerformanceTelemetryHour" WHERE hour >= NOW() - INTERVAL '7 days' GROUP BY route, metric ORDER BY SUM("ratedSamples") DESC LIMIT 100`),
        query<RouteVolume>(`SELECT route, SUM(requests)::text AS requests, SUM("transferBytes")::text AS bytes
          FROM "TransferTelemetryHour" WHERE hour >= NOW() - INTERVAL '7 days' GROUP BY route ORDER BY SUM("transferBytes") DESC LIMIT 20`),
        query<EventCount>(`SELECT type, count(*)::text AS count FROM "AppEvent"
          WHERE "createdAt" >= NOW() - INTERVAL '7 days' AND type ~* '(error|exception|failed)' GROUP BY type ORDER BY count(*) DESC LIMIT 50`)
      ]);
      const sources = [
        { name: "PerformanceTelemetryHour", period: "7 derniers jours", samples: vitals.rows.length },
        { name: "TransferTelemetryHour", period: "7 derniers jours", samples: routes.rows.length },
        { name: "AppEvent (types contenant error, exception ou failed)", period: "7 derniers jours", samples: errors.rows.length }
      ];
      const facts = [
        ...vitals.rows.map((v) => ({ category: "Web Vitals", fact: `${v.metric} moyen : ${Number(v.average).toLocaleString("fr-CA", { maximumFractionDigits: 2 })} (${v.samples} échantillons) sur ${v.route}.`, evidence: `PerformanceTelemetryHour · ${v.route} · ${v.metric}` })),
        ...routes.rows.slice(0, 10).map((r) => ({ category: "Volume par route", fact: `${r.route} : ${Number(r.requests).toLocaleString("fr-CA")} requêtes, ${formatBytes(Number(r.bytes))} transférés.`, evidence: `TransferTelemetryHour · ${r.route}` })),
        ...errors.rows.map((e) => ({ category: "Événements signalés", fact: `${e.type} : ${e.count} événements.`, evidence: `AppEvent.type=${e.type}` }))
      ];
      const assumptions = [
        "Les agrégats Web Vitals ne contiennent que des moyennes et des échantillons; les percentiles et les changements historiques de code ne sont pas disponibles dans ces sources.",
        "Les événements AppEvent sont des événements applicatifs, pas un flux complet des exceptions serveur ou navigateur.",
        "Le volume de transfert indique les octets et requêtes par route observée, pas les temps de réponse réseau ou les coûts d’hébergement."
      ];
      const recommendations = [
        ...(vitals.rows.length ? ["Comparer les routes et métriques les plus échantillonnées avant et après un changement de code, puis profiler les routes qui se dégradent."] : ["Activer et vérifier la collecte de Web Vitals en production pour obtenir LCP, FCP et les autres métriques."]),
        ...(routes.rows.length ? ["Examiner les routes au volume transféré le plus élevé et réduire les payloads ou les ressources répétées si les données produit le permettent."] : ["Aucun agrégat de transfert n’est disponible pour les sept derniers jours; vérifier que la collecte et la télémétrie sont actives."]),
        ...(errors.rows.length ? ["Corréler les types d’événements récurrents avec les journaux d’incidents avant de prioriser un correctif."] : ["Aucun événement correspondant à error, exception ou failed n’a été trouvé; une intégration d’erreurs dédiée est nécessaire pour mesurer leur fréquence réelle."]),
        "Relier Sentry ou une source de déploiements avant d’attribuer une régression à une version ou à un changement précis."
      ];
      const result = {
        title: "Rapport d’observabilité DivePlan",
        period: { from: new Date(Date.now() - 7 * 86400000).toISOString(), to: new Date().toISOString(), label: "7 derniers jours" },
        sources,
        facts,
        assumptions,
        recommendations,
        missing: ["Sentry n’est pas consulté par cet agent.", "Aucune source de déploiements ou de changements Git n’est connectée.", "Les journaux d’erreurs complets ne sont pas disponibles dans AppEvent.", "Les déclencheurs planifiés, après déploiement et sur incident sont enregistrés mais aucun producteur d’événement n’est connecté."]
      };
      await query(`UPDATE "AiAgentRun" SET status='completed', result=$2, "finishedAt"=NOW() WHERE id=$1`, [run.id, result]);
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 1000) : "Erreur inconnue pendant l’analyse.";
      await query(`UPDATE "AiAgentRun" SET status='failed', error=$2, "finishedAt"=NOW() WHERE id=$1`, [run.id, message]);
    }
  }
  return processed;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 octet";
  const units = ["octets", "Ko", "Mo", "Go"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exponent).toLocaleString("fr-CA", { maximumFractionDigits: 1 })} ${units[exponent]}`;
}
