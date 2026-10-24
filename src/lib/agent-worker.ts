import "server-only";
import { query, withReadOnlyTransaction } from "@/lib/db";
import { analyzeDivePlanSqlCode } from "@/lib/sql-agent-analysis";

type RouteVolume = { route: string; requests: string; bytes: string };
type Vital = { route: string; metric: string; average: string; samples: string };
type EventCount = { type: string; count: string };
type AgentJob = { id: string; agentId: string; analysisPeriod: "24h" | "7d"; enabled: boolean; triggers: Record<string, { enabled?: boolean }> };

export async function runNextAgentJobs() {
  let processed = 0;
  for (let index = 0; index < 5; index += 1) {
    const claimed = await query<AgentJob>(
      `WITH candidate AS (
         SELECT r.id FROM "AiAgentRun" r WHERE r.status = 'pending' ORDER BY r."createdAt" FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE "AiAgentRun" r SET status = 'running', "startedAt" = NOW()
       FROM candidate, "AiAgent" a
       WHERE r.id = candidate.id AND a.id = r."agentId"
       RETURNING r.id, r."agentId", r."analysisPeriod", a.enabled, a.triggers`,
    );
    const run = claimed.rows[0];
    if (!run) break;
    processed += 1;
    try {
      if (!run.enabled || run.triggers?.onDemand?.enabled !== true) {
        await query(`UPDATE "AiAgentRun" SET status='failed', error=$2, "finishedAt"=NOW() WHERE id=$1`, [run.id, "L’agent ou son déclenchement à la demande a été désactivé avant le traitement."]);
        continue;
      }
      if (run.agentId === "sql-supabase-analyst") {
        const result = await runSqlSupabaseAnalysis(run.analysisPeriod);
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
      const message = run.agentId === "sql-supabase-analyst"
        ? "L’analyse SQL a échoué. Vérifier les journaux serveur et les permissions de lecture seule."
        : redactSecrets(error instanceof Error ? error.message : "Erreur inconnue pendant l’analyse.").slice(0, 1000);
      await query(`UPDATE "AiAgentRun" SET status='failed', error=$2, "finishedAt"=NOW() WHERE id=$1`, [run.id, message]);
    }
  }
  return processed;
}

function redactSecrets(message: string) {
  return [process.env.DATABASE_URL, process.env.SUPABASE_READONLY_DATABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.CRON_SECRET]
    .filter((secret): secret is string => Boolean(secret))
    .reduce((safe, secret) => safe.replaceAll(secret, "[secret masqué]"), message);
}

async function runSqlSupabaseAnalysis(analysisPeriod: "24h" | "7d") {
  const periodHours = analysisPeriod === "24h" ? 24 : 168;
  const code = await analyzeDivePlanSqlCode();
  const egress = await withReadOnlyTransaction(async (client) => {
    const result = await client.query<{ route: string; requests: string; resultBytes: string }>(
      `SELECT route, SUM(requests)::text AS requests, SUM("resultBytes")::text AS "resultBytes"
       FROM "DatabaseEgressTelemetryHour" WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour')
       GROUP BY route ORDER BY SUM("resultBytes") DESC LIMIT 20`, [periodHours]
    );
    return result.rows;
  });
  const periodLabel = analysisPeriod === "24h" ? "Dernières 24 heures" : "7 derniers jours";
  const observed = egress.map((row) => ({
    kind: "observed" as const, priority: "medium" as const,
    impact: `${Number(row.requests).toLocaleString("fr-CA")} requêtes et ${formatBytes(Number(row.resultBytes))} de résultats SQL dans la télémétrie locale.`,
    effort: "moyen" as const, title: `Egress SQL observé · ${row.route}`, location: "DatabaseEgressTelemetryHour",
    evidence: `${row.requests} requêtes · ${row.resultBytes} octets · période ${periodLabel}`,
    limits: "Mesure issue de la télémétrie applicative enregistrée; elle n’inclut pas nécessairement tous les transferts facturés par Supabase.",
    recommendation: "Examiner les routes et les appels responsables; comparer leurs résultats avant/après une optimisation."
  }));
  const codeFindings = code.findings.map((finding) => ({ ...finding, priority: finding.priority, impact: finding.impact, effort: finding.effort }));
  return {
    title: "Analyse SQL & Supabase DivePlan",
    period: { from: new Date(Date.now() - periodHours * 3600000).toISOString(), to: new Date().toISOString(), label: periodLabel },
    sources: [
      { name: "Code SQL, schéma Prisma et migrations", period: "État déployé du dépôt", samples: code.fileCount },
      { name: "DatabaseEgressTelemetryHour", period: periodLabel, samples: egress.length }
    ],
    facts: [{ category: "Inventaire du code", fact: `${code.queryCount} appels SQL extraits de ${code.fileCount} fichiers analysés.`, evidence: "Scan statique des sources déployées" }, ...observed.map((finding) => ({ category: "Egress mesuré", fact: finding.impact, evidence: finding.evidence }))],
    findings: [...observed, ...codeFindings].sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority])),
    assumptions: code.assumptions,
    recommendations: code.findings.slice(0, 12).map((finding) => `${finding.title} (${finding.priority} · impact ${finding.impact} · effort ${finding.effort}) — ${finding.recommendation}`),
    missing: [...code.missing, ...(egress.length ? [] : [`Aucune ligne d’egress interne disponible pour ${periodLabel}; la télémétrie peut être inactive ou vide.`])]
  };
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 octet";
  const units = ["octets", "Ko", "Mo", "Go"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exponent).toLocaleString("fr-CA", { maximumFractionDigits: 1 })} ${units[exponent]}`;
}
