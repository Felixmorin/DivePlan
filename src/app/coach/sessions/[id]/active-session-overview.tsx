"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, ChevronRight, Dumbbell, RefreshCw, UserRound, Waves, X } from "lucide-react";
import { saveSessionAttendance } from "@/app/coach/sessions/actions";
import type { LivePlan, LiveProgress, LiveSession } from "@/lib/live-session";
import { formatMontrealDate } from "@/lib/timezone";

type Athlete = { id: string; firstName: string; lastName: string };
type Props = {
  session: LivePlan;
  initialProgress: LiveProgress;
  athletes: Athlete[];
};

export function ActiveSessionOverview({ session: plan, initialProgress, athletes }: Props) {
  const router = useRouter();
  const [progressData, setProgressData] = useState(initialProgress);
  const [refreshRequest, setRefreshRequest] = useState(0);
  const [syncStatus, setSyncStatus] = useState<"synced" | "loading" | "failed">("synced");
  useEffect(() => {
    let disposed = false;
    let halted = false;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | null = null;
    let failures = 0;
    let etag: string | null = null;
    const schedule = () => {
      if (!disposed && !halted && document.visibilityState === "visible") {
        timer = setTimeout(poll, Math.min(60_000, 15_000 * 2 ** failures));
      }
    };
    async function poll() {
      if (disposed || halted || controller || document.visibilityState !== "visible") return;
      clearTimeout(timer);
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 10_000);
      setSyncStatus("loading");
      try {
        const response = await fetch(`/api/coach/sessions/${encodeURIComponent(plan.id)}/progress`, {
          headers: etag ? { "If-None-Match": etag } : undefined,
          cache: "no-store", credentials: "same-origin", signal: controller.signal
        });
        if ([401, 403, 404].includes(response.status)) {
          halted = true;
          router.refresh();
          return;
        }
        if (disposed || document.visibilityState !== "visible") return;
        if (response.status === 304 && etag) {
          setSyncStatus("synced");
          failures = 0;
          return;
        }
        if (!response.ok) throw new Error("Progress unavailable");
        const next: LiveProgress = await response.json();
        if (disposed || document.visibilityState !== "visible") return;
        if (next.status !== "IN_PROGRESS" || next.planVersion !== initialProgress.planVersion) {
          halted = true;
          router.refresh();
          return;
        }
        etag = response.headers.get("etag");
        setProgressData(next);
        setSyncStatus("synced");
        failures = 0;
      } catch {
        if (!disposed && document.visibilityState === "visible") {
          failures = Math.min(2, failures + 1);
          setSyncStatus("failed");
        }
      } finally {
        clearTimeout(timeout);
        controller = null;
        schedule();
      }
    }
    function onVisibilityChange() {
      clearTimeout(timer);
      if (document.visibilityState === "visible") void poll();
      else controller?.abort();
    }
    if (refreshRequest > 0) void poll();
    else schedule();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      disposed = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [router, plan.id, initialProgress.planVersion, refreshRequest]);
  const session = { ...plan, ...progressData };
  const blocks = [...session.blocks].sort((a, b) => a.position - b.position);
  const [activeType, setActiveType] = useState<string>(blocks.find((block) => block.type === "POOL") ? "POOL" : blocks[0]?.type ?? "POOL");
  const [presenceOpen, setPresenceOpen] = useState(false);
  const [absentAthleteIds, setAbsentAthleteIds] = useState<Set<string>>(() => new Set(session.absences.map((absence: { athleteId: string }) => absence.athleteId)));
  const [expanded, setExpanded] = useState<string | null>(null);
  const absentIds = presenceOpen ? absentAthleteIds : new Set(progressData.absences.map(({ athleteId }) => athleteId));
  const presentCount = athletes.length - absentIds.size;
  const selectedBlocks = blocks.filter((block) => block.type === activeType);
  const visibleBlocks = selectedBlocks.map((block) => ({ ...block, assignments: block.assignments.filter(({ athleteId }) => !absentIds.has(athleteId)) }));
  const totalPlanned = visibleBlocks.reduce((sum, block) => sum + plannedUnits(block), 0);
  const totalDone = visibleBlocks.reduce((sum, block) => sum + completedUnits(block, session), 0);
  const progress = totalPlanned ? Math.min(100, Math.round(totalDone / totalPlanned * 100)) : 0;

  return <main className="live-session">
    <div className="live-breadcrumb"><Link href="/coach/sessions">Séances</Link><ChevronRight />Séance en cours</div>
    <header className="live-heading">
      <div><div className="live-title-line"><h1>Séance en cours</h1><span className="live-pill"><i /> LIVE</span></div><p>{session.week.group.name}<span>·</span>{formatMontrealDate(session.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p></div>
      <div className="live-actions"><span className="sync-pill" role="status"><i /> {syncStatus === "failed" ? "Connexion interrompue · nouvelle tentative" : syncStatus === "loading" ? "Synchronisation…" : "Synchronisé en direct"}</span><button className="refresh-button" onClick={() => setRefreshRequest((value) => value + 1)} disabled={syncStatus === "loading"} aria-label="Actualiser"><RefreshCw /></button></div>
    </header>
    <div className="live-toolbar">
      <nav className="live-tabs" aria-label="Type de bloc">
        {[ ["WARMUP", "Échauffement"], ["DRYLAND", "Dryland"], ["POOL", "Piscine"] ].filter(([type]) => blocks.some((block) => block.type === type)).map(([type, label]) => <button key={type} className={activeType === type ? "active" : ""} onClick={() => { setActiveType(type); setExpanded(blocks.find((block) => block.type === type)?.id ?? null); }}>{type === "POOL" ? <Waves /> : type === "DRYLAND" ? <Dumbbell /> : <UserRound />}{label}</button>)}
      </nav>
      <section className="attendance-summary"><div><strong>Présences</strong><span>{presentCount} présent{presentCount !== 1 ? "s" : ""} · {absentIds.size} absent{absentIds.size !== 1 ? "s" : ""}</span></div><div className="avatar-stack">{athletes.slice(0, 6).map((athlete) => <span key={athlete.id} title={`${athlete.firstName} ${athlete.lastName}`} className={absentIds.has(athlete.id) ? "absent" : ""}>{athlete.firstName[0]}{athlete.lastName[0]}</span>)}</div><button className="manage-button" onClick={() => { setAbsentAthleteIds(new Set(progressData.absences.map(({ athleteId }) => athleteId))); setPresenceOpen(true); }}>Gérer</button></section>
    </div>
    <section className="live-overview"><div className="overview-icon">{activeType === "POOL" ? <Waves /> : <Dumbbell />}</div><div className="overview-name"><small>Bloc actuel</small><h2>{activeType === "POOL" ? "Bloc - Piscine" : activeType === "DRYLAND" ? "Bloc - Dryland" : "Bloc - Échauffement"}</h2><span>{selectedBlocks.length} bloc{selectedBlocks.length !== 1 ? "s" : ""} · {selectedBlocks.reduce((sum, block) => sum + block.assignments.length, 0)} athlètes</span></div><div className="overview-progress"><small>Progression</small><div className="progress-line"><span style={{ width: `${progress}%` }} /></div></div><strong className="overview-count">{totalDone} / {totalPlanned} {activeType === "POOL" ? "répétitions" : "exercices"}</strong><span className="overview-percent">{progress}%</span><span className="status-pill"><i /> En cours</span></section>
    <section className="live-block-list">{visibleBlocks.map((block, index) => {
      const planned = plannedUnits(block); const done = completedUnits(block, session); const pct = planned ? Math.min(100, Math.round(done / planned * 100)) : 0;
      const isOpen = expanded === block.id;
      return <article className="live-block" key={block.id}>
        <button className="block-toggle" onClick={() => setExpanded(isOpen ? null : block.id)}><ChevronDown className={isOpen ? "turned" : ""} /><span className="block-index">{index + 1}</span><span className="block-label"><strong>{block.title}</strong><small>{block.poolTraining?.sections.length ?? block.drylandExercises.length} {activeType === "POOL" ? "sections" : "exercices"} · {done} / {planned} répétitions</small></span><span className="block-meter"><i><b style={{ width: `${pct}%` }} /></i><small>{done} / {planned} répétitions</small></span><strong className="block-percent">{pct}%</strong><ChevronRight className={isOpen ? "turned-right" : ""} /></button>
        {isOpen && <div className="block-content">{block.poolTraining ? block.poolTraining.sections.map((section) => {
          const multiplier = Math.max(1, (section.label ?? section.height).match(/\d+/g)?.length ?? 1);
          const sectionPlanned = section.dives.reduce((n: number, dive) => n + dive.repetitions * multiplier * block.assignments.filter((item) => !absentIds.has(item.athleteId)).length, 0);
          const sectionDone = section.dives.reduce((n: number, dive) => n + session.diveLogs.filter((log) => log.poolDiveId === dive.id && !absentIds.has(log.athleteId)).reduce((subtotal: number, log) => subtotal + log.repetitionsCompleted, 0), 0);
          return <div className="section-row" key={section.id}><span className="height-tag">{section.label ?? (section.height === "ONE_METER" ? "1 m" : section.height === "THREE_METER" ? "3 m" : "Plateforme")}</span><div className="dive-chips">{section.dives.map((dive) => { const logged = session.diveLogs.filter((log) => log.poolDiveId === dive.id && !absentIds.has(log.athleteId)).reduce((n: number, log) => n + log.repetitionsCompleted, 0); const expected = dive.repetitions * multiplier * block.assignments.filter((item) => !absentIds.has(item.athleteId)).length; return <span className={`dive-chip ${logged >= expected ? "done" : logged ? "partial" : ""}`} key={dive.id}><b>{dive.diveCode}</b><small>{logged} / {expected}</small><i><b style={{ width: `${expected ? Math.min(100, logged / expected * 100) : 0}%` }} /></i></span>; })}</div><span className="section-count">{sectionDone}/{sectionPlanned}</span></div>;
        }) : <div className="exercise-list">{block.drylandExercises.map((item) => { const assignments = block.assignments.filter((assignment) => !absentIds.has(assignment.athleteId)); const done = session.exerciseLogs.filter((log) => log.exerciseId === item.exerciseId && log.completed && !absentIds.has(log.athleteId)).length; return <div key={item.exerciseId} className="exercise-row"><span className="exercise-icon"><Dumbbell /></span><strong>{item.exercise.name}</strong><span>{item.sets ?? 1} × {item.reps ?? `${item.duration ?? 30} s`}</span><span className="exercise-completion">{done} / {assignments.length} athlètes</span><span className={`mini-state ${done >= assignments.length && assignments.length ? "done" : ""}`}>{done >= assignments.length && assignments.length ? "Terminé" : "En cours"}</span></div>; })}</div>}
        <div className="block-note"><span>i</span> Les athlètes marqués absents sont exclus des totaux.</div></div>}
      </article>;
    })}</section>
    {presenceOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPresenceOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="presence-dialog-title" className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <header className="flex items-start justify-between border-b border-slate-100 pb-3"><div><h2 id="presence-dialog-title" className="text-lg font-black text-slate-950">Gérer les présences</h2><p className="mt-1 text-xs font-semibold text-slate-500">{session.week.group.name} · Séance en cours</p></div><button type="button" aria-label="Fermer" onClick={() => setPresenceOpen(false)} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button></header>
        <form action={async (formData) => { await saveSessionAttendance(formData); setPresenceOpen(false); setRefreshRequest((value) => value + 1); }} className="pt-3">
          <input type="hidden" name="sessionId" value={session.id} />
          {athletes.map((athlete) => {
            const absent = absentAthleteIds.has(athlete.id);
            return <label key={athlete.id} className="flex items-center gap-3 border-b border-slate-100 py-2.5 last:border-0"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-black ${absent ? "bg-slate-200 text-slate-500" : "bg-blue-100 text-blue-700"}`}>{athlete.firstName.slice(0, 1)}{athlete.lastName.slice(0, 1)}</span><strong className="min-w-0 flex-1 text-sm text-slate-900">{athlete.firstName} {athlete.lastName}</strong><select aria-label={`Présence de ${athlete.firstName} ${athlete.lastName}`} value={absent ? "absent" : "present"} onChange={(event) => setAbsentAthleteIds((current) => { const next = new Set(current); if (event.target.value === "absent") next.add(athlete.id); else next.delete(athlete.id); return next; })} className={`h-9 rounded-lg px-3 text-sm font-semibold ${absent ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}><option value="present">●　Présent</option><option value="absent">●　Absent</option></select>{absent && <input type="hidden" name="absentAthleteIds" value={athlete.id} />}</label>;
          })}
          <div className="mt-3 rounded-lg bg-blue-50 p-3 text-sm"><strong>{athletes.length - absentAthleteIds.size} présents · {absentAthleteIds.size} absent{absentAthleteIds.size === 1 ? "" : "s"}</strong><p className="mt-1 text-xs leading-5 text-blue-800">Les répétitions prévues des athlètes absents sont exclues des totaux.</p></div>
          <button type="button" onClick={() => setAbsentAthleteIds(new Set())} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-blue-200 text-sm font-bold text-blue-700 hover:bg-blue-50"><UserRound className="h-4 w-4" /> Tout le monde présent</button>
          <footer className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setPresenceOpen(false)} className="h-10 rounded-lg border border-slate-200 px-5 text-sm font-bold text-slate-700">Annuler</button><button type="submit" className="h-10 rounded-lg bg-blue-700 px-5 text-sm font-bold text-white hover:bg-blue-800">Enregistrer</button></footer>
        </form>
      </section>
    </div>}
    <style jsx>{styles}</style>
  </main>;
}

function plannedUnits(block: LiveSession["blocks"][number]) { return block.poolTraining ? block.poolTraining.sections.reduce((sum: number, section) => sum + section.dives.reduce((n: number, dive) => n + dive.repetitions * Math.max(1, (section.label ?? section.height).match(/\d+/g)?.length ?? 1) * block.assignments.length, 0), 0) : block.drylandExercises.reduce((sum: number, item) => sum + (item.sets ?? 1) * (item.reps ?? 1) * block.assignments.length, 0); }
function completedUnits(block: LiveSession["blocks"][number], session: LiveSession) {
  if (block.poolTraining) return session.diveLogs.filter((log) => block.assignments.some((assignment) => assignment.athleteId === log.athleteId) && block.poolTraining?.sections.some((section) => section.dives.some((dive) => dive.id === log.poolDiveId))).reduce((sum: number, log) => sum + log.repetitionsCompleted, 0);
  return session.exerciseLogs.filter((log) => log.completed && block.assignments.some((assignment) => assignment.athleteId === log.athleteId) && block.drylandExercises.some((item) => item.exerciseId === log.exerciseId)).reduce((sum: number, log) => { const item = block.drylandExercises.find((exercise) => exercise.exerciseId === log.exerciseId); return sum + (item?.sets ?? 1) * (item?.reps ?? 1); }, 0);
}

const styles = `
.live-session{color:#101b63}.live-breadcrumb{display:flex;align-items:center;gap:12px;margin:0 0 14px;color:#0753ba;font-size:13px}.live-breadcrumb :global(svg){width:16px;color:#7194c5}.live-breadcrumb a{color:inherit;text-decoration:none}.live-heading{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:22px}.live-title-line{display:flex;align-items:center;gap:16px}.live-title-line h1{margin:0;font-size:clamp(29px,3vw,38px);line-height:1.1;font-weight:850;letter-spacing:-1.2px}.live-heading p{display:flex;gap:16px;margin:8px 0 0;color:#5782bf;font-size:17px}.live-pill,.sync-pill,.status-pill{display:inline-flex;align-items:center;gap:9px;border-radius:12px;padding:10px 15px;background:#e5fbf3;color:#008f66;font-size:14px;font-weight:700}.live-pill i,.sync-pill i,.status-pill i{width:10px;height:10px;border-radius:50%;background:#00b883}.live-actions{display:flex;align-items:center;gap:12px}.sync-pill{border:1px solid #b6f0df;background:#effcf7;color:#101b63;font-weight:500}.refresh-button{width:48px;height:48px;border:1px solid #d3def1;border-radius:12px;background:white;color:#101b63;cursor:pointer}.refresh-button :global(svg){width:20px}.live-toolbar{display:flex;align-items:stretch;justify-content:space-between;gap:14px;margin-bottom:16px}.live-tabs{display:flex;gap:12px}.live-tabs button{display:flex;align-items:center;justify-content:center;gap:12px;min-width:168px;padding:12px 20px;border:1px solid #d6e1f2;border-radius:12px;background:white;color:#101b63;font-size:15px;font-weight:750;cursor:pointer}.live-tabs button :global(svg){width:24px;color:#3977b6}.live-tabs button.active{border-color:#00c879;background:#edfff7;box-shadow:inset 0 0 0 1px #00c879}.live-tabs button.active :global(svg){color:#078ef0}.attendance-summary{display:flex;align-items:center;gap:13px;padding:10px 14px;border:1px solid #d6e1f2;border-radius:12px;min-width:360px}.attendance-summary>div:first-child{display:grid;gap:3px;margin-right:auto}.attendance-summary strong{font-size:15px}.attendance-summary span{font-size:13px;color:#315da2}.avatar-stack{display:flex}.avatar-stack span,.presence-avatar{display:flex;align-items:center;justify-content:center;width:42px;height:42px;margin-left:-5px;border:2px solid white;border-radius:50%;background:#dcedff;color:#0786eb;font-size:13px;font-weight:800}.avatar-stack .absent,.presence-avatar.absent{background:#e6e8eb;color:#8993a1}.manage-button{padding:9px 16px;border:1px solid #1555ff;border-radius:9px;background:white;color:#1555ff;font-weight:700;cursor:pointer}.live-overview{display:grid;grid-template-columns:auto minmax(180px,1.2fr) minmax(120px,1fr) auto auto auto;align-items:center;gap:20px;margin-bottom:16px;padding:20px 24px;border:1px solid #d8e3f3;border-radius:12px;background:#fff}.overview-icon{display:grid;place-items:center;width:58px;height:58px;border-radius:50%;background:#d9efff;color:#0072c7}.overview-icon :global(svg){width:28px}.overview-name small,.overview-progress small{color:#0e42a2;font-size:14px}.overview-name h2{margin:3px 0;font-size:23px}.overview-name>span{color:#5580bc;font-size:14px}.overview-progress{display:grid;gap:11px}.progress-line,.block-meter i,.dive-chip i{height:14px;overflow:hidden;border-radius:99px;background:#e8edf5}.progress-line span,.block-meter b,.dive-chip i b{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#00b98a,#00c68f)}.overview-count{white-space:nowrap;font-size:14px;font-weight:500}.overview-percent{font-weight:800}.status-pill{white-space:nowrap;padding:12px 18px}.live-block-list{display:grid;gap:14px}.live-block{overflow:hidden;border:1px solid #d7e2f2;border-radius:12px;background:white}.block-toggle{display:flex;align-items:center;gap:14px;width:100%;padding:16px 20px;border:0;background:white;text-align:left;color:#101b63;cursor:pointer}.block-toggle> :global(svg){width:20px;transition:transform .15s}.block-toggle>.turned{transform:rotate(0deg)}.block-toggle> :global(svg:first-child:not(.turned)){transform:rotate(-90deg)}.turned-right{transform:rotate(90deg)}.block-index{display:grid;place-items:center;flex:0 0 40px;height:40px;border-radius:50%;background:#174b87;color:white;font-size:17px;font-weight:800}.block-label{display:grid;gap:2px;min-width:180px;margin-right:auto}.block-label strong{font-size:18px}.block-label small{color:#5782bf}.block-meter{display:flex;align-items:center;gap:14px;width:min(39%,460px)}.block-meter i{flex:1}.block-meter small{min-width:110px;color:#1141a0}.block-percent{min-width:46px;text-align:right}.block-content{margin:0 20px 16px 62px;border:1px solid #e0e8f3;border-radius:10px;padding:8px 16px}.section-row{display:flex;align-items:center;gap:14px;padding:12px 4px;border-bottom:1px solid #e6edf5}.height-tag{display:grid;place-items:center;min-width:48px;height:46px;border-radius:13px;background:#e1f0ff;color:#1759bd;font-weight:800}.dive-chips{display:flex;flex-wrap:wrap;gap:8px;flex:1}.dive-chip{display:grid;grid-template-columns:1fr auto;gap:3px 14px;min-width:120px;padding:7px 12px;border:1px solid #d9e4f2;border-radius:18px;background:#f9fbff}.dive-chip small{color:#5580bc}.dive-chip i{grid-column:1/-1;height:8px}.dive-chip.partial{border-color:#95c9ff;background:#f1f8ff}.dive-chip.partial i b{background:#168ef0}.dive-chip.done{border-color:#b7efdc;background:#effcf7}.section-count{white-space:nowrap;font-size:13px;color:#527bb5}.exercise-row{display:grid;grid-template-columns:auto 1fr auto auto auto;align-items:center;gap:14px;padding:12px;border-bottom:1px solid #e6edf5}.exercise-icon{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:#eef5fc}.exercise-icon :global(svg){width:19px}.exercise-row>span:not(.exercise-icon){color:#517ab4;font-size:13px}.exercise-completion{min-width:120px}.mini-state{border-radius:8px;background:#e7f5ff;padding:8px 12px;color:#0876cc;font-size:13px}.mini-state.done{background:#e5fbf3;color:#008f66}.block-note{display:flex;align-items:center;gap:9px;margin:10px 0 0;padding:10px 12px;border-radius:9px;background:#eff6ff;color:#3867a6;font-size:13px}.block-note>span{display:grid;place-items:center;width:18px;height:18px;border-radius:50%;background:#367fce;color:white;font-weight:800}.presence-backdrop{position:fixed;inset:0;z-index:60;display:grid;place-items:center;padding:20px;background:#07132899;backdrop-filter:blur(2px)}.presence-dialog{width:min(100%,570px);max-height:90vh;overflow:auto;border-radius:16px;background:white;padding:26px 30px;box-shadow:0 24px 80px #06163355}.presence-dialog header{display:flex;justify-content:space-between;align-items:start;padding-bottom:15px;border-bottom:1px solid #e2eaf5}.presence-dialog h2{margin:0;font-size:27px;letter-spacing:-.5px}.presence-dialog header p{margin:5px 0 0;color:#5682bf}.presence-dialog header button{border:0;background:transparent;cursor:pointer}.presence-row{display:flex;align-items:center;gap:14px;min-height:64px;border-bottom:1px solid #e5ecf5}.presence-row strong{flex:1}.presence-row select{min-width:165px;padding:11px;border:0;border-radius:9px;background:#e6fbf3;color:#008d67;font-size:14px;font-weight:700;cursor:pointer}.presence-row select option{background:white;color:#10205c}.presence-note{display:grid;gap:7px;margin:14px 0;padding:13px;border-radius:10px;background:#eff6ff;color:#1850a1}.presence-note strong{display:flex;gap:9px;align-items:center}.presence-note :global(svg){width:18px}.presence-note span{padding-left:27px;font-size:12px}.everyone-button{width:100%;padding:13px;border:1px solid #9dc4ff;border-radius:9px;background:white;color:#155bdb;font-weight:750;cursor:pointer}.presence-dialog footer{display:flex;justify-content:flex-end;gap:12px;margin-top:18px}.presence-dialog footer button{min-width:145px;padding:13px;border-radius:9px;font-weight:750;cursor:pointer}.cancel-button{border:1px solid #cfdbeb;background:white;color:#1646a7}.save-button{border:1px solid #063bdb;background:#0d43e7;color:white}@media(max-width:1000px){.live-toolbar{flex-direction:column}.attendance-summary{min-width:0}.live-overview{grid-template-columns:auto 1fr auto}.overview-progress{grid-column:2/4}.block-meter{width:40%}}@media(max-width:700px){.live-heading{align-items:flex-start}.live-actions{gap:6px}.sync-pill{font-size:0;padding:12px}.live-tabs{display:grid;grid-template-columns:repeat(3,1fr)}.live-tabs button{min-width:0;padding:11px 6px;font-size:12px;gap:5px}.attendance-summary{flex-wrap:wrap}.avatar-stack span{width:34px;height:34px;font-size:10px}.live-overview{grid-template-columns:auto 1fr auto;gap:12px;padding:14px}.overview-progress{grid-column:1/3}.status-pill{padding:9px;font-size:12px}.overview-count{grid-column:2}.block-toggle{gap:8px;padding:12px}.block-label{min-width:0}.block-label strong{font-size:14px}.block-meter{display:none}.block-percent{margin-left:auto}.block-content{margin:0 10px 12px;padding:8px}.section-row{align-items:flex-start}.section-count{display:none}.exercise-row{grid-template-columns:auto 1fr auto}.exercise-row>span:not(.exercise-icon){grid-column:2}.presence-dialog{padding:20px}.presence-dialog h2{font-size:22px}.presence-row{gap:8px}.presence-avatar{width:36px;height:36px}.presence-row select{min-width:115px;padding:9px;font-size:12px}.presence-dialog footer button{min-width:0;flex:1}}
` + `
@media(max-width:700px){
  .live-session{padding:0 2px;color:#10205c}
  .live-breadcrumb{display:none}
  .live-heading{align-items:center;gap:8px;margin:0 0 12px;padding:0 2px}
  .live-title-line{gap:7px}
  .live-title-line h1{font-size:19px;letter-spacing:-.45px}
  .live-pill{gap:5px;padding:5px 8px;border-radius:99px;font-size:9px}
  .live-pill i,.sync-pill i,.status-pill i{width:6px;height:6px}
  .live-heading p{gap:7px;margin-top:4px;font-size:10px;line-height:1.3}
  .live-actions{flex:0 0 auto;flex-direction:column-reverse;gap:2px}
  .sync-pill{gap:0;padding:0;border:0;background:transparent;font-size:8px;color:#0876b9}
  .sync-pill i{display:none}
  .refresh-button{width:29px;height:29px;border-radius:8px}
  .refresh-button :global(svg){width:15px}
  .live-toolbar{gap:9px;margin-bottom:9px}
  .live-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px}
  .live-tabs button{min-width:0;min-height:34px;gap:5px;padding:5px 3px;border-radius:8px;font-size:10px}
  .live-tabs button :global(svg){width:16px;height:16px}
  .attendance-summary{min-height:34px;flex-wrap:nowrap;gap:8px;padding:5px 8px;border-radius:8px}
  .attendance-summary>div:first-child{display:flex;align-items:center;gap:6px;margin:0;white-space:nowrap}
  .attendance-summary strong{font-size:10px}
  .attendance-summary>div:first-child>span{display:none}
  .avatar-stack{margin-right:auto}
  .avatar-stack span{width:24px;height:24px;margin-left:-5px;font-size:8px}
  .manage-button{padding:5px 8px;border-radius:7px;font-size:9px}
  .live-overview{grid-template-columns:auto minmax(0,1fr) auto;gap:8px;margin-bottom:9px;padding:9px 10px;border-radius:9px;background:#f8fbff}
  .overview-icon{width:30px;height:30px}
  .overview-icon :global(svg){width:17px}
  .overview-name small{display:none}
  .overview-name h2{margin:0;font-size:12px}
  .overview-name>span{font-size:9px}
  .overview-progress{grid-column:2;grid-row:2;gap:0}
  .overview-progress small{display:none}
  .progress-line{height:7px}
  .overview-count{grid-column:3;grid-row:1;font-size:9px}
  .overview-percent{grid-column:3;grid-row:2;text-align:right;font-size:10px}
  .status-pill{grid-column:1/-1;justify-self:start;gap:5px;padding:4px 8px;border-radius:7px;font-size:9px}
  .live-block-list{gap:8px}
  .live-block{border-color:#e0e9f5;border-radius:10px;background:#fbfdff;box-shadow:0 2px 8px #174b8708}
  .block-toggle{gap:6px;padding:8px}
  .block-toggle> :global(svg){width:14px;height:14px}
  .block-index{flex-basis:29px;height:29px;font-size:12px}
  .block-label{gap:1px}
  .block-label strong{font-size:11px}
  .block-label small{font-size:8px}
  .block-meter{display:flex;width:25%;gap:0}
  .block-meter i{height:6px}
  .block-meter small{display:none}
  .block-percent{min-width:28px;font-size:9px}
  .block-content{margin:0 6px 7px;padding:5px;border-color:#e6edf5;border-radius:8px;background:#fff}
  .section-row{display:grid;grid-template-columns:31px minmax(0,1fr);gap:5px;padding:5px 1px}
  .height-tag{min-width:0;height:29px;border-radius:8px;font-size:10px}
  .dive-chips{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px}
  .dive-chip{grid-template-columns:1fr auto;gap:2px 5px;min-width:0;padding:5px 7px;border-radius:11px;font-size:9px}
  .dive-chip small{font-size:8px}
  .dive-chip i{height:5px}
  .section-count{display:none}
  .block-note{gap:6px;margin-top:6px;padding:6px 7px;font-size:8px}
  .block-note>span{width:14px;height:14px;font-size:9px}
  .exercise-row{grid-template-columns:auto minmax(0,1fr) auto;gap:6px;padding:7px}
  .exercise-icon{width:28px;height:28px}
  .exercise-row strong{font-size:10px}
  .exercise-row>span:not(.exercise-icon){grid-column:auto;font-size:9px}
  .exercise-completion{display:none}
  .mini-state{padding:5px 7px;font-size:9px}
}
@media(max-width:380px){.live-title-line h1{font-size:17px}.live-heading p{font-size:9px}.live-tabs button{font-size:9px}.block-meter{display:none}.block-percent{margin-left:auto}.dive-chips{grid-template-columns:minmax(0,1fr)}}
`;
