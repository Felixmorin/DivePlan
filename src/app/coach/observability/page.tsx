import { AlertTriangle, CheckCircle2, Lightbulb } from "lucide-react";
import { CoachShell } from "@/components/coach/coach-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCoach } from "@/lib/current-user";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

type TransferRow = { route: string; resourceType: string; requests: number; transferBytes: number; cacheHits: number };
type PerformanceRow = { route: string; metric: string; samples: number; average: number; maximum: number };
type Recommendation = { title: string; evidence: string; action: string; priority: "Élevée" | "À surveiller" };

export default async function ObservabilityPage() {
  const { clubId } = await requireCoach();
  if (clubId === "dev-club") {
    return (
      <CoachShell active="Observabilité">
        <PageHeader description="Des règles concrètes pour repérer les optimisations de consommation." />
        <Card><CardContent className="p-5 text-sm text-[var(--color-ink-muted)]">
          La démonstration locale n’a pas de base de données de club. Pour recueillir des mesures, utilise un compte de club avec PostgreSQL, applique les migrations décrites dans <code>docs/transfer-monitoring.md</code>, puis active la collecte locale.
        </CardContent></Card>
        <Recommendations rows={[]} performanceRows={[]} />
        <TransferReport totalBytes={0} rows={[]} />
        <PerformanceReport rows={[]} />
      </CoachShell>
    );
  }

  const [transferResult, performanceResult] = await Promise.all([
    query<{ route: string; resourceType: string; requests: string; transferBytes: string; cacheHits: string; totalBytes: string }>(
      `SELECT route, "resourceType", SUM(requests)::text AS requests,
         SUM("transferBytes")::text AS "transferBytes", SUM("cacheHits")::text AS "cacheHits",
         SUM(SUM("transferBytes")) OVER ()::text AS "totalBytes"
       FROM "TransferTelemetryHour"
       WHERE "clubId" = $1 AND hour >= NOW() - INTERVAL '24 hours'
       GROUP BY route, "resourceType"
       ORDER BY SUM("transferBytes") DESC, SUM(requests) DESC
       LIMIT 20`, [clubId]
    ),
    query<{ route: string; metric: string; samples: string; average: string; maximum: string }>(
      `SELECT route, metric, SUM(samples)::text AS samples,
         (SUM("totalValue") / NULLIF(SUM(samples), 0))::text AS average,
         MAX("maxValue")::text AS maximum
       FROM "PerformanceTelemetryHour"
       WHERE "clubId" = $1 AND hour >= NOW() - INTERVAL '24 hours'
       GROUP BY route, metric
       ORDER BY MAX("maxValue") DESC
       LIMIT 30`, [clubId]
    )
  ]);

  const transferRows: TransferRow[] = transferResult.rows.map((row) => ({
    route: row.route,
    resourceType: row.resourceType,
    requests: Number(row.requests),
    transferBytes: Number(row.transferBytes),
    cacheHits: Number(row.cacheHits)
  }));
  const performanceRows: PerformanceRow[] = performanceResult.rows.map((row) => ({
    route: row.route,
    metric: row.metric,
    samples: Number(row.samples),
    average: Number(row.average),
    maximum: Number(row.maximum)
  }));
  const totalBytes = Number(transferResult.rows[0]?.totalBytes ?? 0);

  return (
    <CoachShell active="Observabilité">
      <PageHeader description="Règles basées sur les mesures des dernières 24 heures pour réduire les transferts et repérer les pages lentes." />
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <MetricCard label="Transfert observé" value={formatBytes(totalBytes)} detail="réponses même origine · 24 h" />
        <MetricCard label="Mesures de performance" value={performanceRows.reduce((sum, row) => sum + row.samples, 0).toLocaleString("fr-CA")} detail="échantillons navigateur · 24 h" />
      </div>
      <Recommendations rows={transferRows} performanceRows={performanceRows} />
      <TransferReport totalBytes={totalBytes} rows={transferRows} />
      <PerformanceReport rows={performanceRows} />
    </CoachShell>
  );
}

function PageHeader({ description }: { description: string }) {
  return (
    <div className="mb-6">
      <p className="text-sm font-black uppercase text-[var(--color-brand-strong)]">Administration</p>
      <h1 className="mt-2 text-3xl font-black text-[var(--color-ink)]">Observabilité</h1>
      <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{description}</p>
    </div>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card><CardContent className="p-5">
      <div className="text-3xl font-black text-[var(--color-ink)]">{value}</div>
      <div className="text-xs font-black uppercase text-[var(--color-ink-muted)]">{label}</div>
      <div className="text-xs font-bold text-[var(--color-ink-soft)]">{detail}</div>
    </CardContent></Card>
  );
}

