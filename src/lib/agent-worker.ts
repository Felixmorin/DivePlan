import "server-only";
import { query, withReadOnlyDatabaseUrl, withReadOnlyTransaction } from "@/lib/db";
import { analyzeDivePlanSqlCode } from "@/lib/sql-agent-analysis";
import { runArchitectureCartography, summarizePreviousCartography } from "@/lib/architecture-agent";
import { consolidateAgentFindings } from "@/lib/pr-agent-consolidation";

type RouteVolume = { route: string; requests: string; bytes: string };
type Vital = { route: string; metric: string; average: string; samples: string };
type EventCount = { type: string; count: string };
type AgentJob = { id: string; agentId: string; analysisPeriod: "24h" | "7d"; enabled: boolean; triggers: Record<string, { enabled?: boolean }> };
type SupabaseQueryStat = { queryId: string; calls: string; rows: string; totalMs: string; meanMs: string; sharedReadBlocks: string; sharedHitBlocks: string };

export async function runNextAgentJobs(targetRunId?: string) {
  let processed = 0;
  for (let index = 0; index < (targetRunId ? 1 : 5); index += 1) {
    const claimed = await query<AgentJob>(
      `WITH candidate AS (
         SELECT r.id FROM "AiAgentRun" r
         WHERE r.status = 'pending' AND ($1::text IS NULL OR r.id = $1)
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
      if (run.agentId === "sql-supabase-analyst") {
        const result = await runSqlSupabaseAnalysis(run.analysisPeriod);
        await query(`UPDATE "AiAgentRun" SET status='completed', result=$2, "finishedAt"=NOW() WHERE id=$1`, [run.id, result]);
        continue;
      }
      if (run.agentId === "architecture-cartographer") {
        const previousResult = await query<{ result: unknown }>(
          `SELECT result FROM "AiAgentRun" WHERE "agentId"=$1 AND status='completed' AND id<>$2 ORDER BY "createdAt" DESC LIMIT 1`, [run.agentId, run.id]
        );
        const result = await runArchitectureCartography(summarizePreviousCartography(previousResult.rows[0]?.result));
        await query(`UPDATE "AiAgentRun" SET status='completed', result=$2, "finishedAt"=NOW() WHERE id=$1`, [run.id, result]);
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
  const statsConnection = process.env.SUPABASE_READONLY_DATABASE_URL;
  const queryStats = statsConnection ? await readSupabaseQueryStats(statsConnection) : null;
  const periodLabel = analysisPeriod === "24h" ? "Dernières 24 heures" : "7 derniers jours";
  const observed = egress.map((row) => ({
    kind: "observed" as const, priority: "medium" as const,
    impact: `${Number(row.requests).toLocaleString("fr-CA")} requêtes et ${formatBytes(Number(row.resultBytes))} de résultats SQL dans la télémétrie locale.`,
    effort: "moyen" as const, title: `Egress SQL observé · ${row.route}`, location: "DatabaseEgressTelemetryHour",
    evidence: `${row.requests} requêtes · ${row.resultBytes} octets · période ${periodLabel}`,
    limits: "Mesure issue de la télémétrie applicative enregistrée; elle n’inclut pas nécessairement tous les transferts facturés par Supabase.",
    recommendation: "Examiner les routes et les appels responsables; comparer leurs résultats avant/après une optimisation."
  }));
  const queryFindings = queryStats?.rows.map((row) => ({
    kind: "observed" as const,
    priority: "medium" as const,
    impact: `${Number(row.calls).toLocaleString("fr-CA")} appels · ${Number(row.totalMs).toLocaleString("fr-CA", { maximumFractionDigits: 1 })} ms cumulées · ${Number(row.rows).toLocaleString("fr-CA")} lignes retournées.`,
    effort: "moyen" as const,
    title: `Statistiques SQL · queryid ${row.queryId}`,
    location: "pg_stat_statements",
    evidence: `queryid=${row.queryId}; appels=${row.calls}; moyenne=${Number(row.meanMs).toLocaleString("fr-CA", { maximumFractionDigits: 2 })} ms; stats_reset=${queryStats.resetAt ?? "inconnu"}; lecture blocs=${row.sharedReadBlocks}; cache blocs=${row.sharedHitBlocks}`,
    limits: "Cumul des statistiques depuis leur réinitialisation, sans historique par jour; le texte SQL est volontairement exclu du rapport.",
    recommendation: "Examiner la requête identifiée par queryid dans un outil sécurisé, puis mesurer une optimisation avec un plan d’exécution contrôlé."
  })) ?? [];
  const codeFindings = code.findings.map((finding) => ({ ...finding, priority: finding.priority, impact: finding.impact, effort: finding.effort }));
  return {
    title: "Analyse SQL & Supabase DivePlan",
    period: { from: new Date(Date.now() - periodHours * 3600000).toISOString(), to: new Date().toISOString(), label: periodLabel },
    sources: [
      { name: "Code SQL, schéma Prisma et migrations", period: "État déployé du dépôt", samples: code.fileCount },
      { name: "DatabaseEgressTelemetryHour", period: periodLabel, samples: egress.length },
      ...(queryStats?.available ? [{ name: "pg_stat_statements", period: `Depuis ${queryStats.resetAt ?? "réinitialisation inconnue"} · cumul global`, samples: queryStats.rows.length }] : [])
    ],
    facts: [{ category: "Inventaire du code", fact: `${code.queryCount} appels SQL extraits de ${code.fileCount} fichiers analysés.`, evidence: "Scan statique des sources déployées" }, ...observed.map((finding) => ({ category: "Egress mesuré", fact: finding.impact, evidence: finding.evidence })), ...queryFindings.map((finding) => ({ category: "Statistiques Supabase", fact: finding.impact, evidence: finding.evidence }))],
    findings: [...observed, ...queryFindings, ...codeFindings].sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority])),
    assumptions: [
      ...code.assumptions.filter((item) => !item.startsWith("Aucune intégration à l’API de statistiques Supabase")),
      queryStats?.available
        ? "pg_stat_statements a été lu en lecture seule; ses compteurs sont cumulés depuis le dernier reset, pas limités à la période choisie."
        : "Les statistiques pg_stat_statements ne sont pas disponibles dans cette exécution; les constats se limitent au code et à la télémétrie interne."
    ],
    recommendations: code.findings.slice(0, 12).map((finding) => `${finding.title} (${finding.priority} · impact ${finding.impact} · effort ${finding.effort}) — ${finding.recommendation}`),
    missing: [
      ...code.missing.filter((item) => !item.startsWith("Statistiques Supabase / pg_stat_statements")),
      ...(egress.length ? [] : [`Aucune ligne d’egress interne disponible pour ${periodLabel}; la télémétrie peut être inactive ou vide.`]),
      ...(!statsConnection ? ["Statistiques Supabase: Configuration requise · définir SUPABASE_READONLY_DATABASE_URL avec un rôle de lecture seule."] : queryStats?.available ? [] : [queryStats?.message ?? "Connexion configurée, mais pg_stat_statements est absent ou non accessible en lecture seule."])
    ]
  };
}

async function readSupabaseQueryStats(connectionString: string) {
  try {
    const hostname = new URL(connectionString).hostname;
    if (!hostname.endsWith(".supabase.co") && !hostname.endsWith(".pooler.supabase.com")) {
      return { available: false as const, rows: [] as SupabaseQueryStat[], resetAt: null, message: "SUPABASE_READONLY_DATABASE_URL doit pointer vers un hôte PostgreSQL Supabase." };
    }
    return await withReadOnlyDatabaseUrl(connectionString, async (client) => {
      const extension = await client.query<{ schemaName: string }>(
        `SELECT n.nspname AS "schemaName" FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pg_stat_statements' LIMIT 1`
      );
      const schemaName = extension.rows[0]?.schemaName;
      if (!schemaName) return { available: false as const, rows: [] as SupabaseQueryStat[], resetAt: null, message: "pg_stat_statements n’est pas installée sur la base Supabase configurée." };
      const columnsResult = await client.query<{ columnName: string }>(
        `SELECT column_name AS "columnName" FROM information_schema.columns WHERE table_schema=$1 AND table_name='pg_stat_statements'`, [schemaName]
      );
      const columns = new Set(columnsResult.rows.map((row) => row.columnName));
      const timeColumn = columns.has("total_exec_time") ? "total_exec_time" : columns.has("total_time") ? "total_time" : null;
      const meanColumn = columns.has("mean_exec_time") ? "mean_exec_time" : columns.has("mean_time") ? "mean_time" : null;
      if (!columns.has("queryid") || !columns.has("calls") || !columns.has("rows") || !timeColumn || !meanColumn) {
        return { available: false as const, rows: [] as SupabaseQueryStat[], resetAt: null, message: "pg_stat_statements est présente, mais ses colonnes de lecture ne sont pas compatibles ou visibles pour ce rôle." };
      }
      const quote = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;
      const optionalColumn = (name: string) => columns.has(name) ? `${quote(name)}::text` : "'0'::text";
      const stats = await client.query<SupabaseQueryStat>(
        `SELECT queryid::text AS "queryId", calls::text AS calls, rows::text AS rows,
          ${quote(timeColumn)}::text AS "totalMs", ${quote(meanColumn)}::text AS "meanMs",
          ${optionalColumn("shared_blks_read")} AS "sharedReadBlocks", ${optionalColumn("shared_blks_hit")} AS "sharedHitBlocks"
         FROM ${quote(schemaName)}."pg_stat_statements"
         WHERE calls > 0 ORDER BY ${quote(timeColumn)} DESC LIMIT 20`
      );
      let resetAt: string | null = null;
      const infoAvailable = await client.query<{ available: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema=$1 AND table_name='pg_stat_statements_info') AS available`, [schemaName]
      );
      if (infoAvailable.rows[0]?.available) {
        try {
          const reset = await client.query<{ statsReset: string | null }>(`SELECT stats_reset::text AS "statsReset" FROM ${quote(schemaName)}."pg_stat_statements_info" LIMIT 1`);
          resetAt = reset.rows[0]?.statsReset ?? null;
        } catch { /* Some provider roles can query statistics but not the reset metadata. */ }
      }
      return { available: true as const, rows: stats.rows, resetAt, message: null };
    });
  } catch (error) {
    return { available: false as const, rows: [] as SupabaseQueryStat[], resetAt: null, message: describeStatsConnectionFailure(error) };
  }
}

function describeStatsConnectionFailure(error: unknown) {
  const candidate = error && typeof error === "object" ? error as { code?: unknown; message?: unknown } : {};
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message = typeof candidate.message === "string" ? candidate.message.toLowerCase() : "";
  if (code === "28P01" || code === "28000") {
    return "Connexion statistique refusée par PostgreSQL (authentification ou rôle). Vérifier l’utilisateur et son autorisation de connexion.";
  }
  if (code === "42501") {
    return "Connexion établie, mais le rôle en lecture seule n’a pas les permissions requises pour consulter pg_stat_statements.";
  }
  if (code === "3F000" || code === "42P01") {
    return "La connexion fonctionne, mais pg_stat_statements ou son schéma est introuvable pour ce rôle.";
  }
  if (["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ETIMEDOUT", "ECONNRESET"].includes(code)) {
    return "Connexion au serveur statistique impossible (résolution DNS, réseau ou port). Vérifier l’hôte et le port Supabase.";
  }
  if (/certificate|tls|ssl|self.signed|issuer/.test(message) || code.startsWith("ERR_TLS")) {
    return "Échec de la connexion TLS au serveur statistique. Vérifier le mode TLS et le certificat CA Supabase.";
  }
  if (error instanceof TypeError) {
    return "URL de connexion statistique invalide. Vérifier le format de SUPABASE_READONLY_DATABASE_URL sans afficher son contenu.";
  }
  return "Connexion statistique indisponible. Vérifier le rôle en lecture seule, l’accès à pg_stat_statements, TLS et la connectivité réseau.";
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 octet";
  const units = ["octets", "Ko", "Mo", "Go"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exponent).toLocaleString("fr-CA", { maximumFractionDigits: 1 })} ${units[exponent]}`;
}
