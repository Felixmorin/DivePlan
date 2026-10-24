"use client";

import { useMemo, useState, useTransition } from "react";
import { Activity, AlertTriangle, ArrowRight, Bot, Code2, Database, FileText, History, LoaderCircle, Play, Plus, Shield, ToggleLeft, ToggleRight, X } from "lucide-react";
import { cancelQueuedAgentRun, createAgent, enqueueAgentRun, updateAgentEnabled, updateAgentTriggers } from "./actions";

type TriggerConfig = { onDemand: { enabled: boolean }; schedule: { enabled: boolean; cron: string }; afterDeploy: { enabled: boolean }; incident: { enabled: boolean } };
export type AgentRow = { id: string; name: string; mission: string; enabled: boolean; triggers: TriggerConfig; createdAt: Date | string; updatedAt: Date | string };
export type RunRow = { id: string; agentId: string; trigger: string; status: string; analysisPeriod: "24h" | "7d"; startedAt: Date | string | null; finishedAt: Date | string | null; result: Report | null; error: string | null; createdAt: Date | string };
type Report = { title: string; period: { label: string; from: string; to: string }; sources: Array<{ name: string; period: string; samples: number }>; facts: Array<{ category: string; fact: string; evidence: string }>; findings?: Array<{ kind: string; priority: string; impact: string; effort: string; title: string; location: string; evidence: string; limits: string; recommendation: string }>; assumptions: string[]; recommendations: string[]; missing: string[] };

const defaultTriggers: TriggerConfig = { onDemand: { enabled: true }, schedule: { enabled: false, cron: "0 9 * * 1" }, afterDeploy: { enabled: false }, incident: { enabled: false } };
const triggerNames: Record<string, string> = { on_demand: "À la demande", schedule: "Horaire", after_deploy: "Après déploiement", incident: "Incident" };

