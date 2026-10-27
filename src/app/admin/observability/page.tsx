import Link from "@/components/ui/app-link";
import { Activity, ArrowDownUp, ShieldAlert, Zap, Clock3, ChevronDown, FileText, Gauge, CircleHelp, Server, Timer, TriangleAlert } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdmin } from "@/lib/current-user";
import { query } from "@/lib/db";
import { formatMontrealDate } from "@/lib/timezone";

export const dynamic = "force-dynamic";

type RouteRow = { route: string; requests: string; bytes: string; totalRequests: string; totalBytes: string };
type HourRow = { hour: Date; requests: string; bytes: string };
type VitalsRow = { metric: string; average: string; samples: string };
type EventRow = { type: string; message: string; clubName: string | null; createdAt: Date };

export default async function AdminObservabilityPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  await requireAdmin();
  const { period } = await searchParams;
  const hours = period === "6h" ? 6 : period === "12h" ? 12 : period === "72h" ? 72 : period === "7d" ? 168 : 24;
  const [transfer, hourly, database, vitals, eventCounts, recentEvents] = await Promise.all([
    query<RouteRow>(`SELECT route, SUM(requests)::text AS requests, SUM("transferBytes")::text AS bytes, SUM(SUM(requests)) OVER ()::text AS "totalRequests", SUM(SUM("transferBytes")) OVER ()::text AS "totalBytes" FROM "TransferTelemetryHour" WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour') GROUP BY route ORDER BY SUM(requests) DESC LIMIT 30`, [hours]),
    query<HourRow>(`SELECT hour, SUM(requests)::text AS requests, SUM("transferBytes")::text AS bytes FROM "TransferTelemetryHour" WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour') GROUP BY hour ORDER BY hour`, [hours]),
    query<{ requests: string; bytes: string }>(`SELECT COALESCE(SUM(requests), 0)::text AS requests, COALESCE(SUM("resultBytes"), 0)::text AS bytes FROM "DatabaseEgressTelemetryHour" WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour')`, [hours]),
    query<VitalsRow>(`SELECT metric, (SUM("ratedTotalValue") / NULLIF(SUM("ratedSamples"), 0))::text AS average, SUM("ratedSamples")::text AS samples FROM "PerformanceTelemetryHour" WHERE hour >= NOW() - ($1::int * INTERVAL '1 hour') GROUP BY metric ORDER BY SUM("ratedSamples") DESC LIMIT 8`, [hours]),
    query<{ failedLogins: string; total: string }>(`SELECT count(*) FILTER (WHERE type = 'auth.failed')::text AS "failedLogins", count(*)::text AS total FROM "AppEvent" WHERE "createdAt" >= NOW() - ($1::int * INTERVAL '1 hour')`, [hours]),
    query<EventRow>(`SELECT e.type, e.message, c.name AS "clubName", e."createdAt" FROM "AppEvent" e LEFT JOIN "Club" c ON c.id = e."clubId" ORDER BY e."createdAt" DESC LIMIT 6`)
  ]);
  const explorerPeriod = hours === 168 ? "7d" : hours === 72 ? "72h" : `${hours}h`;
  const explorerHref = `/admin/observability/requests?period=${explorerPeriod}`;
  const transferBytes = Number(transfer.rows[0]?.totalBytes ?? 0);
  const requests = Number(transfer.rows[0]?.totalRequests ?? 0);
  const failedLogins = Number(eventCounts.rows[0]?.failedLogins ?? 0);
  const eventTotal = Number(eventCounts.rows[0]?.total ?? 0);
  const vitalRows = [...vitals.rows].sort((a, b) => vitalOrder(a.metric) - vitalOrder(b.metric)).slice(0, 3);
  const routeMax = Math.max(1, ...transfer.rows.map((r) => Number(r.requests)));
  return <AdminShell active="Observabilité">
    <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Observabilité</h1><p className="mt-1 text-sm leading-6 text-slate-600">Surveillez les performances et la santé de la plateforme DivePlan.</p></div>
      <nav aria-label="Période d’observation" className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">{[["6h", "6 h"], ["12h", "12 h"], ["24h", "24 h"], ["72h", "3 jours"], ["7d", "7 jours"]].map(([key, label]) => {
        const active = (key === "6h" && hours === 6) || (key === "12h" && hours === 12) || (key === "24h" && hours === 24) || (key === "72h" && hours === 72) || (key === "7d" && hours === 168);
        return <Link key={key} href={`/admin/observability?period=${key}`} aria-current={active ? "page" : undefined} className={`inline-flex min-h-9 items-center rounded-lg px-3.5 text-sm font-bold transition focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${active ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}>{label}</Link>;
      })}</nav>
    </header>

    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950"><p>Cliquez sur une heure ou une route pour comprendre les ressources chargées.</p><Link prefetch={false} href={explorerHref} className="font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-blue-600">Explorer les requêtes</Link></div>
    <section aria-label="Indicateurs techniques" className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
      <Metric icon={ArrowDownUp} value={formatBytes(transferBytes)} label="Transferts" detail="Volume observé" tone="blue" />
      <Metric icon={FileText} value={requests.toLocaleString("fr-CA")} label="Requêtes" detail="Sur la période sélectionnée" tone="violet" />
      <Metric icon={Zap} value={eventTotal.toLocaleString("fr-CA")} label="Événements" detail="Journal applicatif" tone="teal" />
      <Metric icon={ShieldAlert} value={failedLogins.toLocaleString("fr-CA")} label="Connexions échouées" detail="Événements auth.failed" tone="rose" />
    </section>

    <Card className="mt-4 overflow-hidden"><CardContent className="p-4 sm:p-5"><div className="mb-3 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-black text-slate-950">Activité de la plateforme</h2><p className="mt-1 text-xs text-slate-500">Requêtes et volume transféré par heure · {periodLabel(hours)}</p></div><span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600"><Clock3 className="h-3.5 w-3.5" /> Agrégats horaires</span></div><ActivityChart rows={hourly.rows} periodHours={hours} explorerHref={explorerHref} /></CardContent></Card>

    <section className="mt-4 grid items-stretch gap-4 xl:grid-cols-2">
      <Card className="overflow-hidden"><CardContent className="p-4 sm:p-5"><PanelHeading title="Routes les plus sollicitées" detail="Classées selon les requêtes observées" icon={ArrowDownUp} /><div className="space-y-3 pt-1">{transfer.rows.slice(0, 5).map((row, index) => <Link prefetch={false} href={`${explorerHref}&route=${encodeURIComponent(row.route)}`} key={row.route} className="rounded-lg hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-600 grid grid-cols-[minmax(125px,1fr)_minmax(100px,2fr)_34px] items-center gap-3 text-sm"><span className="truncate font-medium text-slate-700" title={row.route}>{row.route}</span><span className="h-3 overflow-hidden rounded-full bg-slate-100"><span className={`block h-full rounded-full ${index === 0 ? "bg-blue-600" : "bg-blue-300"}`} style={{ width: `${Math.max(2, Number(row.requests) / routeMax * 100)}%` }} /></span><span className="text-right tabular-nums text-slate-600">{Number(row.requests).toLocaleString("fr-CA")}</span></Link>)}{!transfer.rows.length && <p className="py-6 text-center text-sm text-slate-500">Aucune route mesurée sur cette période.</p>}</div><p className="mt-4 text-xs text-slate-500">Ressources navigateur attribuées à la page ouverte, par route normalisée. Ce ne sont pas des visites.</p></CardContent></Card>
      <Card className="overflow-hidden"><CardContent className="p-4 sm:p-5"><div className="mb-3 flex items-center gap-3 border-b border-slate-100 pb-3"><Gauge className="h-5 w-5 shrink-0 text-slate-700" /><div className="min-w-0 flex-1"><h2 className="font-black text-slate-950">Web Vitals</h2><p className="mt-1 text-xs text-slate-500">Moyennes des échantillons reçus</p></div><span title="Mesures de performance navigateur agrégées" className="shrink-0 text-slate-400"><CircleHelp className="h-4 w-4" /></span></div><div className="space-y-2">{vitalRows.map((row) => <div key={row.metric} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5"><div className="min-w-0"><p className="font-bold text-slate-900">{row.metric}</p><p className="truncate text-xs text-slate-500">{metricName(row.metric)}</p></div><div className="text-right"><p className="font-bold tabular-nums text-slate-900">{formatMetric(row.metric, Number(row.average))}</p><p className="text-[11px] text-slate-500">{Number(row.samples).toLocaleString("fr-CA")} échant.</p></div><span className="rounded-md bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700">Moyenne</span></div>)}{!vitalRows.length && <p className="py-6 text-center text-sm text-slate-500">Aucun échantillon Web Vitals sur cette période.</p>}</div></CardContent></Card>
    </section>

    <section className="mt-4 grid items-start gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <Card className="overflow-hidden"><CardContent className="p-4 sm:p-5"><PanelHeading title="Journal des événements" detail="6 activités les plus récentes" icon={FileText} /><div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-xs"><thead><tr className="text-slate-500"><th className="py-2 pr-3 font-semibold">Heure</th><th className="py-2 pr-3 font-semibold">Type</th><th className="py-2 pr-3 font-semibold">Événement</th><th className="py-2 font-semibold">Club</th></tr></thead><tbody>{recentEvents.rows.map((event, index) => <tr key={`${event.type}-${event.createdAt.toISOString()}-${index}`} className="border-t border-slate-100"><td className="whitespace-nowrap py-2.5 pr-3 tabular-nums text-slate-500">{formatEventTime(event.createdAt)}</td><td className="py-2.5 pr-3"><span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${event.type === "auth.failed" ? "bg-rose-500" : "bg-blue-500"}`} /><span className="font-medium text-slate-700">{event.type}</span></td><td className="max-w-[240px] truncate py-2.5 pr-3 text-slate-600" title={event.message}>{event.message}</td><td className="py-2.5 text-slate-600">{event.clubName ?? "Système"}</td></tr>)}{!recentEvents.rows.length && <tr><td colSpan={4} className="py-8 text-center text-sm text-slate-500">Aucun événement enregistré.</td></tr>}</tbody></table></div></CardContent></Card>
      <Card className="overflow-hidden"><CardContent className="p-4 sm:p-5"><PanelHeading title="Détails techniques" detail="Couverture et limites des mesures" icon={Activity} /><div className="space-y-2"><TechnicalDetail icon={FileText} title="Requêtes par statut" text="Le code de statut HTTP n’est pas inclus dans les agrégats disponibles." /><TechnicalDetail icon={Timer} title="Temps de réponse par route" text="La durée des requêtes serveur n’est pas instrumentée dans ces mesures." /><TechnicalDetail icon={TriangleAlert} title="Erreurs et exceptions" text={`${failedLogins.toLocaleString("fr-CA")} échec(s) de connexion dans la période. Les exceptions applicatives ne sont pas agrégées ici.`} /><TechnicalDetail icon={Server} title="Consommation des ressources" text={`Transferts : ${formatBytes(transferBytes)}. Résultats PostgreSQL : ${formatBytes(Number(database.rows[0]?.bytes ?? 0))} sur ${Number(database.rows[0]?.requests ?? 0).toLocaleString("fr-CA")} requêtes. Ces volumes ne mesurent pas le FOT Vercel facturé.`} /></div></CardContent></Card>
    </section>
  </AdminShell>;
}

