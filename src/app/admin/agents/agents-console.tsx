"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Activity, AlertTriangle, ArrowRight, BarChart3, Bot, CheckCircle2, ChevronDown, ChevronUp, Code2, Database, FileText, History, Info, LoaderCircle, Play, Settings2, Shield, ToggleLeft, ToggleRight, X } from "lucide-react";
import { cancelQueuedAgentRun, enqueueAgentRun, moveAgent as saveAgentOrder, releaseStuckLocalAgentRun, startAgentWorkflow, updateAgentEnabled, updateAgentName, updateAgentTriggers } from "./actions";

type TriggerConfig = { onDemand: { enabled: boolean }; schedule: { enabled: boolean; cron: string }; afterDeploy: { enabled: boolean }; incident: { enabled: boolean } };
export type AgentRow = { id: string; name: string; mission: string; enabled: boolean; triggers: TriggerConfig; sortOrder: number; createdAt: Date | string; updatedAt: Date | string };
export type RunRow = { id: string; agentId: string; trigger: string; status: string; analysisPeriod: "24h" | "7d"; startedAt: Date | string | null; finishedAt: Date | string | null; result: Report | null; error: string | null; createdAt: Date | string; workflowId: string | null; sequence: number; workflowCount?: number };
type Report = { title: string; period: { label: string; from: string; to: string }; analyzedAt?: string; analyzedCommit?: string; summary?: string; changes?: string; reportPath?: string; markdown?: string; diagrams?: Array<{ title: string; mermaid: string; references?: string }>; sources: Array<{ name: string; period: string; samples: number }>; facts: Array<{ category: string; fact: string; evidence: string }>; findings?: Array<{ kind: string; priority: string; impact: string; effort: string; title: string; location: string; evidence: string; limits: string; recommendation: string }>; assumptions: string[]; recommendations: string[]; missing: string[] };

const defaultTriggers: TriggerConfig = { onDemand: { enabled: true }, schedule: { enabled: false, cron: "0 9 * * 1" }, afterDeploy: { enabled: false }, incident: { enabled: false } };
const triggerNames: Record<string, string> = { on_demand: "À la demande", schedule: "Horaire", after_deploy: "Après déploiement", incident: "Incident" };

