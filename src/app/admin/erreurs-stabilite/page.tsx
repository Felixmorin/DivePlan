import { Activity, AlertCircle, ArrowDown, ArrowUp, CheckCircle2, UserRound, type LucideIcon } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdmin } from "@/lib/current-user";
import { query } from "@/lib/db";
import { StabilityDashboard, type IncidentRow } from "./stability-dashboard";

export const dynamic = "force-dynamic";

const periods = [{ key: "6h", hours: 6, label: "Dernières 6 h" }, { key: "24h", hours: 24, label: "Dernières 24 h" }, { key: "7d", hours: 168, label: "7 derniers jours" }, { key: "30d", hours: 720, label: "30 derniers jours" }];
type CountsRow = { count: string; prior: string; users: string; firstAt: Date | null; lastAt: Date | null };
type RunRow = { count: string; firstAt: Date | null; lastAt: Date | null };

export default async function AdminErrorStabilityPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  await requireAdmin();
  const params = await searchParams;
  const period = periods.find((item) => item.key === params.period) ?? periods[1];
  let events: CountsRow | null = null;
  let agentRuns: RunRow | null = null;
  let updatedAt: Date | null = null;
  let eventOk = true;
  let runsOk = true;

  try {
    const result = await query<CountsRow>(`SELECT count(*) FILTER (WHERE "createdAt" >= NOW() - ($1::int * INTERVAL '1 hour'))::text AS count,
      count(*) FILTER (WHERE "createdAt" < NOW() - ($1::int * INTERVAL '1 hour') AND "createdAt" >= NOW() - ($1::int * 2 * INTERVAL '1 hour'))::text AS prior,
      count(DISTINCT "userId") FILTER (WHERE "createdAt" >= NOW() - ($1::int * INTERVAL '1 hour'))::text AS users,
      min("createdAt") FILTER (WHERE "createdAt" >= NOW() - ($1::int * INTERVAL '1 hour')) AS "firstAt",
      max("createdAt") FILTER (WHERE "createdAt" >= NOW() - ($1::int * INTERVAL '1 hour')) AS "lastAt"
      FROM "AppEvent" WHERE type = 'auth.failed' AND "createdAt" >= NOW() - ($1::int * 2 * INTERVAL '1 hour')`, [period.hours]);
    events = result.rows[0] ?? null;
  } catch { eventOk = false; }
  try {
    const result = await query<RunRow>(`SELECT count(*)::text AS count, min("createdAt") AS "firstAt", max("createdAt") AS "lastAt"
      FROM "AiAgentRun" WHERE status = 'failed' AND "createdAt" >= NOW() - ($1::int * INTERVAL '1 hour')`, [period.hours]);
    agentRuns = result.rows[0] ?? null;
  } catch { runsOk = false; }
  try {
    const result = await query<{ updatedAt: Date | null }>(`SELECT max("createdAt") AS "updatedAt" FROM "AppEvent" WHERE type = 'auth.failed'`);
    updatedAt = result.rows[0]?.updatedAt ?? null;
  } catch { /* freshness is unavailable */ }

  const authCount = Number(events?.count ?? 0);
  const authPrior = Number(events?.prior ?? 0);
  const incidents: IncidentRow[] = [];
  if (eventOk && authCount > 0) incidents.push({ id: "auth.failed", summary: "Échecs d’authentification journalisés", detail: "Échecs de connexion explicitement enregistrés par l’application. L’identifiant de connexion n’est pas affiché.", kind: "action", count: authCount, firstAt: events?.firstAt?.toISOString() ?? null, lastAt: events?.lastAt?.toISOString() ?? null, version: null, route: null, users: Number(events?.users ?? 0), actions: authCount });
  const agentCount = Number(agentRuns?.count ?? 0);
  if (runsOk && agentCount > 0) incidents.push({ id: "agent.run.failed", summary: "Exécutions d’agents en échec", detail: "Exécutions d’agents marquées en échec. Le texte d’erreur brut est masqué.", kind: "action", count: agentCount, firstAt: agentRuns?.firstAt?.toISOString() ?? null, lastAt: agentRuns?.lastAt?.toISOString() ?? null, version: null, route: null, users: null, actions: agentCount });

  return <AdminShell active="Erreurs et stabilité"><div className="mx-auto max-w-[1600px] space-y-4">
    <header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-blue-700">Administration / Fiabilité</p><h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Erreurs et stabilité</h1><p className="mt-1 text-sm text-slate-600 sm:text-base">Comprenez les erreurs et les actions qui échouent.</p></div><div className="flex flex-wrap items-center gap-2"><form className="flex flex-wrap items-center gap-2"><label htmlFor="period" className="sr-only">Période</label><select id="period" name="period" defaultValue={period.key} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm">{periods.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select><button type="submit" className="min-h-10 rounded-xl bg-blue-600 px-3 text-sm font-bold text-white hover:bg-blue-700">Appliquer</button><label className="sr-only" htmlFor="route-filter">Route</label><select id="route-filter" disabled className="min-h-10 rounded-xl border border-slate-200 bg-slate-100 px-3 text-sm text-slate-500"><option>Toutes les routes · non suivies</option></select><label className="sr-only" htmlFor="version-filter">Version</label><select id="version-filter" disabled className="min-h-10 rounded-xl border border-slate-200 bg-slate-100 px-3 text-sm text-slate-500"><option>Toutes les versions · non mesurées</option></select></form><span className="text-xs text-slate-500">{updatedAt ? `Dernier événement : ${updatedAt.toLocaleString("fr-CA")}` : "Fraîcheur indisponible"}</span></div></header>

    <section aria-label="Indicateurs clés" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi icon={AlertCircle} title="Erreurs capturées" value="Non mesurées" note="Sentry capture les erreurs, mais ses événements ne sont pas consultables ici." tone="rose" />
      <Kpi icon={Activity} title="Actions échouées suivies" value={eventOk && runsOk ? (authCount + agentCount).toLocaleString("fr-CA") : "Données indisponibles"} note={`${eventOk ? `${authCount.toLocaleString("fr-CA")} échecs de connexion` : "AppEvent indisponible"} · ${runsOk ? `${agentCount.toLocaleString("fr-CA")} exécutions d’agents` : "AiAgentRun indisponible"} · ${period.label.toLowerCase()}`} tone="amber" />
      <Kpi icon={UserRound} title="Utilisateurs touchés" value={eventOk ? (events?.users ? Number(events.users).toLocaleString("fr-CA") : "0") : "Données indisponibles"} note="Comptes associés aux échecs de connexion connus; couverture partielle." tone="violet" />
      <Kpi icon={CheckCircle2} title="Taux de réussite" value="Non mesuré" note="Aucun dénominateur fiable d’actions tentées n’est collecté." tone="green" />
    </section>

    <div className="grid gap-4 2xl:grid-cols-[.92fr_1.08fr]"><Card className="border-slate-200/80 shadow-sm"><CardContent className="p-4 sm:p-5"><div className="mb-4"><h2 className="text-lg font-extrabold text-slate-900">Erreurs par catégorie</h2><p className="text-xs text-slate-500">La catégorie n’est affichée que si une source d’erreurs est raccordée.</p></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{["Navigateur JavaScript", "Serveur", "API", "SQL"].map((name) => <div key={name} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3"><p className="text-xs font-bold text-slate-600">{name}</p><p className="mt-2 text-xl font-black text-slate-800">Non mesuré</p><p className="text-[11px] text-slate-500">Aucune source détaillée connectée</p></div>)}</div><div className="mt-4 rounded-lg bg-blue-50 p-3 text-xs leading-relaxed text-blue-900">Sentry est configuré pour capturer les erreurs de requête, mais DivePlan ne lit pas encore les incidents Sentry dans cette page.</div></CardContent></Card>
      <Card className="border-slate-200/80 shadow-sm"><CardContent className="p-4 sm:p-5"><h2 className="text-lg font-extrabold text-slate-900">Échecs sans exception</h2><p className="mb-3 text-xs text-slate-500">Événements d’échec explicites uniquement; les activités réussies sont exclues.</p><div className="overflow-x-auto"><table className="w-full min-w-[480px] text-left text-sm"><thead><tr className="border-b text-xs text-slate-500"><th className="py-2 pr-3">Action enregistrée</th><th className="py-2 pr-3">Nombre</th><th className="py-2 pr-3">Route touchée</th><th className="py-2">Tendance</th></tr></thead><tbody><tr className="border-b border-slate-100"><td className="py-3 pr-3 font-semibold text-slate-800">Connexion refusée</td><td className="py-3 pr-3 tabular-nums">{eventOk ? authCount : "—"}</td><td className="py-3 pr-3 text-slate-500">Non suivie</td><td className="py-3">{eventOk ? <Trend current={authCount} prior={authPrior} /> : "Indisponible"}</td></tr><tr><td className="py-3 pr-3 font-semibold text-slate-800">Exécution d’agent échouée</td><td className="py-3 pr-3 tabular-nums">{runsOk ? agentCount : "—"}</td><td className="py-3 pr-3 text-slate-500">Hors parcours utilisateur</td><td className="py-3 text-slate-400">Comparaison non mesurée</td></tr></tbody></table></div>{!eventOk && <p role="status" className="mt-2 text-sm text-rose-700">Impossible de lire les événements AppEvent.</p>}</CardContent></Card></div>

    <StabilityDashboard period={period} incidents={incidents} sourceErrorsAvailable={false} />
    <p className="text-xs text-slate-500">Sources : AppEvent (`auth.failed`) · AiAgentRun (statut `failed`) · Sentry configuré mais non interrogé. Période : {period.label}. Les messages bruts, courriels, jetons et données personnelles ne sont pas affichés.</p>
  </div></AdminShell>;
}

function Kpi({ icon: Icon, title, value, note, tone, change }: { icon: LucideIcon; title: string; value: string; note: string; tone: "rose" | "amber" | "violet" | "green"; change?: number | null }) {
  const tones = { rose: "bg-rose-50 text-rose-600", amber: "bg-amber-50 text-amber-600", violet: "bg-violet-50 text-violet-600", green: "bg-emerald-50 text-emerald-600" };
  return <Card className="border-slate-200/80 shadow-sm"><CardContent className="flex min-h-28 gap-3 p-4"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tones[tone]}`}><Icon className="h-5 w-5" /></span><div className="min-w-0"><h2 className="text-xs font-bold text-slate-600">{title}</h2><p className="mt-1 text-2xl font-black tracking-tight text-slate-950">{value}</p><p className="mt-1 text-[11px] leading-snug text-slate-500">{note}</p>{change != null && <p className="mt-1 text-xs font-bold text-slate-600">{change > 0 ? <ArrowUp className="mr-1 inline h-3 w-3 text-rose-600" /> : change < 0 ? <ArrowDown className="mr-1 inline h-3 w-3 text-emerald-600" /> : null}{change === 0 ? "Stable" : `${Math.abs(change).toFixed(0)} %`} vs période précédente</p>}</div></CardContent></Card>;
}
function Trend({ current, prior }: { current: number; prior: number }) { if (!prior) return <span className="text-slate-400">Comparaison indisponible</span>; const change = ((current - prior) / prior) * 100; return <span className={change > 0 ? "font-bold text-rose-600" : "font-bold text-emerald-600"}>{change > 0 ? "↑" : "↓"} {Math.abs(change).toFixed(0)} %</span>; }
