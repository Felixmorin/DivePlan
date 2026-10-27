import Link from "next/link";
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, FileText, Info, Users, type LucideIcon } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdmin } from "@/lib/current-user";
import { query } from "@/lib/db";
import { ActivityChart, type DayPoint, type FeatureStat, type FunnelPoint } from "./activity-widgets";

export const dynamic = "force-dynamic";

const periods = [{ key: "24h", hours: 24, label: "24 dernières heures" }, { key: "7d", hours: 168, label: "7 derniers jours" }, { key: "30d", hours: 720, label: "30 derniers jours" }];
const roles = [{ key: "all", label: "Tous les rôles" }, { key: "COACH", label: "Coach" }, { key: "ATHLETE", label: "Athlète" }, { key: "ADMIN", label: "Administrateur" }];
type GroupOption = { id: string; name: string };
type MetricRow = { active: string; priorActive: string; created: string; priorCreated: string; completed: string; priorCompleted: string; createdCohort: string; completedCohort: string; priorCompletedCohort: string; lastAt: Date | null };
type DayRow = { day: Date; active: string; completed: string };
type FunnelRow = { type: string; count: string };
type FeatureRow = { feature: string; role: string; users: string };
type AnomalyRow = { users: string; latest: Date | null; total: string };

export default async function AdminActivityJourneyPage({ searchParams }: { searchParams: Promise<{ period?: string; role?: string; group?: string }> }) {
  await requireAdmin();
  const params = await searchParams;
  const period = periods.find((item) => item.key === params.period) ?? periods[1];
  const role = roles.find((item) => item.key === params.role)?.key ?? "all";
  const groups = await safeQuery<GroupOption>(`SELECT id, name FROM "TrainingGroup" ORDER BY name`);
  const group = groups.ok && groups.rows.some((item) => item.id === params.group) ? params.group! : "all";
  const hours = period.hours;

  const [metricRead, dayRead, funnelRead, featureRead, anomalyRead] = await Promise.all([
    safeQuery<MetricRow>(`WITH ev AS (
      SELECT e.type, e."userId", e."createdAt", e.metadata ->> 'sessionId' AS sid,
        u.role::text AS user_role,
        EXISTS (SELECT 1 FROM "Athlete" a WHERE a."userId"=e."userId" AND a."groupId"=$3)
        OR EXISTS (SELECT 1 FROM "TrainingGroup" tg JOIN "Coach" c ON c.id=tg."coachId" WHERE tg.id=$3 AND c."userId"=e."userId")
        OR EXISTS (SELECT 1 FROM "TrainingSession" s JOIN "TrainingWeek" w ON w.id=s."weekId" WHERE s.id=e.metadata ->> 'sessionId' AND w."groupId"=$3) AS in_group
      FROM "AppEvent" e LEFT JOIN "User" u ON u.id=e."userId"
      WHERE e."createdAt" >= NOW() - ($1::int * 2 * INTERVAL '1 hour')
        AND e.type IN ('auth.login','session.created','session.created_from_template','session.updated','session.published','session.previewed','session.completed')
    ), filtered AS (SELECT * FROM ev WHERE ($2='all' OR user_role=$2) AND ($3='all' OR in_group)),
      this AS (SELECT * FROM filtered WHERE "createdAt">=NOW()-($1::int*INTERVAL '1 hour')),
      prior AS (SELECT * FROM filtered WHERE "createdAt"<NOW()-($1::int*INTERVAL '1 hour') AND "createdAt">=NOW()-($1::int*2*INTERVAL '1 hour')),
      cohorts AS (SELECT DISTINCT sid FROM this WHERE type IN ('session.created','session.created_from_template') AND sid IS NOT NULL),
      prior_cohorts AS (SELECT DISTINCT sid FROM prior WHERE type IN ('session.created','session.created_from_template') AND sid IS NOT NULL)
      SELECT (SELECT count(DISTINCT "userId") FROM this WHERE "userId" IS NOT NULL)::text AS active,
        (SELECT count(DISTINCT "userId") FROM prior WHERE "userId" IS NOT NULL)::text AS "priorActive",
        (SELECT count(DISTINCT sid) FROM this WHERE type IN ('session.created','session.created_from_template') AND sid IS NOT NULL)::text AS created,
        (SELECT count(DISTINCT sid) FROM prior WHERE type IN ('session.created','session.created_from_template') AND sid IS NOT NULL)::text AS "priorCreated",
        (SELECT count(DISTINCT sid) FROM this WHERE type='session.completed' AND sid IS NOT NULL)::text AS completed,
        (SELECT count(DISTINCT sid) FROM prior WHERE type='session.completed' AND sid IS NOT NULL)::text AS "priorCompleted",
        (SELECT count(*) FROM cohorts)::text AS "createdCohort",
        (SELECT count(DISTINCT f.sid) FROM this f JOIN cohorts c ON c.sid=f.sid WHERE f.type='session.completed')::text AS "completedCohort",
        (SELECT count(DISTINCT f.sid) FROM prior f JOIN prior_cohorts c ON c.sid=f.sid WHERE f.type='session.completed')::text AS "priorCompletedCohort",
        (SELECT max("createdAt") FROM this) AS "lastAt"`, [hours, role, group]),
    safeQuery<DayRow>(`SELECT date_trunc('day', e."createdAt") AS day,
        count(DISTINCT e."userId") FILTER (WHERE e."userId" IS NOT NULL)::text AS active,
        count(DISTINCT e.metadata ->> 'sessionId') FILTER (WHERE e.type='session.completed' AND e.metadata ->> 'sessionId' IS NOT NULL)::text AS completed
      FROM "AppEvent" e LEFT JOIN "User" u ON u.id=e."userId"
      WHERE e."createdAt">=NOW()-($1::int*INTERVAL '1 hour')
        AND e.type IN ('auth.login','session.created','session.created_from_template','session.updated','session.published','session.previewed','session.completed')
        AND ($2='all' OR u.role::text=$2)
        AND ($3='all' OR EXISTS (SELECT 1 FROM "Athlete" a WHERE a."userId"=e."userId" AND a."groupId"=$3)
          OR EXISTS (SELECT 1 FROM "TrainingGroup" tg JOIN "Coach" c ON c.id=tg."coachId" WHERE tg.id=$3 AND c."userId"=e."userId")
          OR EXISTS (SELECT 1 FROM "TrainingSession" s JOIN "TrainingWeek" w ON w.id=s."weekId" WHERE s.id=e.metadata ->> 'sessionId' AND w."groupId"=$3))
      GROUP BY 1 ORDER BY 1`, [hours, role, group]),
    safeQuery<FunnelRow>(`WITH scoped AS (SELECT e.type, e.metadata ->> 'sessionId' AS sid, e."createdAt"
      FROM "AppEvent" e LEFT JOIN "User" u ON u.id=e."userId"
      WHERE e."createdAt">=NOW()-($1::int*2*INTERVAL '1 hour')
        AND e.type IN ('session.created','session.created_from_template','session.updated','session.published','session.previewed','session.completed')
        AND e.metadata ->> 'sessionId' IS NOT NULL AND ($2='all' OR u.role::text=$2)
        AND ($3='all' OR EXISTS (SELECT 1 FROM "Athlete" a WHERE a."userId"=e."userId" AND a."groupId"=$3)
          OR EXISTS (SELECT 1 FROM "TrainingGroup" tg JOIN "Coach" c ON c.id=tg."coachId" WHERE tg.id=$3 AND c."userId"=e."userId")
          OR EXISTS (SELECT 1 FROM "TrainingSession" s JOIN "TrainingWeek" w ON w.id=s."weekId" WHERE s.id=e.metadata ->> 'sessionId' AND w."groupId"=$3))),
      cohort AS (SELECT DISTINCT sid FROM scoped WHERE type IN ('session.created','session.created_from_template') AND "createdAt">=NOW()-($1::int*INTERVAL '1 hour'))
      SELECT CASE WHEN e.type IN ('session.created','session.created_from_template') THEN 'cohort_created' ELSE e.type END AS type, count(DISTINCT e.sid)::text AS count
      FROM scoped e JOIN cohort c ON c.sid=e.sid WHERE e."createdAt">=NOW()-($1::int*INTERVAL '1 hour') GROUP BY 1`, [hours, role, group]),
    safeQuery<FeatureRow>(`SELECT CASE WHEN e.type IN ('session.created','session.created_from_template','session.updated','session.published','session.previewed') THEN 'Séances' WHEN e.type='session.completed' THEN 'Progression' WHEN e.type LIKE 'admin.%' THEN 'Administration' ELSE 'Autre événement suivi' END AS feature,
       u.role::text AS role, count(DISTINCT e."userId")::text AS users
      FROM "AppEvent" e JOIN "User" u ON u.id=e."userId"
      WHERE e."createdAt">=NOW()-($1::int*INTERVAL '1 hour') AND (e.type LIKE 'session.%' OR e.type LIKE 'admin.%') AND ($2='all' OR u.role::text=$2)
        AND ($3='all' OR EXISTS (SELECT 1 FROM "Athlete" a WHERE a."userId"=e."userId" AND a."groupId"=$3)
          OR EXISTS (SELECT 1 FROM "TrainingGroup" tg JOIN "Coach" c ON c.id=tg."coachId" WHERE tg.id=$3 AND c."userId"=e."userId")
          OR EXISTS (SELECT 1 FROM "TrainingSession" s JOIN "TrainingWeek" w ON w.id=s."weekId" WHERE s.id=e.metadata ->> 'sessionId' AND w."groupId"=$3))
      GROUP BY 1,2`, [hours, role, group]),
    safeQuery<AnomalyRow>(`WITH failed AS (SELECT e."userId", max(e."createdAt") AS latest, count(*) AS total FROM "AppEvent" e JOIN "User" u ON u.id=e."userId" WHERE e.type='auth.failed' AND e."createdAt">=NOW()-($1::int*INTERVAL '1 hour') AND e."userId" IS NOT NULL AND ($2='all' OR u.role::text=$2)
        AND ($3='all' OR EXISTS (SELECT 1 FROM "Athlete" a WHERE a."userId"=e."userId" AND a."groupId"=$3) OR EXISTS (SELECT 1 FROM "TrainingGroup" tg JOIN "Coach" c ON c.id=tg."coachId" WHERE tg.id=$3 AND c."userId"=e."userId")) GROUP BY e."userId" HAVING count(*)>=5)
      SELECT count(*)::text AS users, max(latest) AS latest, coalesce(sum(total),0)::text AS total FROM failed`, [hours, role, group])
  ]);

  const metric = metricRead.rows[0];
  const active = Number(metric?.active ?? 0), priorActive = Number(metric?.priorActive ?? 0);
  const created = Number(metric?.created ?? 0), priorCreated = Number(metric?.priorCreated ?? 0);
  const completedCohort = Number(metric?.completedCohort ?? 0), createdCohort = Number(metric?.createdCohort ?? 0);
  const completion = createdCohort ? completedCohort / createdCohort * 100 : null;
  const priorRate = Number(metric?.priorCreated ?? 0) > 0 ? Number(metric?.priorCompletedCohort ?? 0) / Number(metric?.priorCreated ?? 0) * 100 : null;
  const funnelPoints = buildFunnel(funnelRead.rows);
  const dayPoints: DayPoint[] = dayRead.rows.map((row) => ({ day: row.day.toISOString(), active: Number(row.active), completed: Number(row.completed) }));
  const features: FeatureStat[] = featureRead.rows.map((row) => ({ feature: row.feature, role: row.role, users: Number(row.users) }));
  const anomaly = anomalyRead.rows[0];
  const lastAt = metric?.lastAt ?? null;

  return <AdminShell active="Activité et parcours"><div className="mx-auto max-w-[1600px] space-y-3.5">
    <header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-blue-700">Administration / Usage</p><h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Activité et parcours</h1><p className="mt-1 text-sm text-slate-600">Suivez l’utilisation réelle et repérez les blocages dans les parcours.</p></div><div className="flex flex-wrap items-center gap-2"><form className="flex flex-wrap items-center gap-2"><label className="sr-only" htmlFor="period">Période</label><select id="period" name="period" defaultValue={period.key} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold"><option value="24h">24 dernières heures</option><option value="7d">7 derniers jours</option><option value="30d">30 derniers jours</option></select><label className="sr-only" htmlFor="role">Rôle</label><select id="role" name="role" defaultValue={role} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold">{roles.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select><label className="sr-only" htmlFor="group">Groupe</label><select id="group" name="group" defaultValue={group} className="max-w-48 min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold"><option value="all">Tous les groupes</option>{groups.rows.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="min-h-10 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700">Actualiser</button></form><span className="text-xs text-slate-500">{lastAt ? `Mis à jour ${lastAt.toLocaleString("fr-CA")}` : "Fraîcheur non disponible"}</span></div></header>

    <section aria-label="Indicateurs de la période" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi icon={Users} title="Utilisateurs actifs" value={metricRead.ok ? active.toLocaleString("fr-CA") : "Données indisponibles"} note="Comptes distincts avec une activité suivie." trend={change(active, priorActive)} tone="blue" />
      <Kpi icon={FileText} title="Séances créées" value={metricRead.ok ? created.toLocaleString("fr-CA") : "Données indisponibles"} note="Séances distinctes avec événement de création." trend={change(created, priorCreated)} tone="violet" />
      <Kpi icon={CheckCircle2} title="Taux de complétion" value={!metricRead.ok ? "Données indisponibles" : completion === null ? "Non mesuré" : `${completion.toFixed(0)} %`} note="Séances complétées parmi la cohorte créée sur la période." trend={completion !== null && priorRate !== null ? change(completion, priorRate) : null} tone="green" />
      <Kpi icon={AlertTriangle} title="Parcours bloqués" value="Non mesuré" note="Aucun événement de blocage ou d’interruption n’est enregistré." tone="rose" />
    </section>

    <div className="grid gap-3 2xl:grid-cols-[1.58fr_1fr]"><Card className="border-slate-200/80 shadow-sm"><CardContent className="p-4 sm:p-5"><div className="mb-4"><h2 className="text-lg font-extrabold text-slate-900">Parcours d’une séance</h2><p className="text-xs text-slate-500">Étapes dédupliquées par identifiant de séance · cohorte de création de la période</p></div>{funnelRead.ok ? <FunnelView points={funnelPoints} /> : <EmptyError />}<p className="mt-4 flex gap-2 text-xs leading-relaxed text-slate-600"><Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />Le taux de complétion utilise les séances créées dans la période comme dénominateur, puis compte celles avec un événement `session.completed`. Les transitions exactes et abandons ne sont pas mesurés.</p></CardContent></Card>
      <Card className="border-slate-200/80 shadow-sm"><CardContent className="p-4 sm:p-5"><h2 className="text-lg font-extrabold text-slate-900">Utilisateurs actifs et séances complétées</h2><p className="mb-2 text-xs text-slate-500">Évolution · {period.label} · utilisateurs distincts par jour</p>{dayRead.ok ? <ActivityChart points={dayPoints} /> : <EmptyError />}</CardContent></Card></div>

    <div className="grid gap-3 2xl:grid-cols-[1fr_1.08fr]"><Card className="border-slate-200/80 shadow-sm"><CardContent className="p-4 sm:p-5"><h2 className="text-lg font-extrabold text-slate-900">Utilisation des fonctionnalités par rôle</h2><p className="mb-3 text-xs text-slate-500">Comptes uniques ayant généré un événement de cette famille · {period.label}</p>{featureRead.ok ? <FeatureTable stats={features} selectedRole={role} /> : <EmptyError />}</CardContent></Card>
      <Card className="border-slate-200/80 shadow-sm"><CardContent className="p-4 sm:p-5"><div className="flex items-start justify-between gap-2"><div><h2 className="text-lg font-extrabold text-slate-900">Anomalies à examiner</h2><p className="text-xs text-slate-500">Critère suivi : au moins 5 échecs de connexion pour un compte dans la période.</p></div><Link href={`/admin/erreurs-stabilite?period=${period.key}`} className="shrink-0 rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100">Voir toutes les anomalies <ArrowRight className="ml-1 inline h-3 w-3" /></Link></div>{anomalyRead.ok ? Number(anomaly?.users ?? 0) > 0 ? <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50/60 p-4"><p className="flex items-center gap-2 font-bold text-rose-800"><AlertTriangle className="h-5 w-5" />Échecs répétés d’authentification</p><p className="mt-1 text-sm text-slate-700">{anomaly?.users} compte(s) ont atteint le seuil; {anomaly?.total} échecs suivis.</p><p className="mt-1 text-xs text-slate-500">Dernière occurrence : {anomaly?.latest?.toLocaleString("fr-CA") ?? "Non disponible"}. Aucun identifiant n’est affiché.</p></div> : <p className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900">Aucun compte n’a atteint le seuil explicite de 5 échecs de connexion dans la période.</p> : <EmptyError />}<div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500"><p className="rounded-lg bg-slate-50 p-3">Rechargements répétés : non mesurés</p><p className="rounded-lg bg-slate-50 p-3">Erreurs de publication : non mesurées</p></div></CardContent></Card></div>

    <Card className="border-slate-200/80 shadow-sm"><CardContent className="p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-lg font-extrabold text-slate-900">Événements récents de parcours interrompus</h2><p className="text-xs text-slate-500">Étape atteinte, étape attendue et motif d’arrêt</p></div><span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">Données indisponibles</span></div><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead><tr className="border-y border-slate-100 text-slate-500">{["Heure", "Séance", "Rôle", "Étape atteinte", "Étape suivante", "Motif de l’arrêt", "Utilisateur"].map((item) => <th key={item} className="py-2.5 pr-3">{item}</th>)}</tr></thead><tbody><tr><td colSpan={7} className="py-7 text-center text-sm text-slate-500">Les abandons ne sont pas journalisés. Aucun événement de parcours interrompu n’est inventé.<br /><span className="text-xs">À instrumenter : `journey.interrupted` avec session, dernière étape, étape attendue et code de motif non personnel.</span></td></tr></tbody></table></div></CardContent></Card>
    <p className="text-xs text-slate-500">Sources : AppEvent (`auth.login`, `session.created`, `session.created_from_template`, `session.updated`, `session.published`, `session.previewed`, `session.completed`) et rôles/groupes de l’application. La ligne Progression compte uniquement les comptes ayant un événement `session.completed`. Calendrier et bibliothèque ne produisent pas de télémétrie d’usage dédiée.</p>
  </div></AdminShell>;
}