function Metric({ icon: Icon, value, label, detail, tone }: { icon: typeof Activity; value: string; label: string; detail: string; tone: "blue" | "violet" | "teal" | "rose" }) {
  const tones = { blue: "bg-blue-100 text-blue-700", violet: "bg-violet-100 text-violet-700", teal: "bg-teal-100 text-teal-700", rose: "bg-rose-100 text-rose-700" };
  return <Card className="min-h-[108px] border-slate-200/80 shadow-sm"><CardContent className="flex items-center gap-3 p-4"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tones[tone]}`}><Icon className="h-5 w-5" /></span><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-600">{label}</p><p className="mt-0.5 truncate text-2xl font-black tabular-nums text-slate-950">{value}</p><p className="mt-0.5 truncate text-[11px] text-slate-500">{detail}</p></div></CardContent></Card>;
}

function PanelHeading({ title, detail, icon: Icon }: { title: string; detail: string; icon: typeof Activity }) { return <div className="mb-3 flex min-w-0 items-center justify-between gap-3 border-b border-slate-100 pb-3"><div className="min-w-0"><h2 className="truncate font-black text-slate-950">{title}</h2><p className="mt-1 truncate text-xs text-slate-500">{detail}</p></div><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-700"><Icon className="h-4 w-4" /></span></div>; }

function TechnicalDetail({ icon: Icon, title, text }: { icon: typeof Activity; title: string; text: string }) { return <details className="group rounded-lg border border-slate-200"><summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 text-xs font-medium text-slate-700 marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><Icon className="h-4 w-4 shrink-0 text-slate-500" /><span className="flex-1">{title}</span><ChevronDown className="h-4 w-4 text-slate-500 transition-transform group-open:rotate-180" /></summary><p className="border-t border-slate-100 px-3 py-2.5 text-xs leading-5 text-slate-600">{text}</p></details>; }

function ActivityChart({ rows, periodHours, explorerHref }: { rows: HourRow[]; periodHours: number; explorerHref: string }) {
  const width = 1000, height = 180, padX = 42, padY = 12;
  const maxRequests = Math.max(1, ...rows.map((r) => Number(r.requests)));
  const maxBytes = Math.max(1, ...rows.map((r) => Number(r.bytes)));
  const points = rows.map((row, index) => ({ x: padX + (rows.length < 2 ? 0 : index / (rows.length - 1) * (width - padX * 2)), yReq: height - padY - Number(row.requests) / maxRequests * (height - padY * 2), yBytes: height - padY - Number(row.bytes) / maxBytes * (height - padY * 2) }));
  const line = (key: "yReq" | "yBytes") => points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p[key].toFixed(1)}`).join(" ");
  const area = (key: "yReq" | "yBytes") => points.length ? `${line(key)} L${points.at(-1)!.x},${height - padY} L${points[0].x},${height - padY} Z` : "";
  if (!rows.length) return <div className="grid min-h-[190px] place-items-center rounded-xl border border-dashed border-slate-200 text-center"><p className="text-sm text-slate-500">Aucune donnée horaire de transfert pour cette période.</p></div>;
  return <div><div className="overflow-x-auto"><svg viewBox={`0 0 ${width} ${height + 25}`} role="group" aria-label={`Activité horaire : sélectionnez une heure pour explorer ses requêtes`} className="h-[190px] min-w-[680px] w-full"><defs><linearGradient id="request-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#2780ff" stopOpacity=".22" /><stop offset="100%" stopColor="#2780ff" stopOpacity=".015" /></linearGradient><linearGradient id="bytes-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#0bb8b4" stopOpacity=".25" /><stop offset="100%" stopColor="#0bb8b4" stopOpacity=".015" /></linearGradient></defs>{[0, 1, 2, 3, 4].map((i) => { const y = padY + i * (height - padY * 2) / 4; return <g key={i}><line x1={padX} x2={width - padX} y1={y} y2={y} stroke="#e7edf4" strokeWidth="1" /><text x={padX - 8} y={y + 4} textAnchor="end" fill="#718096" fontSize="11">{Math.round(maxRequests * (4 - i) / 4)}</text></g>; })}<path d={area("yBytes")} fill="url(#bytes-fill)" /><path d={area("yReq")} fill="url(#request-fill)" /><path d={line("yBytes")} fill="none" stroke="#0bb8b4" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" /><path d={line("yReq")} fill="none" stroke="#2780ff" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />{points.map((point, i) => <a key={rows[i].hour.toISOString()} href={`${explorerHref}&hour=${encodeURIComponent(rows[i].hour.toISOString())}`} aria-label={`${formatMontrealDate(rows[i].hour, { day: "numeric", month: "long", hour: "2-digit" })}, heure de Montréal : ${rows[i].requests} ressources. Explorer cette heure.`} className="focus-visible:outline-2 focus-visible:outline-blue-600"><title>{formatMontrealDate(rows[i].hour, { day: "numeric", month: "short", hour: "2-digit" })} · {rows[i].requests} ressources · Ouvrir le détail</title><circle cx={point.x} cy={point.yReq} r="12" fill="transparent" /><circle cx={point.x} cy={point.yReq} r="4" fill="#2780ff" /></a>)}{rows.filter((_, i) => i % Math.max(1, Math.ceil(rows.length / 8)) === 0).map((r) => { const i = rows.indexOf(r); const x = points[i].x; return <text key={r.hour.toISOString()} x={x} y={height + 17} textAnchor="middle" fill="#718096" fontSize="11">{formatHour(r.hour, periodHours)}</text>; })}</svg></div><div className="mt-1 flex flex-wrap justify-center gap-5 text-xs text-slate-600"><span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> Requêtes</span><span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-teal-500" /> Données transférées</span><span className="text-slate-400">Chaque série est normalisée pour montrer son évolution. Heures de Montréal.</span></div></div>;
}

