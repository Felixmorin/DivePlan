import "server-only";
import { query } from "@/lib/db";
import { consolidateAgentFindings } from "@/lib/pr-agent-consolidation";

type RouteVolume = { route: string; requests: string; bytes: string };
type Vital = { route: string; metric: string; average: string; samples: string };
type EventCount = { type: string; count: string };
type AgentJob = { id: string; agentId: string; analysisPeriod: "24h" | "7d"; enabled: boolean; triggers: Record<string, { enabled?: boolean }> };

export async function runNextAgentJobs(targetRunId?: string) {
  let processed = 0;
  for (let index = 0; index < (targetRunId ? 1 : 5); index += 1) {
    const claimed = await query<AgentJob>(
      `WITH candidate AS (
         SELECT r.id FROM "AiAgentRun" r
         WHERE r.status = 'pending' AND r."agentId" <> ALL(ARRAY['nextjs-code-analyst','sql-supabase-analyst','diveplan-observability','architecture-cartographer']) AND ($1::text IS NULL OR r.id = $1)
           AND (r."workflowId" IS NULL OR NOT EXISTS (
             SELECT 1 FROM "AiAgentRun" previous
             WHERE previous."workflowId"=r."workflowId" AND previous.sequence<r.sequence
               AND previous.status NOT IN ('completed','failed','cancelled')
           ))
         ORDER BY r."createdAt",r."workflowId",r.sequence FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE "AiAgentRun" r SET status = 'running', "startedAt" = NOW()
       FROM candidate, "AiAgent" a
       WHERE r.id = candidate.id AND a.id = r."agentId"
      RETURNING r.id, r."agentId", r."analysisPeriod", a.enabled, a.triggers`,
      [targetRunId ?? null]
    );
    const run = claimed.rows[0];
    if (!run) break;
    processed += 1;
    try {
      if (!run.enabled || run.triggers?.onDemand?.enabled !== true) {
        await query(`UPDATE "AiAgentRun" SET status='failed', error=$2, "finishedAt"=NOW() WHERE id=$1`, [run.id, "L’agent ou son déclenchement à la demande a été désactivé avant le traitement."]);
        continue;
      }
      if (run.agentId === "pr-consolidation") {
        const consolidation = await consolidateAgentFindings();
        const result = {
          title: "Consolidation des propositions de PR",
          period: { from: new Date().toISOString(), to: new Date().toISOString(), label: "Rapports terminés disponibles" },
          sources: [{ name: "AiAgentRun", period: "Rapports terminés disponibles", samples: consolidation.examined }],
          facts: [{ category: "Rapports examinés", fact: `${consolidation.examined} rapport(s) d’agents terminés parcourus.`, evidence: "AiAgentRun · résultats terminés" }],
          findings: [],
          assumptions: ["Les propositions sont des brouillons soumis à validation humaine; aucune PR n’est créée ou fusionnée automatiquement."],
          recommendations: [`${consolidation.added} proposition(s) ajoutée(s) à l’espace de revue.`],
          missing: []
        };
        await query(`UPDATE "AiAgentRun" SET status='completed', result=$2, "finishedAt"=NOW() WHERE id=$1`, [run.id, result]);
        continue;
      }
      if (run.agentId !== "diveplan-observability") throw new Error("Aucun exécuteur n’est configuré pour cet agent.");
      const periodHours = run.analysisPeriod === "24h" ? 24 : 168;
      const [vitals, routes, errors] = await Promise.all([
        query<Vital>(`SELECT route, metric, (SUM("ratedTotalValue") / NULLIF(SUM("ratedSamples"),0))::text AS average, SUM("ratedSamples")::text AS samples
          FROM "PerformanceTelemetryHour" WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour') GROUP BY route, metric ORDER BY SUM("ratedSamples") DESC LIMIT 100`, [periodHours]),
        query<RouteVolume>(`SELECT route, SUM(requests)::text AS requests, SUM("transferBytes")::text AS bytes
          FROM "TransferTelemetryHour" WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour') GROUP BY route ORDER BY SUM("transferBytes") DESC LIMIT 20`, [periodHours]),
        query<EventCount>(`SELECT type, count(*)::text AS count FROM "AppEvent"
          WHERE "createdAt" >= NOW() - ($1::int * INTERVAL '1 hour') AND type ~* '(error|exception|failed)' GROUP BY type ORDER BY count(*) DESC LIMIT 50`, [periodHours])
      ]);
      const sources = [
        { name: "PerformanceTelemetryHour", period: run.analysisPeriod, samples: vitals.rows.length },
        { name: "TransferTelemetryHour", period: run.analysisPeriod, samples: routes.rows.length },
        { name: "AppEvent (types contenant error, exception ou failed)", period: run.analysisPeriod, samples: errors.rows.length }
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
        period: { from: new Date(Date.now() - periodHours * 3600000).toISOString(), to: new Date().toISOString(), label: run.analysisPeriod === "24h" ? "Dernières 24 heures" : "7 derniers jours" },
        sources,
        facts,
        assumptions,
        recommendations,
        missing: ["Sentry n’est pas consulté par cet agent.", "Aucune source de déploiements ou de changements Git n’est connectée.", "Les journaux d’erreurs complets ne sont pas disponibles dans AppEvent.", "Les déclencheurs planifiés, après déploiement et sur incident sont enregistrés mais aucun producteur d’événement n’est connecté."]
      };
      await query(`UPDATE "AiAgentRun" SET status='completed', result=$2, "finishedAt"=NOW() WHERE id=$1`, [run.id, result]);
    } catch (error) {
      const message = redactSecrets(error instanceof Error ? error.message : "Erreur inconnue pendant l’analyse.").slice(0, 1000);
      await query(`UPDATE "AiAgentRun" SET status='failed', error=$2, "finishedAt"=NOW() WHERE id=$1`, [run.id, message]);
    }
  }
  return processed;
}

function redactSecrets(message: string) {
  return [process.env.DATABASE_URL, process.env.CRON_SECRET]
    .filter((secret): secret is string => Boolean(secret))
    .reduce((safe, secret) => safe.replaceAll(secret, "[secret masqué]"), message);
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 octet";
  const units = ["octets", "Ko", "Mo", "Go"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exponent).toLocaleString("fr-CA", { maximumFractionDigits: 1 })} ${units[exponent]}`;
}
