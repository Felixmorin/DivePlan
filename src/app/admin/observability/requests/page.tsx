import Link from "next/link";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdmin } from "@/lib/current-user";
import { getRequestExplorer } from "@/lib/request-explorer";
import { observationWindow, requestTriggers, resourceLabels, resourcePath } from "@/lib/request-observation";
import { formatMontrealDate } from "@/lib/timezone";

export const dynamic = "force-dynamic";
type Params = { hour?: string; period?: string; route?: string; type?: string; trigger?: string; pageId?: string; before?: string; beforeId?: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fieldClass = "min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-600";
export default async function RequestExplorerPage({ searchParams }: { searchParams: Promise<{ [K in keyof Params]?: string | string[] }> }) {
  await requireAdmin();
  const rawParams = await searchParams;
  if (Object.values(rawParams).some(value => value !== undefined && typeof value !== "string")) {
    return <AdminShell active="Observabilité"><h1 className="text-2xl font-black">Filtres invalides</h1><Link href="/admin/observability" className="mt-4 inline-block text-blue-700 underline">Revenir à l’observabilité</Link></AdminShell>;
  }
  const params = rawParams as Params;
  const window = observationWindow(params);
  const route = params.route ? resourcePath(params.route) : null;
  const type = params.type && Object.hasOwn(resourceLabels, params.type) ? params.type : null;
  const trigger = params.trigger && Object.hasOwn(requestTriggers, params.trigger) ? params.trigger : null;
  const pageId = params.pageId && uuid.test(params.pageId) ? params.pageId : null;
  const before = params.before ? new Date(params.before) : null;
  const beforeId = params.beforeId && uuid.test(params.beforeId) ? params.beforeId : null;
  if (!window || (params.route && !route) || (params.type && !type) || (params.trigger && !trigger)
    || (params.pageId && !pageId) || (before && (!Number.isFinite(before.getTime()) || !beforeId)) || (beforeId && !before)) {
    return <AdminShell active="Observabilité"><h1 className="text-2xl font-black">Filtres invalides</h1><p className="mt-3">Choisissez une heure des sept derniers jours.</p><Link href="/admin/observability" className="mt-4 inline-block text-blue-700 underline">Revenir à l’observabilité</Link></AdminShell>;
  }
  let data: Awaited<ReturnType<typeof getRequestExplorer>>;
  try {
    data = await getRequestExplorer({ ...window, route, type, trigger, pageId, before, beforeId });
  } catch (error) {
    if ((error as { code?: string }).code !== "42P01") throw error;
    return <AdminShell active="Observabilité"><h1 className="text-2xl font-black">Explorateur de requêtes</h1><p role="status" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">La collecte détaillée n’est pas encore disponible. L’administrateur technique doit appliquer la migration 0026 avant le déploiement du collecteur.</p><Link href="/admin/observability" className="mt-4 inline-block text-blue-700 underline">Revenir aux agrégats existants</Link></AdminShell>;
  }
  const url = (patch: Partial<Record<keyof Params, string | undefined>>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...params, before: undefined, beforeId: undefined, ...patch })) if (value) next.set(key, value);
    return `/admin/observability/requests?${next}`;
  };
  const count = Number(data.summary.count);
  const total = Number(data.total.count);
  const filtered = Boolean(type || trigger || pageId);
  const last = data.list.at(-1);
  const periodWindow = observationWindow({ period: params.period })!;
  const hourChoices = Array.from({ length: Math.min(168, window.hours) }, (_, i) => new Date(periodWindow.to.getTime() - (i + 1) * 3_600_000));
  return <AdminShell active="Observabilité">
    <Link href={`/admin/observability?period=${params.period ?? "24h"}`} className="text-sm font-semibold text-blue-700 underline underline-offset-4">Retour à l’observabilité</Link>
    <header className="mb-6 mt-4"><h1 className="text-3xl font-black tracking-tight text-slate-950">Explorer les requêtes</h1><p className="mt-2 text-sm text-slate-600">{date(window.from)} → {date(window.to)} · Heure de Montréal</p><p className="mt-1 text-sm text-slate-600">{route ? `Page d’origine : ${route}` : "Toutes les pages"} · Ressources observées par les navigateurs connectés.</p></header>
    <form className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <input type="hidden" name="period" value={params.period ?? "24h"} />
      <label className="grid gap-1 text-xs font-semibold text-slate-700">Heure<select name="hour" defaultValue={params.hour ?? ""} className={fieldClass}><option value="">Toute la période</option>{params.hour && !hourChoices.some(h => h.toISOString() === params.hour) && <option value={params.hour}>{date(window.from)}</option>}{hourChoices.map(hour => <option key={hour.toISOString()} value={hour.toISOString()}>{date(hour)}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-semibold text-slate-700">Page d’origine<input name="route" defaultValue={route ?? ""} placeholder="Toutes · ex. /coach" maxLength={200} className={fieldClass} /></label>
      <label className="grid gap-1 text-xs font-semibold text-slate-700">Type<select name="type" defaultValue={type ?? ""} className={fieldClass}><option value="">Tous les types</option>{Object.entries(resourceLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-semibold text-slate-700">Déclencheur<select name="trigger" defaultValue={trigger ?? ""} className={fieldClass}><option value="">Tous les déclencheurs</option>{Object.entries(requestTriggers).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      {pageId && <input type="hidden" name="pageId" value={pageId} />}
      <button className="min-h-10 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Appliquer</button>
      <Link prefetch={false} href={url({ type: undefined, trigger: undefined, pageId: undefined })} className="py-2 text-sm font-semibold text-blue-700 underline">Effacer les filtres de détail</Link>
    </form>
    <section aria-label="Couverture des mesures" className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
      <p><strong>{count.toLocaleString("fr-CA")} observations détaillées{filtered ? " correspondant aux filtres" : ""}</strong> · {total.toLocaleString("fr-CA")} ressources dans les agrégats de la page et de la période, tous types confondus.</p>
      <p>{filtered ? "Retirez les filtres de détail pour comparer la couverture." : `${Math.max(0, total - count).toLocaleString("fr-CA")} ressources sans détail individuel disponible (historique, limites de collecte ou rétention).`}</p>
      <p>Source : Resource Timing du navigateur · dernière réception du détail : {data.summary.latest ? date(data.summary.latest, true) : "aucune"}. Aucun historique détaillé antérieur au déploiement. Rétention cible : 7 jours.</p>
    </section>
    <dl className="mb-7 flex flex-wrap gap-x-10 gap-y-3 text-sm"><div><dt className="text-slate-600">Documents navigateur distincts</dt><dd className="mt-1 text-xl font-black">{data.summary.pages}</dd></div><div><dt className="text-slate-600">Statuts HTTP ≥ 400 observés</dt><dd className="mt-1 text-xl font-black">{data.summary.errors}</dd></div><div><dt className="text-slate-600">Transfert navigateur</dt><dd className="mt-1 text-xl font-black">{bytes(Number(data.summary.bytes))}</dd></div><div><dt className="text-slate-600">Durée moyenne navigateur</dt><dd className="mt-1 text-xl font-black">{data.summary.duration === null ? "—" : `${data.summary.duration} ms`}</dd></div></dl>
    <div className="mb-7 grid gap-6 xl:grid-cols-2">
      <section><h2 className="mb-3 text-lg font-black">Qu’est-ce qui compose ce volume ?</h2><div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">{data.breakdown.map(row => <Link prefetch={false} key={`${row.resourceType}-${row.trigger}`} href={url({ type: row.resourceType, trigger: row.trigger })} className="flex min-h-12 items-center justify-between gap-4 px-4 py-3 text-sm hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-600"><span>{resourceLabels[row.resourceType]} · {requestTriggers[row.trigger]}</span><strong className="tabular-nums">{row.count}</strong></Link>)}{!count && <p className="p-5 text-sm text-slate-600">Aucun détail reçu pour cette sélection. Les anciens totaux ne permettent pas de reconstruire les requêtes.</p>}</div></section>
      <section><h2 className="mb-3 text-lg font-black">Ressources les plus appelées</h2><div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">{data.targets.map(row => <div key={row.resourcePath} className="flex items-start justify-between gap-3 px-4 py-3 text-sm"><code className="min-w-0 break-all">{row.resourcePath}</code><span className="shrink-0 text-right"><strong>{row.count}</strong><span className="ml-3 text-slate-600">{bytes(Number(row.bytes))}</span></span></div>)}{!count && <p className="p-5 text-sm text-slate-600">Aucune ressource détaillée.</p>}</div></section>
    </div>
    {data.minutes.length > 0 && <details className="mb-6 rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer font-semibold">Répartition par minute · détails collectés</summary><div className="mt-4 flex flex-wrap gap-2">{data.minutes.map(row => <span key={row.minute.toISOString()} className="rounded-lg bg-slate-100 px-3 py-2 text-xs tabular-nums">{formatMontrealDate(row.minute, { hour: "2-digit", minute: "2-digit" })} : <strong>{row.count}</strong></span>)}</div></details>}
    <section><h2 className="mb-3 text-lg font-black">Requêtes individuelles</h2><p className="mb-3 text-sm text-slate-600">50 résultats par page, du plus récent au plus ancien. Ouvrez une ligne pour son identifiant et son contexte.</p>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-600"><tr>{["Heure", "Page d’origine → ressource", "Déclencheur", "Statut", "Durée", "Transfert"].map(label => <th key={label} className="px-4 py-3 font-semibold">{label}</th>)}</tr></thead><tbody>{data.list.map(row => <tr key={row.id} className="border-t border-slate-200 align-top"><td className="whitespace-nowrap px-4 py-3 tabular-nums">{date(row.startedAt, true)}</td><td className="max-w-[380px] px-4 py-3"><details><summary className="cursor-pointer break-all text-blue-800"><strong>{row.route}</strong><br /><code className="text-xs">{row.resourcePath}</code></summary><div className="mt-3 space-y-2 break-all text-xs leading-5 text-slate-600"><p>Observation : {row.id}</p><p>Document navigateur : {row.pageId}</p><p>Reçue : {date(row.receivedAt, true)} · Type : {resourceLabels[row.resourceType]}</p><p>Cache navigateur probable : {row.cacheHit ? "oui" : "non identifié"}</p><Link prefetch={false} href={url({ pageId: row.pageId })} className="inline-block text-blue-700 underline">Voir les ressources de ce document navigateur</Link></div></details></td><td className="px-4 py-3 text-xs">{requestTriggers[row.trigger]}</td><td className={`px-4 py-3 tabular-nums ${row.status && row.status >= 400 ? "font-bold text-rose-700" : "text-slate-700"}`}>{row.status ?? "Indisponible"}</td><td className="whitespace-nowrap px-4 py-3 tabular-nums">{row.durationMs} ms</td><td className="whitespace-nowrap px-4 py-3 tabular-nums">{bytes(Number(row.transferBytes))}</td></tr>)}{!data.list.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-600">Aucune observation pour ces filtres.</td></tr>}</tbody></table></div>
      <nav aria-label="Pagination des requêtes" className="mt-4 flex justify-between text-sm font-semibold text-blue-700">{before ? <Link prefetch={false} href={url({})} className="underline">Revenir aux plus récentes</Link> : <span />}{data.hasMore && last && <Link prefetch={false} href={url({ before: last.startedAt.toISOString(), beforeId: last.id })} className="underline">50 suivantes</Link>}</nav>
    </section>
    <p className="mt-7 max-w-4xl text-xs leading-6 text-slate-600">Limites : ces observations ne sont pas un journal serveur exhaustif. Un document navigateur n’est ni une personne ni une visite. La durée inclut le réseau et ne mesure pas le temps serveur. Le statut peut être indisponible selon le navigateur. Les préchargements, actualisations automatiques, nouvelles tentatives et appels SQL ne sont pas identifiés individuellement ici : un chargement RSC indique seulement un échange Next.js. Les paramètres d’URL, identifiants dynamiques, en-têtes et contenus ne sont pas conservés. Le trafic de cette page reste identifiable par sa route; les envois de télémétrie sont exclus de la collecte.</p>
  </AdminShell>;
}
function date(value: Date, seconds = false) { return formatMontrealDate(value, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZoneName: "short", ...(seconds ? { second: "2-digit" as const } : {}) }); }
function bytes(value: number) { if (value < 1024) return `${value} o`; if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} Ko`; return `${(value / 1024 ** 2).toFixed(1)} Mo`; }