function vitalOrder(metric: string) { const order = ["LCP", "FCP", "INP", "CLS", "TTFB"]; const index = order.indexOf(metric); return index < 0 ? order.length + 1 : index; }
function metricName(metric: string) { return ({ LCP: "Largest Contentful Paint", FCP: "First Contentful Paint", INP: "Interaction to Next Paint", CLS: "Cumulative Layout Shift", TTFB: "Time to First Byte" } as Record<string, string>)[metric] ?? "Mesure de performance"; }
function formatBytes(bytes: number) { if (bytes < 1024) return `${Math.round(bytes)} o`; const units = ["Ko", "Mo", "Go"]; let value = bytes / 1024; let unit = 0; while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; } return `${value.toLocaleString("fr-CA", { maximumFractionDigits: 1 })} ${units[unit]}`; }
function formatMetric(metric: string, value: number) { return metric === "CLS" ? value.toLocaleString("fr-CA", { maximumFractionDigits: 3 }) : `${(value >= 1000 ? (value / 1000).toLocaleString("fr-CA", { maximumFractionDigits: 1 }) + " s" : Math.round(value).toLocaleString("fr-CA") + " ms")}`; }
function periodLabel(hours: number) { return hours === 6 ? "6 dernières heures" : hours === 12 ? "12 dernières heures" : hours === 24 ? "24 dernières heures" : hours === 72 ? "3 derniers jours" : "7 derniers jours"; }
function formatHour(date: Date, periodHours: number) { return formatMontrealDate(date, periodHours > 24 ? { day: "numeric", month: "short", hour: "2-digit" } : { hour: "2-digit" }); }
function formatEventTime(date: Date) {
  const parts = new Intl.DateTimeFormat("fr-CA", { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZone: "America/Toronto" }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value.padStart(2, "0") ?? "00";
  return `${value("hour")}:${value("minute")}:${value("second")}`;
}