export function AgentsConsole({ agents: initialAgents, runs: initialRuns }: { agents: AgentRow[]; runs: RunRow[] }) {
  const router = useRouter();
  const [agents, setAgents] = useState(initialAgents);
  const [runs, setRuns] = useState(initialRuns);
  const [previousInitialRuns, setPreviousInitialRuns] = useState(initialRuns);
  const [selectedId, setSelectedId] = useState("");
  const [detailTab, setDetailTab] = useState<"summary" | "history" | "configuration">("summary");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [analysisPeriod, setAnalysisPeriod] = useState<"24h" | "7d">("7d");
  const [error, setError] = useState("");
  const [workflowMessage, setWorkflowMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const selected = agents.find((agent) => agent.id === selectedId);
  const activeCount = agents.filter((agent) => agent.enabled).length;
  const runningCount = runs.filter((run) => run.status === "running" || run.status === "pending").length;
  const reviewCount = runs.filter((run) => run.status === "completed" && ((run.result?.findings?.length ?? 0) > 0 || (run.result?.recommendations.length ?? 0) > 0)).length;
  const selectedRuns = useMemo(() => runs.filter((run) => run.agentId === selected?.id), [runs, selected?.id]);
  const runningLocalRun = selectedRuns.find((run) => run.status === "running" && ["nextjs-code-analyst", "sql-supabase-analyst", "diveplan-observability"].includes(run.agentId));
  const latestReportRun = selectedRuns.find((run) => run.status === "completed" && run.result);
  const latestReport = latestReportRun?.result;

  if (initialRuns !== previousInitialRuns) {
    setPreviousInitialRuns(initialRuns);
    setRuns(initialRuns);
  }

  useEffect(() => {
    if (!["nextjs-code-analyst", "sql-supabase-analyst", "diveplan-observability"].includes(selected?.id ?? "") || !selectedRuns.some((run) => run.status === "pending" || run.status === "running")) return;
    const timer = window.setInterval(() => router.refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [router, selected?.id, selectedRuns]);

  function act(action: () => Promise<unknown>, success?: (value: unknown) => void) {
    setError("");
    startTransition(async () => { try { const value = await action(); success?.(value); } catch (e) { setError(e instanceof Error ? e.message : "Une erreur est survenue."); } });
  }
  function runNow() {
    if (!selected) return;
    act(() => enqueueAgentRun(selected.id, analysisPeriod), (value) => {
      const run = value as RunRow;
      setRuns((current) => [run, ...current.filter((item) => item.id !== run.id)]);
      if (["nextjs-code-analyst", "sql-supabase-analyst", "diveplan-observability"].includes(selected.id)) setWorkflowMessage("Analyse mise en file. Le runner Codex local doit être démarré pour la prendre en charge.");
    });
  }
  function releaseLocalRun(run: RunRow) {
    act(() => releaseStuckLocalAgentRun(run.id), () => {
      setRuns((current) => current.map((item) => item.id === run.id ? { ...item, status: "failed", error: "Débloquée par un administrateur; le runner local n’a pas terminé la mise à jour.", finishedAt: new Date() } : item));
      setWorkflowMessage("Exécution débloquée. Vous pouvez remettre une analyse en file si le runner Codex est arrêté.");
    });
  }
  function saveTriggers(next: TriggerConfig) {
    if (!selected) return;
    act(() => updateAgentTriggers(selected.id, next), () => setAgents((current) => current.map((agent) => agent.id === selected.id ? { ...agent, triggers: next } : agent)));
  }

  function saveName(name: string) {
    if (!selected) return;
    act(() => updateAgentName(selected.id, name), (value) => {
      const updatedName = value as string;
      setAgents((current) => current.map((agent) => agent.id === selected.id ? { ...agent, name: updatedName } : agent));
      setSettingsOpen(false);
    });
  }

  function moveAgent(agentId: string, direction: "up" | "down") {
    const index = agents.findIndex((agent) => agent.id === agentId);
    const nextIndex = index + (direction === "up" ? -1 : 1);
    if (index < 0 || nextIndex < 0 || nextIndex >= agents.length) return;
    act(() => saveAgentOrder(agentId, direction), () => setAgents((current) => {
      const reordered = [...current];
      [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
      return reordered.map((agent, sortOrder) => ({ ...agent, sortOrder }));
    }));
  }

  function startWorkflow() {
    setWorkflowMessage("");
    act(() => startAgentWorkflow(analysisPeriod), (value) => {
      const result = value as { runs: RunRow[]; skipped: string[] };
      setRuns((current) => [...result.runs, ...current]);
      setWorkflowMessage(`Workflow mis en file : ${result.runs.length} agent(s), dans l’ordre de la liste. Le traitement commence au prochain passage du worker.${result.skipped.length ? ` Agents déjà occupés et ignorés : ${result.skipped.join(", ")}.` : ""}`);
    });
  }

  return <div className="mx-auto max-w-[1500px]">
    <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div><p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Administration › Automatisation</p><h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Agents IA</h1><p className="mt-1 text-sm text-slate-600">Configurez et surveillez les agents qui analysent DivePlan.</p><a href="/admin/agents/context" className="mt-2 inline-flex text-sm font-bold text-blue-700 hover:underline">Consulter le guide général et les fiches de contexte</a><a href="/admin/agents/consolidation" className="ml-4 mt-2 inline-flex text-sm font-bold text-blue-700 hover:underline">Ouvrir l’espace de consolidation des PR →</a></div>
      <button disabled={pending} onClick={startWorkflow} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><Play className="h-4 w-4" />Start workflow</button>
    </header>
    <section aria-label="Indicateurs des agents" className="grid gap-3 md:grid-cols-3">
      <Stat icon={Bot} label="agents actifs" value={activeCount} tone="blue" />
      <Stat icon={Play} label="exécutions en cours" value={runningCount} tone="sky" />
      <Stat icon={AlertTriangle} label="résultats à examiner" value={reviewCount} tone="amber" />
    </section>
    {error && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-800">{error}</p>}
    {workflowMessage && <p role="status" className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-medium text-blue-900">{workflowMessage}</p>}

    <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="hidden grid-cols-[1.15fr_2fr_.65fr_1fr_1fr_.55fr] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500 lg:grid"><span>Agent</span><span>Mission</span><span>État</span><span>Dernière exécution</span><span>Résultat</span><span>Actions</span></div>
      {agents.map((agent) => {
        const last = runs.find((run) => run.agentId === agent.id);
        const chosen = selected?.id === agent.id;
        return <div key={agent.id} className={`grid grid-cols-[minmax(0,1fr)_auto] border-b border-slate-100 px-4 py-3 last:border-0 lg:grid-cols-[1.15fr_2fr_.65fr_1fr_1fr_.55fr] lg:gap-4 lg:px-5 ${chosen ? "bg-blue-50" : ""}`}>
          <button onClick={() => { setSelectedId((current) => current === agent.id ? "" : agent.id); setDetailTab("summary"); }} aria-expanded={chosen} aria-controls="agent-detail" className="col-start-1 row-start-1 grid min-w-0 grid-cols-1 gap-2 text-left transition hover:bg-blue-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:grid-cols-[1fr_auto] lg:col-span-5 lg:grid-cols-[1.15fr_2fr_.65fr_1fr_1fr] lg:items-center lg:gap-4">
          <span className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-100 text-blue-800"><Activity className="h-[18px] w-[18px]" /></span><span className="truncate text-sm font-bold text-slate-900">{agent.name}</span></span>
          <span className="line-clamp-2 text-sm text-slate-600">{agent.mission}</span>
          <span><Badge good={agent.enabled}>{agent.enabled ? "Actif" : "En pause"}</Badge></span>
          <span className="text-xs text-slate-600">{last?.startedAt ? dateLabel(last.startedAt) : "Aucune exécution"}</span>
          <span className={`text-sm ${last?.status === "failed" ? "text-rose-700" : "text-sky-700"}`}>{last ? last.status === "completed" ? `${last.result?.findings?.length ?? last.result?.recommendations.length ?? 0} recommandation(s)` : last.status === "failed" ? "Échec · voir détail" : "Exécution en attente" : "Pas encore de résultat"}</span>
          </button>
          <div className="col-start-2 row-start-1 flex items-center gap-1 lg:col-start-6 lg:justify-end" aria-label={`Ordre de ${agent.name}`}>
            <button type="button" disabled={pending || agents.findIndex((item) => item.id === agent.id) === 0} onClick={() => moveAgent(agent.id, "up")} aria-label={`Monter ${agent.name}`} title="Monter" className="grid h-8 w-8 place-items-center rounded-md text-slate-600 hover:bg-white disabled:cursor-not-allowed disabled:opacity-30"><ChevronUp className="h-4 w-4"/></button>
            <button type="button" disabled={pending || agents.findIndex((item) => item.id === agent.id) === agents.length - 1} onClick={() => moveAgent(agent.id, "down")} aria-label={`Descendre ${agent.name}`} title="Descendre" className="grid h-8 w-8 place-items-center rounded-md text-slate-600 hover:bg-white disabled:cursor-not-allowed disabled:opacity-30"><ChevronDown className="h-4 w-4"/></button>
          </div>
        </div>;
      })}
      {!agents.length && <p className="p-8 text-center text-sm text-slate-500">Aucun agent configuré.</p>}
    </div>

    {selected && <section id="agent-detail" className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4 sm:px-5 sm:pt-4">
        <div className="flex min-w-0 items-start gap-3"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-blue-100 text-blue-700"><Activity className="h-6 w-6" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-black text-slate-950">{selected.name}</h2><Badge good={selected.enabled}>{selected.enabled ? "Actif" : "En pause"}</Badge></div><p className="mt-0.5 max-w-4xl text-sm leading-5 text-slate-600">{selected.mission}</p>{["sql-supabase-analyst", "nextjs-code-analyst", "diveplan-observability"].includes(selected.id) && <p className="mt-1 text-xs font-semibold text-blue-700">Analyse Codex locale · runner requis</p>}</div></div>
        <div className="flex flex-wrap items-center gap-2">{["pr-consolidation", "pr-correction"].includes(selected.id) ? <a href="/admin/agents/consolidation" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700">{selected.id === "pr-correction" ? "Ouvrir les propositions" : "Ouvrir la revue des propositions"}</a> : <>{!["architecture-cartographer", "nextjs-code-analyst", "sql-supabase-analyst"].includes(selected.id) && <><label className="sr-only" htmlFor="analysis-period">Période d’analyse</label><select id="analysis-period" value={analysisPeriod} onChange={(event) => setAnalysisPeriod(event.target.value as "24h" | "7d")} className="min-h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-600"><option value="24h">24 h</option><option value="7d">7 jours</option></select></>}<button disabled={pending || !selected.enabled || !["diveplan-observability", "sql-supabase-analyst", "architecture-cartographer", "nextjs-code-analyst"].includes(selected.id) || !selected.triggers.onDemand.enabled} onClick={runNow} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"><Play className="h-4 w-4" />{selected.id === "architecture-cartographer" ? "Lancer la cartographie" : ["nextjs-code-analyst", "sql-supabase-analyst", "diveplan-observability"].includes(selected.id) ? "Démarrer l’analyse Codex" : "Exécuter maintenant"}</button></>}{["nextjs-code-analyst", "sql-supabase-analyst", "diveplan-observability"].includes(selected.id) && <p className="basis-full text-xs text-slate-500">Le bouton met la demande en file; Codex la traite sur l’ordinateur où le runner local est actif.</p>}<button aria-label="Configuration de l’agent" onClick={() => setSettingsOpen(true)} className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"><Settings2 className="h-4 w-4"/></button><button disabled={pending} onClick={() => act(() => updateAgentEnabled(selected.id, !selected.enabled), () => setAgents((items) => items.map((agent) => agent.id === selected.id ? { ...agent, enabled: !agent.enabled } : agent)))} aria-label={selected.enabled ? "Mettre en pause" : "Activer"} className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"><ToggleLeft className="h-4 w-4"/></button></div>
      </div>
      {runningLocalRun && <div role="status" className="mx-4 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 sm:mx-5"><p className="text-sm text-amber-950">Analyse marquee en cours. Utilisez ce bouton seulement si Codex a termine ou si le runner est arrete.</p><button disabled={pending} onClick={() => releaseLocalRun(runningLocalRun)} className="min-h-9 rounded-lg border border-amber-400 bg-white px-3 text-sm font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50">Debloquer execution</button></div>}
      <nav aria-label="Détails de l’agent" className="flex border-b border-slate-200 px-4 sm:px-5">{([["summary","Résumé"],["history","Historique"],["configuration","Configuration"]] as const).map(([key,label])=><button key={key} onClick={()=>{setDetailTab(key);if(key==="configuration")setSettingsOpen(true);}} className={`min-h-10 border-b-2 px-3 text-xs font-bold ${detailTab===key?"border-blue-600 text-blue-700":"border-transparent text-slate-500 hover:text-slate-800"}`}>{label}</button>)}</nav>
      {detailTab === "summary" ? <div className="space-y-1 p-3 sm:p-4">
        <div className="rounded-xl border border-slate-200 p-3 sm:p-3.5"><div className="flex flex-wrap items-center gap-x-4 gap-y-1"><h3 className="text-sm font-black text-slate-900">Dernière exécution</h3>{latestReportRun ? <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4"/>Exécution terminée</span> : <span className="text-xs font-semibold text-slate-500">Aucun rapport terminé</span>}</div><p className="mt-1 text-xs text-slate-600">{latestReportRun?.finishedAt ? dateLabel(latestReportRun.finishedAt) : latestReportRun?.startedAt ? dateLabel(latestReportRun.startedAt) : "Lancez une analyse pour afficher ses résultats."}{latestReport && <>　|　Période analysée : {latestReport.period.label}　|　{latestReport.findings?.length ?? latestReport.recommendations.length} recommandations</>}</p>
          {latestReport?.reportPath && <p className="mt-2 text-xs text-slate-600">Rapport complet local : <code>{latestReport.reportPath}</code></p>}
          {latestReport ? <div className="mt-3 space-y-2">{(latestReport.findings?.length ? latestReport.findings : latestReport.recommendations.map((recommendation) => ({kind:"recommendation",priority:"low",impact:"À estimer",effort:"inconnu",title:recommendation,location:"Rapport d’analyse",evidence:"Recommandation de l’agent",limits:"Impact à confirmer",recommendation}))).slice(0,6).map((finding,index)=><FindingCard key={`${finding.location}-${index}`} finding={finding} index={index}/>)}</div> : <div className="mt-3 rounded-lg border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">Le dernier rapport de cet agent apparaîtra ici après son exécution.</div>}
        </div>
        {latestReport && <>{latestReport.analyzedCommit && <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-950"><b>Commit :</b> {latestReport.analyzedCommit} · <b>Analyse :</b> {latestReport.analyzedAt ? dateLabel(latestReport.analyzedAt) : "date inconnue"}<p className="mt-1">{latestReport.summary} {latestReport.changes}</p></div>}{latestReport.diagrams?.map((diagram) => <ReportAccordion key={diagram.title} icon={FileText} title={`Diagramme · ${diagram.title}`}><p className="text-xs text-slate-500">Références : {diagram.references ?? "voir les sources listées"}</p><pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{diagram.mermaid}</pre></ReportAccordion>)}<ReportAccordion icon={BarChart3} title="Métriques et faits observés">{latestReport.facts.length ? <div className="space-y-2">{latestReport.facts.map((fact,index)=><p key={index} className="text-sm text-slate-700"><b>{fact.category} :</b> {fact.fact}<span className="block text-xs text-slate-500">{fact.evidence}</span></p>)}</div> : <p className="text-sm text-slate-500">Aucune métrique dans ce rapport.</p>}</ReportAccordion><ReportAccordion icon={Database} title="Sources consultées">{latestReport.sources.map((source)=><p key={source.name} className="text-sm text-slate-700">{source.name} · {source.samples} échantillon(s) · {source.period}</p>)}</ReportAccordion><ReportAccordion icon={Info} title="Limites de l’analyse">{[...latestReport.assumptions,...latestReport.missing].map((item,index)=><p key={index} className="text-sm text-slate-700">{item}</p>)}</ReportAccordion></>}
      </div> : detailTab === "history" ? <div className="space-y-3 p-4 sm:p-5">{selectedRuns.slice(0,10).map((run) => <RunCard key={run.id} run={run} busy={pending} onCancel={() => act(() => cancelQueuedAgentRun(run.id), () => setRuns((current) => current.map((item) => item.id === run.id ? { ...item, status: "cancelled", error: "Annulée par un administrateur avant le démarrage.", finishedAt: new Date() } : item)))}/>) }{!selectedRuns.length && <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500"><History className="mx-auto mb-2 h-5 w-5"/>Aucune exécution. Les rapports seront conservés ici.</div>}</div> : <div className="p-4 text-sm text-slate-600">Les déclencheurs et permissions sont disponibles dans la fenêtre de configuration.<button onClick={()=>setSettingsOpen(true)} className="ml-2 font-bold text-blue-700">Ouvrir la configuration</button></div>}
    </section>}
    {settingsOpen && selected && <AgentSettingsModal agent={selected} busy={pending} onClose={() => setSettingsOpen(false)} onSave={saveTriggers} onRename={saveName}/>}
    {pending && <p className="mt-3 flex items-center gap-2 text-xs text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin"/>Enregistrement en cours…</p>}
  </div>;
}

function FindingCard({finding,index}:{finding:NonNullable<Report["findings"]>[number];index:number}) {
  const [open,setOpen] = useState(false);
  const high = finding.priority === "high";
  const medium = finding.priority === "medium";
  const colors = high ? "border-amber-400 bg-amber-50/70" : "border-slate-200 bg-white";
  const iconColor = high ? "bg-amber-100 text-amber-700" : medium ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600";
  return <article data-index={index} className={`grid gap-3 rounded-lg border p-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(175px,.43fr)_160px] sm:items-center sm:p-2.5 ${colors}`}>
    <div className="flex min-w-0 items-start gap-3"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${iconColor}`}>{high?<AlertTriangle className="h-5 w-5"/>:<Info className="h-5 w-5"/>}</span><div className="min-w-0"><span className={`mb-0.5 inline-block text-[10px] font-bold uppercase ${high?"text-amber-700":medium?"text-blue-700":"text-slate-500"}`}>Priorité {high?"haute":medium?"moyenne":"basse"}</span><h4 className="text-[13px] font-extrabold leading-5 text-slate-900">{finding.title}</h4><p className="text-xs leading-4 text-slate-600">{finding.evidence}</p></div></div>
    <div className="border-l border-slate-200 pl-3 text-xs text-slate-700 sm:py-1"><p className="mb-1 flex items-center gap-2 font-semibold"><BarChart3 className="h-4 w-4"/>Impact estimé</p><p>{finding.impact}</p><p className="mt-1 text-slate-500">Effort : {finding.effort}</p></div>
    <button aria-expanded={open} onClick={()=>setOpen(!open)} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-blue-300 bg-white px-3 text-xs font-bold text-blue-700 hover:bg-blue-50"><FileText className="h-4 w-4"/>{open?"Masquer les détails":"Voir les détails"}</button>
    {open&&<div className="sm:col-span-3 sm:pl-[52px]"><p className="text-xs leading-5 text-slate-700"><b>Emplacement :</b> {finding.location} · <b>Limite :</b> {finding.limits}</p><p className="mt-1 text-xs leading-5 text-slate-700"><b>Recommandation :</b> {finding.recommendation}</p></div>}
  </article>;
}

function ReportAccordion({icon:Icon,title,children}:{icon:typeof Activity;title:string;children:React.ReactNode}) { const [open,setOpen]=useState(false); return <section className="overflow-hidden rounded-lg border border-slate-200"><button aria-expanded={open} onClick={()=>setOpen(!open)} className="flex min-h-10 w-full items-center gap-3 px-3 text-left text-sm font-bold text-slate-900 hover:bg-slate-50"><Icon className="h-4 w-4 text-slate-600"/>{title}<ChevronDown className={`ml-auto h-4 w-4 text-slate-600 transition-transform ${open?"rotate-180":""}`}/></button>{open&&<div className="space-y-2 border-t border-slate-100 px-3 py-3">{children}</div>}</section>; }

function AgentSettingsModal({agent,busy,onClose,onSave,onRename}:{agent:AgentRow;busy:boolean;onClose:()=>void;onSave:(next:TriggerConfig)=>void;onRename:(name:string)=>void}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [name,setName] = useState(agent.name);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    closeRef.current?.focus();
    return () => { if (dialog.open) dialog.close(); };
  }, []);
  const isSqlAgent = agent.id === "sql-supabase-analyst";
  const description = agent.id === "nextjs-code-analyst"
    ? "Utilise Codex sur l’ordinateur du runner pour lire le code Next.js, examiner les coûts d’exécution probables, les fichiers possiblement inutilisés, les duplications et la lisibilité. Exclut SQL. Le rapport complet reste local."
    : isSqlAgent
      ? "Utilise Codex sur l’ordinateur du runner pour analyser statiquement le SQL du dépôt, les accès PostgreSQL/Supabase et les migrations afin de repérer les lectures répétées, transferts excessifs et pistes d’index. N’accède pas à la base en direct; les rapports de code restent locaux; le rapport Observabilite est enregistre dans DivePlan."
    : agent.id === "diveplan-observability"
    ? "Codex analyse les agrégats de performance, les volumes de transfert et les événements applicatifs DivePlan. Les faits, hypothèses, recommandations et sources manquantes sont enregistrés dans le rapport d’exécution."
    : isSqlAgent
      ? "Repère dans le SQL et les accès PostgreSQL les transferts évitables, lectures répétées et pistes d’index. Les mesures viennent uniquement de la télémétrie interne disponible; les statistiques Supabase détaillées restent à connecter."
      : agent.id === "architecture-cartographer"
        ? "Cartographie les routes, parcours, données, permissions et dépendances en lecture seule; conserve chaque rapport dans l’historique."
      : agent.id === "pr-consolidation"
        ? "Examine les recommandations des rapports terminés, regroupe les constats au même titre même s’ils viennent de différents emplacements, conserve les preuves et prépare des propositions soumises à décision humaine."
      : agent.id === "pr-correction"
        ? "Après le lancement manuel d’une proposition approuvée, un script local transmet son périmètre à Codex connecté à ChatGPT, applique un correctif, exécute les validations et ouvre une PR en brouillon si tout réussit."
      : agent.mission;
  return <dialog ref={dialogRef} aria-labelledby="agent-settings-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/55">
    <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur-sm sm:px-6">
      <div><h2 id="agent-settings-title" className="text-lg font-black">Configuration de l’agent</h2><p className="mt-0.5 text-sm text-slate-600">{agent.name}</p></div>
      <button ref={closeRef} onClick={onClose} aria-label="Fermer la configuration" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"><X className="h-4 w-4"/></button>
    </div>
    <div className="space-y-6 p-5 sm:p-6">
      <section><label htmlFor="agent-name" className="mb-2 block text-sm font-black text-slate-900">Nom de l’agent</label><div className="flex flex-wrap gap-2"><input id="agent-name" value={name} onChange={(event)=>setName(event.target.value)} maxLength={100} className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm"/><button disabled={busy || name.trim().length<2 || name.trim()===agent.name} onClick={()=>onRename(name)} className="min-h-10 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-40">Enregistrer le nom</button></div><p className="mt-1 text-xs text-slate-500">2 à 100 caractères.</p></section>
      <section><h3 className="mb-2 text-sm font-black text-slate-900">Description</h3><p className="text-sm leading-6 text-slate-600">{description}</p>{!["diveplan-observability", "sql-supabase-analyst", "architecture-cartographer", "pr-consolidation", "pr-correction", "nextjs-code-analyst"].includes(agent.id) && <p className="mt-2 text-xs font-semibold text-amber-700">Configuration requise · aucun connecteur ou traitement d’exécution n’est associé à cet agent.</p>}{agent.id === "pr-correction" && <p className="mt-2 text-xs font-semibold text-blue-700">Le lancement reste manuel et réservé aux utilisateurs ayant les droits d’écriture du dépôt. Codex reçoit la proposition et le code du dépôt pour produire le correctif.</p>}{["nextjs-code-analyst", "sql-supabase-analyst", "diveplan-observability"].includes(agent.id) && <p className="mt-2 text-xs font-semibold text-blue-700">Le runner local doit être installé sur le poste qui contient le dépôt et la session Codex.</p>}</section>
      {["nextjs-code-analyst", "sql-supabase-analyst", "diveplan-observability"].includes(agent.id) && <section><h3 className="mb-2 text-sm font-black text-slate-900">Installer le runner local</h3><p className="text-xs leading-5 text-slate-600">À faire une fois sur le poste qui contient le dépôt et Codex. Le runner démarre avec ta session Windows; les boutons des agents lui transmettent ensuite les analyses à effectuer.</p><pre className="mt-2 overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-white"><code>pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-nextjs-analysis-runner.ps1</code></pre></section>}
      <section><h3 className="mb-2 text-sm font-black text-slate-900">Accès et permissions</h3><div className="flex flex-wrap gap-2">{(agent.id === "pr-correction" ? [[Code2,"Dépôt · script local"],[FileText,"Proposition approuvée · Codex ChatGPT"],[Activity,"Lint, tests, build et PR brouillon"]] : agent.id === "nextjs-code-analyst" ? [[Code2,"Dépôt local"],[FileText,"Codex · lecture seule"],[Activity,"Rapport conservé localement"]] : isSqlAgent ? [[Code2,"SQL et schéma locaux"],[FileText,"Codex · lecture seule"],[Activity,"Rapport conservé localement"]] : agent.id === "architecture-cartographer" ? [[Code2,"Sources déployées en lecture seule"],[FileText,"Schéma, migrations et configuration"],[Database,"Historique de rapports"]] : agent.id === "pr-consolidation" ? [[Database,"Rapports des agents"],[FileText,"Sources et historique des propositions"]] : [[Code2,"Agrégats anonymisés"],[Activity,"Web Vitals"],[Database,"Télémétrie DB"],[FileText,"Codex · synthèse"]]).map(([Icon,label]) => { const I=Icon as typeof Activity; return <span key={label as string} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700"><I className="h-3.5 w-3.5"/>{label as string}</span>; })}</div><p className="mt-2 text-xs leading-5 text-slate-500">{agent.id === "pr-correction" ? "Codex et GitHub CLI utilisent les sessions locales de l’administrateur. Le script demande le jeton d’exécution DivePlan, puis crée une branche et une PR en brouillon après validations réussies. Aucune clé API OpenAI n’est utilisée." : ["nextjs-code-analyst", "sql-supabase-analyst", "diveplan-observability"].includes(agent.id) ? "Codex analyse les fichiers sur le poste du runner. Seuls des agregats non nominatifs sont envoyes a Codex; le rapport Observabilite est enregistre dans DivePlan et les rapports de code restent locaux. L’agent SQL n’interroge pas la base en direct." : agent.id === "architecture-cartographer" ? "Lecture seule des sources incluses dans le déploiement. Résultats écrits dans AiAgentRun; aucun accès en écriture au dépôt, aux secrets ou aux données métier." : agent.id === "pr-consolidation" ? "Lecture seule des résultats et recommandations des autres agents; accès en écriture limité aux propositions et à leur historique. Aucun accès au dépôt ou à Git." : "Lecture seule. Aucun accès au code source, à Git ou aux secrets n’est configuré pour l’analyse."}</p></section>
      <section><h3 className="mb-2 text-sm font-black text-slate-900">Déclencheurs</h3><div className="space-y-2">{([
        ["onDemand","À la demande",agent.id === "pr-correction" ? "Lancement depuis la proposition approuvée" : ["nextjs-code-analyst", "sql-supabase-analyst", "diveplan-observability"].includes(agent.id) ? "File DivePlan · runner Codex local requis" : "Démarrage immédiat · file PostgreSQL en secours", agent.id !== "pr-correction"], ["schedule","Horaire planifié","Configuration conservée · ordonnanceur par agent non connecté",false], ["afterDeploy","Après un déploiement","Configuration conservée · webhook non connecté",false], ["incident","Lors d’un incident","Configuration conservée · source d’incidents non connecté",false]
      ] as const).map(([key,label,detail,available]) => { const config = agent.triggers ?? defaultTriggers; const value=config[key]; return <div key={key} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2.5"><div><p className="text-sm font-semibold text-slate-800">{label}</p><p className="text-xs text-slate-500">{detail}{key === "schedule" ? ` · ${config.schedule.cron}` : ""}</p></div><button disabled={busy || !available || !agent.enabled} aria-label={`${value.enabled ? "Désactiver" : "Activer"} ${label}`} title={available ? undefined : "Configuration requise"} onClick={() => onSave({ ...config, [key]: { ...value, enabled: !value.enabled } })} className={`rounded-lg p-1 ${available ? "text-blue-700" : "cursor-not-allowed text-slate-300"}`}>{value.enabled ? <ToggleRight className="h-7 w-7"/> : <ToggleLeft className="h-7 w-7"/>}</button></div>; })}</div><p className="mt-2 text-xs text-amber-700">Les trois automatismes externes sont inactifs et ne peuvent pas être activés tant que leurs producteurs ne sont pas connectés.</p></section>
      <section><h3 className="mb-2 text-sm font-black text-slate-900">Garde-fous</h3><div className="flex items-start gap-2 rounded-xl border border-slate-100 p-3"><Shield className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700"/><p className="text-sm text-slate-600">{agent.id === "pr-correction" ? "Correction isolée dans une branche. Les chemins sensibles sont bloqués et les validations doivent réussir avant publication. Aucune fusion ni mise en production automatique." : "Aucune commande arbitraire. Aucun accès d’écriture au dépôt. Aucune fusion ni mise en production automatique."}</p></div></section>
    </div>
  </dialog>;
}

function RunCard({run,busy,onCancel}:{run:RunRow;busy:boolean;onCancel:()=>void}) { const [open,setOpen]=useState(run.status === "completed"); const report=run.result; return <article className="rounded-xl border border-slate-200 p-3.5">
  <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${run.status === "completed" ? "bg-emerald-500" : run.status === "failed" ? "bg-rose-500" : run.status === "cancelled" ? "bg-slate-400" : "bg-blue-500"}`}/><p className="text-sm font-bold text-slate-900">{run.status === "completed" ? "Terminée" : run.status === "failed" ? "Échouée" : run.status === "cancelled" ? "Annulée" : run.status === "running" ? "En cours" : "En attente"}</p><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{triggerNames[run.trigger] ?? run.trigger}</span>{run.workflowId && <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700">Workflow · {run.sequence + 1}{run.workflowCount ? `/${run.workflowCount}` : ""}</span>}</div><div className="flex items-center gap-2"><time className="text-xs text-slate-500">{dateLabel(run.startedAt ?? run.createdAt)}</time>{run.status === "pending" && <button disabled={busy} onClick={onCancel} className="min-h-8 rounded-lg border border-rose-200 px-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Retirer de la file</button>}</div></div>
  {run.finishedAt && <p className="mt-1 text-xs text-slate-500">Fin : {dateLabel(run.finishedAt)}</p>}
  <p className="mt-1 text-xs text-slate-500">Période demandée : {run.analysisPeriod === "24h" ? "24 dernières heures" : "7 derniers jours"}</p>
  {run.error && <p className="mt-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-800">{run.error}</p>}
  {report && <><p className="mt-2 text-xs text-slate-600">{report.reportPath ? `Rapport local : ${report.reportPath}` : `Période analysée : ${report.period.label} · ${report.facts.length} fait(s) · ${report.findings?.length ?? report.recommendations.length} constat(s)`}</p><button onClick={()=>setOpen(!open)} className="mt-2 text-xs font-bold text-blue-700">{open?"Masquer le rapport":"Consulter le rapport"}</button>{open && <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
    <div><p className="text-xs font-black uppercase tracking-wide text-slate-500">Sources consultées</p>{report.sources.map(s=><p key={s.name} className="mt-1 text-xs text-slate-700">{s.name} · {s.samples} groupe(s) · {s.period}</p>)}</div>
    <div><p className="text-xs font-black uppercase tracking-wide text-slate-500">Faits mesurés</p>{report.facts.length?report.facts.map((f,i)=><p key={i} className="mt-1 text-xs leading-5 text-slate-700"><b>{f.category} :</b> {f.fact} <span className="text-slate-400">({f.evidence})</span></p>):<p className="mt-1 text-xs text-slate-500">Aucun fait disponible dans la période.</p>}</div>
    {report.findings && <div><p className="text-xs font-black uppercase tracking-wide text-slate-500">Constats classés</p><div className="mt-2 space-y-2">{report.findings.map((finding,i)=><article key={`${finding.location}-${i}`} className="rounded-lg border border-slate-200 p-3"><div className="flex flex-wrap items-center gap-2"><b className="text-xs text-slate-900">{finding.title}</b><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${finding.priority === "high" ? "bg-rose-50 text-rose-800" : finding.priority === "medium" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{finding.priority === "high" ? "Priorité haute" : finding.priority === "medium" ? "Priorité moyenne" : "Priorité basse"}</span><span className="text-[10px] font-semibold text-slate-500">{finding.kind === "observed" ? "Mesure observée" : finding.kind === "code" ? "Constat de code" : finding.kind === "test" ? "Constat dans un test" : finding.kind === "script" ? "Constat dans un script" : finding.kind === "migration" ? "Constat dans une migration" : "Hypothèse"} · effort {finding.effort}</span></div><p className="mt-1 text-xs leading-5 text-slate-700">Impact probable : {finding.impact}</p><p className="mt-1 text-xs text-slate-500">{finding.location} · preuve : {finding.evidence}</p><p className="mt-1 text-xs text-slate-500">Limite : {finding.limits}</p><p className="mt-1 text-xs leading-5 text-blue-800">Recommandation : {finding.recommendation}</p></article>)}</div></div>}
    <div><p className="text-xs font-black uppercase tracking-wide text-slate-500">Hypothèses et limites</p>{report.assumptions.map((a,i)=><p key={i} className="mt-1 text-xs leading-5 text-slate-600">{a}</p>)}</div>
    <div><p className="text-xs font-black uppercase tracking-wide text-slate-500">Recommandations</p>{report.recommendations.map((r,i)=><p key={i} className="mt-1 text-xs leading-5 text-slate-700">{i+1}. {r}</p>)}</div>
    <div><p className="text-xs font-black uppercase tracking-wide text-amber-700">Configuration ou données manquantes</p>{report.missing.map((m,i)=><p key={i} className="mt-1 text-xs leading-5 text-amber-800">{m}</p>)}</div>
  </div>}</>}
</article>; }

function Stat({icon:Icon,label,value,tone}:{icon:typeof Bot;label:string;value:number;tone:"blue"|"sky"|"amber"}) { const colors={blue:"bg-blue-50 text-blue-700",sky:"bg-sky-50 text-sky-700",amber:"bg-amber-50 text-amber-700"}; return <div className="flex min-h-[84px] items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><span className={`grid h-11 w-11 place-items-center rounded-full ${colors[tone]}`}><Icon className="h-5 w-5"/></span><div><p className="text-2xl font-black leading-7 text-slate-950">{value}</p><p className="text-xs font-medium text-slate-600">{label}</p></div><ArrowRight className="ml-auto h-4 w-4 text-slate-400"/></div>; }
function Badge({good,children}:{good:boolean;children:React.ReactNode}) { return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${good?"bg-emerald-50 text-emerald-800":"bg-amber-50 text-amber-800"}`}><span className={`h-1.5 w-1.5 rounded-full ${good?"bg-emerald-600":"bg-amber-600"}`}/>{children}</span>; }
function dateLabel(value:Date|string) { return new Intl.DateTimeFormat("fr-CA",{dateStyle:"medium",timeStyle:"short",timeZone:"America/Toronto"}).format(new Date(value)); }