function Recommendations({ rows, performanceRows }: { rows: TransferRow[]; performanceRows: PerformanceRow[] }) {
  const recommendations: Recommendation[] = [];
  const staticTypes = new Set(["script", "style", "image", "font"]);

  for (const row of rows) {
    const averageBytes = row.requests ? row.transferBytes / row.requests : 0;
    if (row.resourceType === "script" && averageBytes >= 100 * 1024) {
      recommendations.push({
        title: `Alléger le JavaScript sur ${row.route}`,
        evidence: `${formatBytes(averageBytes)} transférés en moyenne par requête (${row.requests} requêtes).`,
        action: "Repérer les imports lourds et charger à la demande les composants qui ne sont pas visibles au premier écran.",
        priority: "Élevée"
      });
    } else if (row.resourceType === "fetch" && averageBytes >= 50 * 1024) {
      recommendations.push({
        title: `Réduire les réponses de données sur ${row.route}`,
        evidence: `${formatBytes(averageBytes)} transférés en moyenne par réponse (${row.requests} requêtes).`,
        action: "Limiter les champs retournés, paginer les longues listes et différer les données sous la ligne de flottaison.",
        priority: "Élevée"
      });
    } else if (row.resourceType === "image" && averageBytes >= 100 * 1024) {
      recommendations.push({
        title: `Optimiser les images chargées sur ${row.route}`,
        evidence: `${formatBytes(averageBytes)} transférés en moyenne par image.`,
        action: "Vérifier le format, les dimensions servies et le chargement différé des images hors écran.",
        priority: "À surveiller"
      });
    }

    if (staticTypes.has(row.resourceType) && row.requests >= 20 && row.cacheHits / row.requests < 0.7) {
      recommendations.push({
        title: `Vérifier le cache navigateur des ressources ${row.resourceType}`,
        evidence: `${Math.round(row.cacheHits / row.requests * 100)} % de cache navigateur sur ${row.requests} requêtes à ${row.route}.`,
        action: "Vérifier les en-têtes Cache-Control et les noms de fichiers versionnés. Cette mesure concerne le cache du navigateur, pas le cache CDN Vercel.",
        priority: "À surveiller"
      });
    }
  }

  const thresholds: Record<string, { limit: number; label: string; action: string }> = {
    LCP: { limit: 2500, label: "LCP", action: "Réduire les ressources bloquantes et prioriser le contenu principal." },
    INP: { limit: 200, label: "INP estimé", action: "Réduire le JavaScript exécuté pendant les interactions et découper les tâches longues." },
    CLS: { limit: 0.1, label: "CLS", action: "Réserver l’espace des images et composants qui apparaissent après le chargement." },
    FCP: { limit: 1800, label: "FCP", action: "Réduire les ressources bloquant le rendu initial." },
    TTFB: { limit: 800, label: "TTFB", action: "Examiner le rendu serveur, les appels de données et la possibilité de cache." }
  };
  for (const row of performanceRows) {
    const threshold = thresholds[row.metric];
    if (!threshold || row.samples < 3 || row.average <= threshold.limit) continue;
    recommendations.push({
      title: `Améliorer ${threshold.label} sur ${row.route}`,
      evidence: `Moyenne de ${formatMetric(row.metric, row.average)} sur ${row.samples} échantillons; seuil de référence : ${formatMetric(row.metric, threshold.limit)}.`,
      action: threshold.action,
      priority: "À surveiller"
    });
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Lightbulb aria-hidden="true" className="h-5 w-5" /> Règles d’optimisation</CardTitle>
        <CardDescription>Règles automatiques sur les dernières 24 h : JavaScript/images &gt; 100 Ko par requête, réponses fetch &gt; 50 Ko, cache navigateur &lt; 70 % après 20 requêtes; LCP &gt; 2 500 ms, INP estimé &gt; 200 ms, CLS &gt; 0,1, FCP &gt; 1 800 ms ou TTFB &gt; 800 ms (avec au moins 3 échantillons).</CardDescription>
      </CardHeader>
      <CardContent>
        {recommendations.length === 0 ? (
          rows.length === 0 && performanceRows.length === 0
            ? <p className="text-sm text-[var(--color-ink-muted)]">Aucune donnée disponible. Les règles apparaîtront après des visites avec collecte active.</p>
            : <p className="flex items-center gap-2 text-sm text-[var(--color-ink-muted)]"><CheckCircle2 aria-hidden="true" className="h-4 w-4 text-[var(--color-success)]" /> Aucune règle déclenchée. Les signaux de performance comptent seulement à partir de 3 échantillons.</p>
        ) : (
          <ul className="space-y-3">
            {recommendations.map((item, index) => (
              <li key={`${item.title}:${index}`} className="rounded-xl border border-[var(--color-border)] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <AlertTriangle aria-hidden="true" className="h-4 w-4 text-[var(--block-dryland-fg)]" />
                  <strong className="text-sm text-[var(--color-ink)]">{item.title}</strong>
                  <Badge variant={item.priority === "Élevée" ? "warning" : "outline"}>{item.priority}</Badge>
                </div>
                <p className="mt-2 text-sm text-[var(--color-ink-muted)]">{item.evidence}</p>
                <p className="mt-1 text-sm text-[var(--color-ink)]"><span className="font-bold">À faire :</span> {item.action}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function TransferReport({ totalBytes, rows }: { totalBytes: number; rows: TransferRow[] }) {
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Transferts observés · 24 h</CardTitle>
        <CardDescription>{formatBytes(totalBytes)} mesurés dans les navigateurs connectés. Estimation des réponses et ressources de même origine; ne mesure pas le transfert Fast Origin entre Vercel et ses fonctions.</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? <p className="text-sm text-[var(--color-ink-muted)]">Aucune mesure de transfert pour le moment.</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[38rem] text-left text-sm">
            <thead className="text-xs uppercase text-[var(--color-ink-muted)]"><tr><th className="pb-2 pr-4">Route</th><th className="pb-2 pr-4">Type</th><th className="pb-2 pr-4">Requêtes</th><th className="pb-2 pr-4">Total transféré</th><th className="pb-2 pr-4">Par requête</th><th className="pb-2">Cache navigateur</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={`${row.route}:${row.resourceType}`} className="border-t border-[var(--color-border)]">
              <td className="py-2 pr-4 font-semibold">{row.route}</td><td className="py-2 pr-4">{row.resourceType}</td><td className="py-2 pr-4">{row.requests.toLocaleString("fr-CA")}</td>
              <td className="py-2 pr-4">{formatBytes(row.transferBytes)}</td><td className="py-2 pr-4">{formatBytes(row.requests ? row.transferBytes / row.requests : 0)}</td>
              <td className="py-2">{row.requests ? `${Math.round(row.cacheHits / row.requests * 100)} %` : "—"}</td>
            </tr>)}</tbody>
          </table></div>
        )}
      </CardContent>
    </Card>
  );
}

function PerformanceReport({ rows }: { rows: PerformanceRow[] }) {
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Performance ressentie · 24 h</CardTitle>
        <CardDescription>LCP, INP, CLS, FCP et TTFB. L’INP est estimé par la plus longue durée d’événement mesurée dans le navigateur.</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? <p className="text-sm text-[var(--color-ink-muted)]">Aucune mesure de performance pour le moment.</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[38rem] text-left text-sm">
            <thead className="text-xs uppercase text-[var(--color-ink-muted)]"><tr><th className="pb-2 pr-4">Route</th><th className="pb-2 pr-4">Mesure</th><th className="pb-2 pr-4">Échantillons</th><th className="pb-2 pr-4">Moyenne</th><th className="pb-2">Maximum</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={`${row.route}:${row.metric}`} className="border-t border-[var(--color-border)]">
              <td className="py-2 pr-4 font-semibold">{row.route}</td><td className="py-2 pr-4">{row.metric === "INP" ? "INP estimé" : row.metric}</td>
              <td className="py-2 pr-4">{row.samples.toLocaleString("fr-CA")}</td><td className="py-2 pr-4">{formatMetric(row.metric, row.average)}</td><td className="py-2">{formatMetric(row.metric, row.maximum)}</td>
            </tr>)}</tbody>
          </table></div>
        )}
      </CardContent>
    </Card>
  );
}

function formatMetric(metric: string, value: number) {
  return metric === "CLS" ? value.toLocaleString("fr-CA", { maximumFractionDigits: 3 }) : `${Math.round(value).toLocaleString("fr-CA")} ms`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${Math.round(bytes)} o`;
  const units = ["Ko", "Mo", "Go"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toLocaleString("fr-CA", { maximumFractionDigits: 1 })} ${units[unit]}`;
}