async function safeQuery<T extends import("pg").QueryResultRow>(sql: string, values: unknown[] = []) { try { const result = await query<T>(sql, values); return { ok: true, rows: result.rows }; } catch { return { ok: false, rows: [] as T[] }; } }
function buildFunnel(rows: FunnelRow[]): FunnelPoint[] {
  const cohort = Number(rows.find((row) => row.type === "cohort_created")?.count ?? 0);
  const stages = [{ label: "Créées", types: ["session.created", "session.created_from_template"], tone: "blue" }, { label: "Modifiées", types: ["session.updated"], tone: "sky" }, { label: "Publiées", types: ["session.published"], tone: "violet" }, { label: "Consultées", types: ["session.previewed"], tone: "teal" }, { label: "Complétées", types: ["session.completed"], tone: "green" }];
  return stages.map((stage, index) => {
    const value = index === 0 ? cohort : stage.types.reduce((sum, type) => sum + Number(rows.find((row) => row.type === type)?.count ?? 0), 0);
    return { label: stage.label, count: value, percent: cohort ? value / cohort * 100 : null, tone: stage.tone, dropoff: null };
  });
}
function change(current: number, prior: number) { if (prior === 0) return current === 0 ? 0 : null; return (current - prior) / prior * 100; }

function Kpi({ icon: Icon, title, value, note, trend, tone }: { icon: LucideIcon; title: string; value: string; note: string; trend?: number | null; tone: string }) {
  const classes: Record<string, string> = { blue: "bg-blue-50 text-blue-600", violet: "bg-violet-50 text-violet-600", green: "bg-emerald-50 text-emerald-600", rose: "bg-rose-50 text-rose-600" };
  return <Card className="border-slate-200/80 shadow-sm"><CardContent className="flex min-h-24 gap-3 p-4"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${classes[tone]}`}><Icon className="h-5 w-5" /></span><div className="min-w-0"><h2 className="text-xs font-bold text-slate-600">{title}</h2><p className="mt-1 text-2xl font-black tracking-tight text-slate-950">{value}</p><p className="mt-1 text-[11px] leading-snug text-slate-500">{note}</p>{trend !== undefined && <p className={`mt-1 text-xs font-bold ${trend === null ? "text-slate-500" : trend >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{trend === null ? "Comparaison non mesurée" : `${trend >= 0 ? "↑" : "↓"} ${Math.abs(trend).toFixed(0)} % vs période précédente`}</p>}</div></CardContent></Card>;
}
function FunnelView({ points }: { points: FunnelPoint[] }) { const colors: Record<string, string> = { blue: "bg-blue-100 border-blue-200", sky: "bg-sky-100 border-sky-200", violet: "bg-violet-100 border-violet-200", teal: "bg-teal-100 border-teal-200", green: "bg-emerald-100 border-emerald-200" }; return <div className="grid grid-cols-2 gap-2 md:grid-cols-5">{points.map((point, index) => <div key={point.label} className={`relative min-h-32 rounded-2xl border p-3 text-center ${colors[point.tone]}`}><span className="mx-auto grid h-9 w-9 place-items-center rounded-full bg-white text-blue-700 shadow-sm">{index === 0 ? <FileText className="h-4 w-4" /> : index === 4 ? <CheckCircle2 className="h-4 w-4" /> : <Activity className="h-4 w-4" />}</span><p className="mt-2 text-xs font-bold text-slate-800">{point.label}</p><p className="mt-1 text-xl font-black text-slate-950">{point.count}</p><p className="text-[11px] text-slate-600">{point.percent === null ? "Non mesuré" : `${point.percent.toFixed(0)} % de la cohorte`}</p><p className="mt-1 text-[10px] text-slate-500">{index > 0 ? "Passage précédent : non mesuré" : "Séances distinctes"}</p></div>)}</div>; }
function FeatureTable({ stats, selectedRole }: { stats: FeatureStat[]; selectedRole: string }) { return <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-xs"><thead><tr className="border-y border-slate-100 text-slate-500"><th className="py-2.5 pr-3">Fonctionnalité</th>{["COACH", "ATHLETE", "ADMIN"].map((role) => <th key={role} className="py-2.5 px-2">{role === "COACH" ? "Coach" : role === "ATHLETE" ? "Athlète" : "Administrateur"}</th>)}</tr></thead><tbody>{["Séances", "Calendrier", "Progression", "Bibliothèque", "Administration"].map((feature) => { const mapped = feature === "Séances" ? "Séances" : feature === "Progression" ? "Progression" : feature === "Administration" ? "Administration" : "Non mesuré"; const vals = ["COACH", "ATHLETE", "ADMIN"].map((role) => stats.find((row) => row.feature === mapped && row.role === role)?.users); const max = Math.max(1, ...vals.map((value) => value ?? 0)); return <tr key={feature} className="border-b border-slate-100"><th className="py-3 pr-3 font-semibold text-slate-800">{feature}</th>{vals.map((value, index) => { const role = ["COACH", "ATHLETE", "ADMIN"][index]; const filteredOut = selectedRole !== "all" && selectedRole !== role; return <td key={role} className="px-2 py-3"><span className="flex items-center gap-2"><span className="w-6 text-right font-bold tabular-nums">{mapped === "Non mesuré" ? "—" : filteredOut ? "—" : value ?? 0}</span><span className="h-2 min-w-8 flex-1 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-blue-500" style={{ width: mapped === "Non mesuré" || filteredOut ? "0%" : `${Math.round((value ?? 0) / max * 100)}%` }} /></span></span></td>; })}</tr>; })}</tbody></table><p className="mt-2 text-[11px] text-slate-500">Calendrier et bibliothèque : aucun événement d’usage dédié. Les événements de séance et progression comptent des utilisateurs uniques par famille.</p></div>; }
function EmptyError() { return <p role="status" className="rounded-lg bg-rose-50 p-4 text-sm text-rose-800">Données indisponibles pour cette section.</p>; }