export function AgentsConsole({ agents: initialAgents, runs: initialRuns, supabaseStatsConfigured }: { agents: AgentRow[]; runs: RunRow[]; supabaseStatsConfigured: boolean }) {
  const [agents, setAgents] = useState(initialAgents);
  const [runs, setRuns] = useState(initialRuns);
  const [selectedId, setSelectedId] = useState(initialAgents[0]?.id ?? "");
  const [modal, setModal] = useState(false);
  const [analysisPeriod, setAnalysisPeriod] = useState<"24h" | "7d">("7d");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const selected = agents.find((agent) => agent.id === selectedId) ?? agents[0];
  const activeCount = agents.filter((agent) => agent.enabled).length;
  const runningCount = runs.filter((run) => run.status === "running" || run.status === "pending").length;
  const reviewCount = runs.filter((run) => run.status === "completed" && (run.result?.recommendations.length ?? 0) > 0).length;
  const selectedRuns = useMemo(() => runs.filter((run) => run.agentId === selected?.id), [runs, selected?.id]);

  function act(action: () => Promise<unknown>, success?: (value: unknown) => void) {
    setError("");
    startTransition(async () => { try { const value = await action(); success?.(value); } catch (e) { setError(e instanceof Error ? e.message : "Une erreur est survenue."); } });
  }
  function runNow() {
    if (!selected) return;
    act(() => enqueueAgentRun(selected.id, analysisPeriod), (value) => {
      const run = value as RunRow;
      setRuns((current) => [run, ...current.filter((item) => item.id !== run.id)]);
    });
  }
  function saveTriggers(next: TriggerConfig) {
    if (!selected) return;
    act(() => updateAgentTriggers(selected.id, next), () => setAgents((current) => current.map((agent) => agent.id === selected.id ? { ...agent, triggers: next } : agent)));
  }

  return <div className="mx-auto max-w-[1500px]">
    <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div><p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Administration · Automatisation</p><h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Agents</h1><p className="mt-1 text-sm text-slate-600">Configurez et surveillez les agents qui analysent DivePlan.</p></div>
      <button onClick={() => setModal(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><Plus className="h-4 w-4" />Créer un agent</button>
    </header>
    <section aria-label="Indicateurs des agents" className="grid gap-3 md:grid-cols-3">
      <Stat icon={Bot} label="agents actifs" value={activeCount} tone="blue" />
      <Stat icon={Play} label="exécutions en cours" value={runningCount} tone="sky" />
      <Stat icon={AlertTriangle} label="résultats à examiner" value={reviewCount} tone="amber" />
    </section>
    {error && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-800">{error}</p>}

    <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="hidden grid-cols-[1.15fr_2fr_.8fr_1fr_1.4fr] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500 lg:grid"><span>Agent</span><span>Mission</span><span>État</span><span>Dernière exécution</span><span>Résultat</span></div>
      {agents.map((agent) => {
        const last = runs.find((run) => run.agentId === agent.id);
        const chosen = selected?.id === agent.id;
        return <button key={agent.id} onClick={() => setSelectedId(agent.id)} className={`grid w-full grid-cols-1 gap-2 border-b border-slate-100 px-4 py-3 text-left transition last:border-0 hover:bg-blue-50/50 sm:grid-cols-[1fr_auto] lg:grid-cols-[1.15fr_2fr_.8fr_1fr_1.4fr] lg:items-center lg:gap-4 lg:px-5 ${chosen ? "bg-blue-50" : ""}`}>
          <span className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-100 text-blue-800"><Activity className="h-[18px] w-[18px]" /></span><span className="truncate text-sm font-bold text-slate-900">{agent.name}</span></span>
          <span className="line-clamp-2 text-sm text-slate-600">{agent.mission}</span>
          <span><Badge good={agent.enabled}>{agent.enabled ? "Actif" : "En pause"}</Badge></span>
          <span className="text-xs text-slate-600">{last?.startedAt ? dateLabel(last.startedAt) : "Aucune exécution"}</span>
          <span className={`text-sm ${last?.status === "failed" ? "text-rose-700" : "text-sky-700"}`}>{last ? last.status === "completed" ? `${last.result?.recommendations.length ?? 0} recommandation(s)` : last.status === "failed" ? "Échec · voir détail" : "Exécution en attente" : "Pas encore de résultat"}</span>
        </button>;
      })}
      {!agents.length && <p className="p-8 text-center text-sm text-slate-500">Aucun agent configuré.</p>}
    </div>

    {selected && <section className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-100 text-blue-800"><Activity className="h-6 w-6" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-black text-slate-950">{selected.name}</h2><Badge good={selected.enabled}>{selected.enabled ? "Actif" : "En pause"}</Badge></div><p className="mt-0.5 text-sm text-slate-600">{selected.mission}</p>{selected.id === "sql-supabase-analyst" && <p className={`mt-1 text-xs font-semibold ${supabaseStatsConfigured ? "text-emerald-700" : "text-amber-700"}`}>Statistiques de requêtes Supabase · {supabaseStatsConfigured ? "Connexion dédiée configurée · accès à valider" : "Configuration requise"}</p>}</div></div>
        <div className="flex flex-wrap items-center gap-2"><label className="sr-only" htmlFor="analysis-period">Période d’analyse</label><select id="analysis-period" value={analysisPeriod} onChange={(event) => setAnalysisPeriod(event.target.value as "24h" | "7d")} className="min-h-10 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700"><option value="24h">24 dernières heures</option><option value="7d">7 derniers jours</option></select><button disabled={pending || !selected.enabled || !["diveplan-observability", "sql-supabase-analyst"].includes(selected.id) || !selected.triggers.onDemand.enabled} onClick={runNow} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-3.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"><Play className="h-4 w-4" />Exécuter maintenant</button><button disabled={pending} onClick={() => act(() => updateAgentEnabled(selected.id, !selected.enabled), () => setAgents((items) => items.map((agent) => agent.id === selected.id ? { ...agent, enabled: !agent.enabled } : agent)))} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"><ToggleLeft className="h-4 w-4" />{selected.enabled ? "Mettre en pause" : "Activer"}</button></div>
      </div>
      <div className="grid gap-5 p-4 sm:p-5 xl:grid-cols-[1.05fr_.95fr]">
        <div className="space-y-5">
          <div><h3 className="mb-2 text-sm font-black text-slate-900">Description</h3><p className="text-sm leading-6 text-slate-600">{selected.id === "diveplan-observability" ? "Analyse les métriques de performance, les volumes de transfert et les événements applicatifs DivePlan. Chaque rapport sépare les faits mesurés, les hypothèses et les recommandations prioritaires. Les analyses utilisent les seules sources effectivement présentes en base." : selected.id === "sql-supabase-analyst" ? "Repère dans le SQL et les accès PostgreSQL les transferts évitables, lectures répétées et pistes d’index. Les mesures viennent uniquement de la télémétrie interne disponible; les statistiques Supabase détaillées restent à connecter." : selected.mission}</p>{!["diveplan-observability", "sql-supabase-analyst"].includes(selected.id) && <p className="mt-2 text-xs font-semibold text-amber-700">Configuration requise · aucun connecteur ou traitement d’exécution n’est associé à cet agent.</p>}</div>
          <div><h3 className="mb-2 text-sm font-black text-slate-900">Accès et permissions</h3><div className="flex flex-wrap gap-2">{(selected.id === "sql-supabase-analyst" ? [[Code2,"Code SQL déployé"],[Database,"Télémétrie DB en lecture seule"],[FileText,"Schéma et migrations"]] : [[Code2,"Code (non connecté)"],[Activity,"Web Vitals"],[Database,"Télémétrie DB"],[FileText,"Événements"]]).map(([Icon,label]) => { const I=Icon as typeof Activity; return <span key={label as string} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700"><I className="h-3.5 w-3.5"/>{label as string}</span>; })}</div><p className="mt-2 text-xs leading-5 text-slate-500">{selected.id === "sql-supabase-analyst" ? `Scan statique sans exécuter le SQL du dépôt. Les lectures DB utilisent des transactions READ ONLY; aucun secret n’est transmis au navigateur. ${supabaseStatsConfigured ? "La connexion de statistiques Supabase sera vérifiée lors du prochain rapport." : "Statistiques Supabase: définir SUPABASE_READONLY_DATABASE_URL avec un rôle de lecture seule."}` : "Lecture seule. Aucun accès au code source, à Git ou aux secrets n’est configuré pour l’analyse."}</p></div>
          <div><h3 className="mb-2 text-sm font-black text-slate-900">Déclencheurs</h3><div className="space-y-2">{([
            ["onDemand","À la demande","File PostgreSQL + worker cron", true], ["schedule","Horaire planifié","Configuration conservée · ordonnanceur par agent non connecté",false], ["afterDeploy","Après un déploiement","Configuration conservée · webhook non connecté",false], ["incident","Lors d’un incident","Configuration conservée · source d’incidents non connectée",false]
          ] as const).map(([key,label,detail,available]) => { const config = selected.triggers ?? defaultTriggers; const value=config[key]; return <div key={key} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2.5"><div><p className="text-sm font-semibold text-slate-800">{label}</p><p className="text-xs text-slate-500">{detail}{key === "schedule" ? ` · ${config.schedule.cron}` : ""}</p></div><button disabled={pending || !available || !selected.enabled} aria-label={`${value.enabled ? "Désactiver" : "Activer"} ${label}`} title={available ? undefined : "Configuration requise"} onClick={() => saveTriggers({ ...config, [key]: { ...value, enabled: !value.enabled } })} className={`rounded-lg p-1 ${available ? "text-blue-700" : "cursor-not-allowed text-slate-300"}`}>{value.enabled ? <ToggleRight className="h-7 w-7"/> : <ToggleLeft className="h-7 w-7"/>}</button></div>; })}</div><p className="mt-2 text-xs text-amber-700">Les trois automatismes externes sont inactifs et ne peuvent pas être activés tant que leurs producteurs ne sont pas connectés.</p></div>
          <div><h3 className="mb-2 text-sm font-black text-slate-900">Garde-fous</h3><div className="flex items-start gap-2 rounded-xl border border-slate-100 p-3"><Shield className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700"/><p className="text-sm text-slate-600">Aucune commande arbitraire. Aucun accès d’écriture au dépôt. Aucune fusion ni mise en production automatique.</p></div></div>
        </div>
        <div><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-black text-slate-900">Historique des exécutions</h3><span className="text-xs text-slate-500">{selectedRuns.length} récente(s)</span></div><div className="space-y-3">{selectedRuns.slice(0,10).map((run) => <RunCard key={run.id} run={run} busy={pending} onCancel={() => act(() => cancelQueuedAgentRun(run.id), () => setRuns((current) => current.map((item) => item.id === run.id ? { ...item, status: "cancelled", error: "Annulée par un administrateur avant le démarrage.", finishedAt: new Date() } : item)))}/>)}</div>{!selectedRuns.length && <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500"><History className="mx-auto mb-2 h-5 w-5"/>Aucune exécution. Les rapports seront conservés ici.</div>}</div>
      </div>
    </section>}
    {pending && <p className="mt-3 flex items-center gap-2 text-xs text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin"/>Enregistrement en cours…</p>}
    {modal && <CreateModal onClose={() => setModal(false)} onCreate={(name,mission) => act(() => createAgent({name,mission}), () => { setModal(false); window.location.reload(); })} />}
  </div>;
}

function RunCard({run,busy,onCancel}:{run:RunRow;busy:boolean;onCancel:()=>void}) { const [open,setOpen]=useState(run.status === "completed"); const report=run.result; return <article className="rounded-xl border border-slate-200 p-3.5">
  <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${run.status === "completed" ? "bg-emerald-500" : run.status === "failed" ? "bg-rose-500" : run.status === "cancelled" ? "bg-slate-400" : "bg-blue-500"}`}/><p className="text-sm font-bold text-slate-900">{run.status === "completed" ? "Terminée" : run.status === "failed" ? "Échouée" : run.status === "cancelled" ? "Annulée" : run.status === "running" ? "En cours" : "En attente"}</p><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{triggerNames[run.trigger] ?? run.trigger}</span></div><div className="flex items-center gap-2"><time className="text-xs text-slate-500">{dateLabel(run.startedAt ?? run.createdAt)}</time>{run.status === "pending" && <button disabled={busy} onClick={onCancel} className="min-h-8 rounded-lg border border-rose-200 px-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Retirer de la file</button>}</div></div>
  {run.finishedAt && <p className="mt-1 text-xs text-slate-500">Fin : {dateLabel(run.finishedAt)}</p>}
  <p className="mt-1 text-xs text-slate-500">Période demandée : {run.analysisPeriod === "24h" ? "24 dernières heures" : "7 derniers jours"}</p>
  {run.error && <p className="mt-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-800">{run.error}</p>}
  {report && <><p className="mt-2 text-xs text-slate-600">Période analysée : {report.period.label} · {report.facts.length} fait(s) · {report.findings?.length ?? report.recommendations.length} constat(s)</p><button onClick={()=>setOpen(!open)} className="mt-2 text-xs font-bold text-blue-700">{open?"Masquer le rapport":"Consulter le rapport"}</button>{open && <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
    <div><p className="text-xs font-black uppercase tracking-wide text-slate-500">Sources consultées</p>{report.sources.map(s=><p key={s.name} className="mt-1 text-xs text-slate-700">{s.name} · {s.samples} groupe(s) · {s.period}</p>)}</div>
    <div><p className="text-xs font-black uppercase tracking-wide text-slate-500">Faits mesurés</p>{report.facts.length?report.facts.map((f,i)=><p key={i} className="mt-1 text-xs leading-5 text-slate-700"><b>{f.category} :</b> {f.fact} <span className="text-slate-400">({f.evidence})</span></p>):<p className="mt-1 text-xs text-slate-500">Aucun fait disponible dans la période.</p>}</div>
    {report.findings && <div><p className="text-xs font-black uppercase tracking-wide text-slate-500">Constats classés</p><div className="mt-2 space-y-2">{report.findings.map((finding,i)=><article key={`${finding.location}-${i}`} className="rounded-lg border border-slate-200 p-3"><div className="flex flex-wrap items-center gap-2"><b className="text-xs text-slate-900">{finding.title}</b><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${finding.priority === "high" ? "bg-rose-50 text-rose-800" : finding.priority === "medium" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{finding.priority === "high" ? "Priorité haute" : finding.priority === "medium" ? "Priorité moyenne" : "Priorité basse"}</span><span className="text-[10px] font-semibold text-slate-500">{finding.kind === "observed" ? "Mesure observée" : finding.kind === "code" ? "Constat de code" : "Hypothèse"} · effort {finding.effort}</span></div><p className="mt-1 text-xs leading-5 text-slate-700">Impact probable : {finding.impact}</p><p className="mt-1 text-xs text-slate-500">{finding.location} · preuve : {finding.evidence}</p><p className="mt-1 text-xs text-slate-500">Limite : {finding.limits}</p><p className="mt-1 text-xs leading-5 text-blue-800">Recommandation : {finding.recommendation}</p></article>)}</div></div>}
    <div><p className="text-xs font-black uppercase tracking-wide text-slate-500">Hypothèses et limites</p>{report.assumptions.map((a,i)=><p key={i} className="mt-1 text-xs leading-5 text-slate-600">{a}</p>)}</div>
    <div><p className="text-xs font-black uppercase tracking-wide text-slate-500">Recommandations</p>{report.recommendations.map((r,i)=><p key={i} className="mt-1 text-xs leading-5 text-slate-700">{i+1}. {r}</p>)}</div>
    <div><p className="text-xs font-black uppercase tracking-wide text-amber-700">Configuration ou données manquantes</p>{report.missing.map((m,i)=><p key={i} className="mt-1 text-xs leading-5 text-amber-800">{m}</p>)}</div>
  </div>}</>}
</article>; }

function CreateModal({onClose,onCreate}:{onClose:()=>void;onCreate:(name:string,mission:string)=>void}) { const [name,setName]=useState("");const [mission,setMission]=useState(""); return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4" role="presentation"><div role="dialog" aria-modal="true" aria-labelledby="create-agent-title" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 id="create-agent-title" className="text-lg font-black">Créer un agent</h2><button onClick={onClose} aria-label="Fermer" className="rounded-lg p-2 hover:bg-slate-100"><X className="h-4 w-4"/></button></div><p className="mt-1 text-sm text-slate-500">Un nouvel agent démarre avec des déclencheurs automatiques désactivés.</p><label className="mt-5 block text-sm font-bold">Nom<input value={name} onChange={e=>setName(e.target.value)} maxLength={100} className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"/></label><label className="mt-4 block text-sm font-bold">Mission<textarea value={mission} onChange={e=>setMission(e.target.value)} maxLength={1200} rows={4} className="mt-1.5 w-full rounded-lg border border-slate-300 p-3 text-sm"/></label><div className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-semibold">Annuler</button><button disabled={name.trim().length<3||mission.trim().length<20} onClick={()=>onCreate(name,mission)} className="min-h-10 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-40">Créer l’agent</button></div></div></div>; }

function Stat({icon:Icon,label,value,tone}:{icon:typeof Bot;label:string;value:number;tone:"blue"|"sky"|"amber"}) { const colors={blue:"bg-blue-50 text-blue-700",sky:"bg-sky-50 text-sky-700",amber:"bg-amber-50 text-amber-700"}; return <div className="flex min-h-[84px] items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><span className={`grid h-11 w-11 place-items-center rounded-full ${colors[tone]}`}><Icon className="h-5 w-5"/></span><div><p className="text-2xl font-black leading-7 text-slate-950">{value}</p><p className="text-xs font-medium text-slate-600">{label}</p></div><ArrowRight className="ml-auto h-4 w-4 text-slate-400"/></div>; }
function Badge({good,children}:{good:boolean;children:React.ReactNode}) { return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${good?"bg-emerald-50 text-emerald-800":"bg-amber-50 text-amber-800"}`}><span className={`h-1.5 w-1.5 rounded-full ${good?"bg-emerald-600":"bg-amber-600"}`}/>{children}</span>; }
function dateLabel(value:Date|string) { return new Intl.DateTimeFormat("fr-CA",{dateStyle:"medium",timeStyle:"short",timeZone:"America/Toronto"}).format(new Date(value)); }
