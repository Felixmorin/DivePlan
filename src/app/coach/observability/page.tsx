import { Activity, AlertTriangle, ArrowDownUp, ArrowRight, BarChart3, CalendarDays, CheckCircle2, Database, TrendingUp, Upload, Wrench } from "lucide-react";
import { CoachShell } from "@/components/coach/coach-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireFullAccessCoach } from "@/lib/current-user";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

type TransferRow = { route: string; resourceType: string; requests: number; transferBytes: number; cacheHits: number };
type PerformanceRow = { route: string; metric: string; average: number; maximum: number; ratedSamples: number; goodSamples: number; needsImprovementSamples: number };
type DatabaseEgressRow = { route: string; requests: number; resultBytes: number; totalBytes: number; totalRequests: number };
type Recommendation = { title: string; evidence: string; priority: "Élevée" | "À surveiller"; value: string; valueLabel: string; route: string };

export default async function ObservabilityPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period } = await searchParams;
  const hours = period === "6h" ? 6 : period === "12h" ? 12 : period === "72h" ? 72 : period === "7d" ? 168 : 24;
  const { clubId } = await requireFullAccessCoach();
  let transferRows: TransferRow[] = [];
  let performanceRows: PerformanceRow[] = [];
  let databaseEgressRows: DatabaseEgressRow[] = [];
  let totalBytes = 0;

  if (clubId !== "dev-club") {
    const [transferResult, performanceResult, databaseResult] = await Promise.all([
      query<{ route: string; resourceType: string; requests: string; transferBytes: string; cacheHits: string; totalBytes: string }>(
        `SELECT route, "resourceType", SUM(requests)::text AS requests,
           SUM("transferBytes")::text AS "transferBytes", SUM("cacheHits")::text AS "cacheHits",
           SUM(SUM("transferBytes")) OVER ()::text AS "totalBytes"
         FROM "TransferTelemetryHour" WHERE "clubId" = $1 AND hour >= NOW() - ($2::int * INTERVAL '1 hour')
         GROUP BY route, "resourceType" ORDER BY SUM("transferBytes") DESC, SUM(requests) DESC LIMIT 100`, [clubId, hours]),
      query<{ route: string; metric: string; average: string; maximum: string; ratedSamples: string; goodSamples: string; needsImprovementSamples: string }>(
        `SELECT route, metric, (SUM("ratedTotalValue") / NULLIF(SUM("ratedSamples"), 0))::text AS average,
           MAX("ratedMaxValue")::text AS maximum, SUM("ratedSamples")::text AS "ratedSamples",
           SUM("goodSamples")::text AS "goodSamples", SUM("needsImprovementSamples")::text AS "needsImprovementSamples"
         FROM "PerformanceTelemetryHour" WHERE "clubId" = $1 AND hour >= NOW() - ($2::int * INTERVAL '1 hour')
         GROUP BY route, metric ORDER BY MAX("ratedMaxValue") DESC LIMIT 30`, [clubId, hours]),
      query<{ route: string; requests: string; resultBytes: string; totalBytes: string; totalRequests: string }>(
        `SELECT route, SUM(requests)::text AS requests, SUM("resultBytes")::text AS "resultBytes",
           SUM(SUM("resultBytes")) OVER ()::text AS "totalBytes", SUM(SUM(requests)) OVER ()::text AS "totalRequests"
         FROM "DatabaseEgressTelemetryHour" WHERE "clubId" = $1 AND hour >= NOW() - ($2::int * INTERVAL '1 hour')
         GROUP BY route ORDER BY SUM("resultBytes") DESC LIMIT 100`, [clubId, hours])
    ]);
    transferRows = transferResult.rows.map((r) => ({ route: r.route, resourceType: r.resourceType, requests: Number(r.requests), transferBytes: Number(r.transferBytes), cacheHits: Number(r.cacheHits) }));
    performanceRows = performanceResult.rows.map((r) => ({ route: r.route, metric: r.metric, average: Number(r.average), maximum: Number(r.maximum), ratedSamples: Number(r.ratedSamples), goodSamples: Number(r.goodSamples), needsImprovementSamples: Number(r.needsImprovementSamples) }));
    databaseEgressRows = databaseResult.rows.map((r) => ({ route: r.route, requests: Number(r.requests), resultBytes: Number(r.resultBytes), totalBytes: Number(r.totalBytes), totalRequests: Number(r.totalRequests) }));
    totalBytes = Number(transferResult.rows[0]?.totalBytes ?? 0);
  }

  const databaseBytes = (databaseEgressRows[0]?.totalBytes ?? 0);
  const samples = performanceRows.reduce((sum, row) => sum + row.ratedSamples, 0);
  const routeRows = transferRows;
  const recommendations = getRecommendations(transferRows, performanceRows);
  const emptyDescription = clubId === "dev-club"
    ? "La démonstration locale n’a pas de base de données de club. Les mesures apparaîtront avec un compte de club après activation de la collecte."
    : "Les mesures apparaîtront ici après les visites collectées.";

  return <CoachShell active="Observabilité">
    <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-3xl font-black tracking-tight text-[var(--color-ink)]">Observabilité</h1><p className="mt-1 text-sm text-[var(--color-ink-muted)]">Surveillez la performance et l’utilisation des ressources de DivePlan.</p></div>
      <nav aria-label="Période d’observation" className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-white p-1 text-sm font-semibold shadow-sm"><CalendarDays className="ml-2 h-4 w-4" />{[["6h", "6 h"], ["12h", "12 h"], ["24h", "24 h"], ["72h", "3 jours"], ["7d", "7 jours"]].map(([value, label]) => <a key={value} href={`?period=${value}`} aria-current={(value === "24h" && hours === 24) || value === period ? "page" : undefined} className={`rounded-lg px-3 py-2 ${((value === "24h" && hours === 24) || value === period) ? "bg-sky-100 text-sky-800" : "hover:bg-slate-50"}`}>{label}</a>)}</nav>
    </header>

    <p className="mb-4 rounded-xl border border-sky-100 bg-sky-50 p-3 text-sm text-sky-900">Les transferts ci-dessous sont ceux observés par les navigateurs du club, sur la même origine. Ils ne représentent pas le Fast Origin Transfer facturé par Vercel. Les ressources externes, dont les photos Supabase, et les visites sans collecte ne sont pas incluses.</p>
    <section aria-label="Indicateurs clés" className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard icon={Upload} color="blue" value={formatBytes(totalBytes)} label="observés côté navigateur" detail="Ressources de la même origine" trend={<TrendingUp className="h-5 w-5" />} />
      <MetricCard icon={Activity} color="red" value={samples.toLocaleString("fr-CA")} label="mesures Web Vitals" detail="Échantillons classés" trend={<span className="text-2xl">—</span>} />
      <MetricCard icon={Database} color="purple" value={formatBytes(databaseBytes)} label="PostgreSQL estimés" detail="Résultats reçus par l’app" trend={<span className="text-xl">Ⅱ</span>} />
      <MetricCard icon={AlertTriangle} color="amber" value={String(recommendations.length)} label="recommandations" detail="Selon les règles actives" trend={<BarChart3 className="h-5 w-5" />} />
    </section>

    <Card className="mb-4">
      <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-lg"><Wrench className="h-5 w-5" /> Actions recommandées</CardTitle><CardDescription>Optimisez les routes et ressources qui ont le plus d’impact sur la performance de l’application.</CardDescription></CardHeader>
      <CardContent className="space-y-2 pt-0">
        {recommendations.length ? recommendations.slice(0, 5).map((item, i) => <div key={`${item.title}-${i}`} className="grid gap-3 rounded-xl border border-[var(--color-border)] p-3 sm:grid-cols-[auto_minmax(0,1fr)_130px_auto] sm:items-center">
          <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${item.priority === "Élevée" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>{item.priority}</span>
          <div className="min-w-0"><p className="text-sm font-bold">{item.title}</p><p className="truncate text-sm text-[var(--color-ink-muted)]">{item.evidence}</p></div>
          <div><p className="text-sm font-bold">{item.value}</p><p className="text-xs text-[var(--color-ink-muted)]">{item.valueLabel}</p></div>
          <a href="#transferts" className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-[var(--color-border)] px-3 text-sm font-semibold hover:bg-slate-50">Voir la route <ArrowRight className="h-4 w-4" /></a>
        </div>) : <div className="flex items-center gap-2 rounded-xl border border-dashed border-[var(--color-border)] p-5 text-sm text-[var(--color-ink-muted)]">{transferRows.length || performanceRows.length ? <CheckCircle2 className="h-4 w-4 text-[var(--color-success)]" /> : <Activity className="h-4 w-4" />}{transferRows.length || performanceRows.length ? "Aucune optimisation prioritaire détectée." : emptyDescription}</div>}
      </CardContent>
    </Card>

    <Card id="transferts" className="mb-4 scroll-mt-4">
      <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-lg"><ArrowDownUp className="h-5 w-5" /> Transferts par route</CardTitle><CardDescription>Ressources attribuées à la page visitée, détaillées par type. La route désigne la page, pas l’URL de chaque ressource. Le cache affiché est celui du navigateur, pas celui du CDN Vercel.</CardDescription></CardHeader>
      <CardContent className="pt-0"><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-xs font-bold text-slate-600"><tr>{["Page visitée", "Ressource", "Requêtes", "Total transféré", "Par requête", "Cache navigateur"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead><tbody>
        {routeRows.length ? routeRows.map((row) => <tr key={`${row.route}:${row.resourceType}`} className="border-t border-[var(--color-border)]"><td className="px-3 py-2 font-semibold">{row.route}</td><td className="px-3 py-2"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${row.resourceType === "document" ? "bg-sky-100 text-sky-700" : "bg-emerald-100 text-emerald-700"}`}>{resourceTypeLabels[row.resourceType] ?? row.resourceType}</span></td><td className="px-3 py-2">{row.requests.toLocaleString("fr-CA")}</td><td className="px-3 py-2">{formatBytes(row.transferBytes)}</td><td className="px-3 py-2">{formatBytes(row.requests ? row.transferBytes / row.requests : 0)}</td><td className="px-3 py-2"><div className="flex items-center gap-2"><span className="w-10 shrink-0">{row.requests ? `${Math.round(row.cacheHits / row.requests * 100)} %` : "—"}</span><span className="h-2 w-28 overflow-hidden rounded-full bg-slate-200"><span className="block h-full rounded-full bg-emerald-500" style={{ width: `${row.requests ? Math.min(100, row.cacheHits / row.requests * 100) : 0}%` }} /></span></div></td></tr>) : <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-[var(--color-ink-muted)]">{emptyDescription}</td></tr>}
      </tbody></table></div></CardContent>
    </Card>

    <div className="grid gap-4 xl:grid-cols-2">
      <Card><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-lg"><Database className="h-5 w-5" /> Résultats PostgreSQL</CardTitle><CardDescription>Estimation de l’utilisation de PostgreSQL sur la période sélectionnée.</CardDescription></CardHeader><CardContent className="pt-0">
        <div className="divide-y divide-[var(--color-border)] rounded-xl border border-[var(--color-border)] text-sm"><SummaryLine label="Données transférées (estimées)" value={formatBytes(databaseBytes)} /><SummaryLine label="Requêtes" value={(databaseEgressRows[0]?.totalRequests ?? 0).toLocaleString("fr-CA")} /><SummaryLine label="Temps d’exécution moyen" value="—" /><SummaryLine label="Temps d’exécution p95" value="—" /></div>
        <p className="mt-2 text-xs text-[var(--color-ink-muted)]">Taille JSON des résultats suivis; le temps SQL n’est pas instrumenté.</p>
      </CardContent></Card>
      <Card><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-lg"><Activity className="h-5 w-5" /> Web Vitals</CardTitle><CardDescription>Mesures Web Vitals collectées sur la période sélectionnée.</CardDescription></CardHeader><CardContent className="pt-0">
        {performanceRows.length ? <div className="max-h-64 overflow-auto rounded-xl border border-[var(--color-border)]"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs"><tr><th className="p-2">Route</th><th className="p-2">Mesure</th><th className="p-2">Moyenne</th><th className="p-2">Bon</th></tr></thead><tbody>{performanceRows.map((r) => <tr key={`${r.route}:${r.metric}`} className="border-t border-[var(--color-border)]"><td className="p-2 font-medium">{r.route}</td><td className="p-2">{r.metric}</td><td className="p-2">{r.ratedSamples ? formatMetric(r.metric, r.average) : "—"}</td><td className="p-2">{r.ratedSamples ? `${Math.round(r.goodSamples / r.ratedSamples * 100)} %` : "—"}</td></tr>)}</tbody></table></div> : <div className="flex min-h-28 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] text-center"><BarChart3 className="mb-2 h-6 w-6 text-slate-500" /><p className="text-sm font-bold">Aucune mesure disponible</p><p className="mt-1 text-xs text-[var(--color-ink-muted)]">Aucune mesure Web Vitals n’a été collectée sur la période sélectionnée.</p></div>}
      </CardContent></Card>
    </div>
  </CoachShell>;
}

function MetricCard({ icon: Icon, color, value, label, detail, trend }: { icon: typeof Upload; color: string; value: string; label: string; detail: string; trend: React.ReactNode }) {
  const palette: Record<string, string> = { blue: "bg-sky-100 text-sky-600", red: "bg-red-100 text-red-600", purple: "bg-violet-100 text-violet-600", amber: "bg-amber-100 text-amber-700" };
  return <Card><CardContent className="flex items-center gap-3 p-4"><span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${palette[color]}`}><Icon className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="text-2xl font-black leading-none">{value}</p><p className="mt-1 text-sm font-semibold text-[var(--color-ink-muted)]">{label}</p><p className="truncate text-xs text-[var(--color-ink-soft)]">{detail}</p></div><span className={`shrink-0 ${palette[color].split(" ")[1]}`}>{trend}</span></CardContent></Card>;
}

const resourceTypeLabels: Record<string, string> = {
  document: "Document", script: "Script", style: "Style", image: "Image", font: "Police", fetch: "Fetch / XHR", other: "Autre"
};

function getRecommendations(rows: TransferRow[], vitals: PerformanceRow[]): Recommendation[] {
  const items: Recommendation[] = [];
  for (const row of rows) {
    const avg = row.requests ? row.transferBytes / row.requests : 0;
    if (avg >= 100 * 1024) items.push({ title: "Route lourde", evidence: `La route ${row.route} transfère un volume important de données.`, priority: "Élevée", value: formatBytes(avg), valueLabel: "par requête", route: row.route });
    if (["script", "style", "image", "font"].includes(row.resourceType) && row.requests >= 20 && row.cacheHits / row.requests < 0.7) items.push({ title: "Cache navigateur faible", evidence: `La route ${row.route} a un taux de cache navigateur de ${Math.round(row.cacheHits / row.requests * 100)} %.`, priority: "À surveiller", value: `${Math.round(row.cacheHits / row.requests * 100)} %`, valueLabel: "cache navigateur", route: row.route });
  }
  for (const row of vitals) if (row.ratedSamples >= 10 && row.goodSamples / row.ratedSamples < 0.75) items.push({ title: `${row.metric} à améliorer`, evidence: `La route ${row.route} présente une part de visites dans la zone bonne inférieure à 75 %.`, priority: "À surveiller", value: `${Math.round(row.goodSamples / row.ratedSamples * 100)} %`, valueLabel: "visites dans la zone bonne", route: row.route });
  return items.slice(0, 8);
}

function SummaryLine({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-4 px-3 py-2"><span>{label}</span><strong>{value}</strong></div>; }
function formatMetric(metric: string, value: number) { return metric === "CLS" ? value.toLocaleString("fr-CA", { maximumFractionDigits: 3 }) : `${Math.round(value).toLocaleString("fr-CA")} ms`; }
function formatBytes(bytes: number) { if (bytes < 1024) return `${Math.round(bytes)} o`; const units = ["Ko", "Mo", "Go"]; let value = bytes / 1024; let unit = 0; while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; } return `${value.toLocaleString("fr-CA", { maximumFractionDigits: 1 })} ${units[unit]}`; }
