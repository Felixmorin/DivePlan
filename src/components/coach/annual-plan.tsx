"use client";

import { useMemo, useState } from "react";
import Link from "@/components/ui/app-link";
import { Activity, ArrowRight, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, ClipboardList, Dumbbell, FileText, Flag, Info, Pencil, Target, Users, Zap } from "lucide-react";

const months = ["Sept.", "Oct.", "Nov.", "Déc.", "Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Août"];
const phases = [
  { name: "Préparation générale", start: 1, end: 11, color: "blue" }, { name: "Préparation spécifique", start: 12, end: 20, color: "blue2" },
  { name: "Compétitions", start: 21, end: 27, color: "amber" }, { name: "Transition", start: 28, end: 34, color: "mint" },
  { name: "Préparation générale", start: 35, end: 43, color: "blue" }, { name: "Préparation spécifique", start: 44, end: 52, color: "blue2" },
];
const rows = [
  { label: "Macrocycles", bars: [[1, 11, "Base", "blue"], [12, 20, "Spécifique", "strong"], [21, 27, "Compétitif", "amber"], [28, 34, "Transition", "mint"], [35, 43, "Base", "blue"], [44, 52, "Spécifique", "strong"]] },
  { label: "Mésocycles", bars: [[1, 7, "Accumulation", "blue"], [8, 13, "Transformation", "lavender"], [14, 16, "Affûtage", "lavender2"], [17, 22, "Compétition", "amber"], [23, 27, "Récupération", "mint"], [28, 34, "Reconstruction", "gray"], [35, 43, "Développement", "blue"], [44, 52, "Spécifique", "lavender"]] },
  { label: "Microcycles", micro: true },
  { label: "Technique", bars: [[1, 11, "Acquisition", "cyan"], [12, 20, "Stabilisation", "cyan2"], [21, 31, "Perfectionnement", "cyan"], [32, 39, "Acquisition", "cyan2"], [40, 52, "Stabilisation", "cyan"]] },
  { label: "Qualités physiques", bars: [[1, 12, "Préparation générale", "blue"], [13, 19, "Puissance", "blue2"], [20, 26, "Maintien", "blue"], [27, 32, "Récupération", "mint"], [33, 38, "Reprise", "lavender"], [39, 52, "Développement", "blue"]] },
  { label: "Prévention / récupération", bars: [[1, 24, "Préparation renforcée", "mint"], [25, 36, "Prévention", "mint2"], [37, 52, "Récupération", "mint"]] },
];
const volume = [72,78,84,88,95,91,99,104,101,108,112,110,114,108,103,99,94,88,78,68,58,51,50,47,42,38,36,34,35,41,46,50,53,54,55,57,58,62,64,67,70,73,75,74,71,68,64,61,58,55,53,49];
const effort = [28,35,39,42,45,48,50,52,55,56,59,62,64,68,71,73,76,79,80,74,68,60,52,43,34,30,27,30,33,37,40,43,46,49,50,53,55,59,64,66,69,72,74,71,68,64,61,58,55,53,51,48];

export function AnnualPlan() {
  const [week, setWeek] = useState(18);
  const [view, setView] = useState("Année");
  const [help, setHelp] = useState(false);
  const activePhase = phases.find((phase) => week >= phase.start && week <= phase.end) ?? phases[0];
  const seasonWeeks = Array.from({ length: 52 }, (_, i) => i + 1);
  const points = (values: number[]) => values.map((value, i) => `${(i / 51) * 100},${100 - value}`).join(" ");
  const selectedMonth = months[Math.floor((week - 1) / 4.34)] ?? "Janv.";

  return <div className="annual-shell">
    <div className="annual-main">
      <header className="annual-header">
        <div><p className="annual-kicker">SAISON 2026–2027</p><h1>Plan annuel</h1></div>
        <div className="annual-switch" role="tablist" aria-label="Vue du plan">
          {["Année", "Périodes", "Athlètes"].map((item) => <button key={item} role="tab" aria-selected={view === item} className={view === item ? "selected" : ""} onClick={() => setView(item)}>{item}</button>)}
        </div>
      </header>
      <div className="annual-filters"><button><Users /> Provincial A <ChevronDown /></button><button><CalendarDays /> 2026–2027 <ChevronDown /></button><span className="annual-view-note">{view === "Année" ? "Vue d’ensemble de la saison" : view === "Périodes" ? "Périodisation de la saison" : "Charge et priorités par athlète"}</span></div>

      <section className="annual-objective"><div className="objective-title"><Target /><span><b>Objectif cible :</b> Championnat provincial <span className="dot-separator">·</span> 22–23 février</span></div><div className="completion"><span>Plan à <b>82 %</b> complété</span><div className="completion-track"><i /></div><b>82 %</b></div></section>

      <div className="annual-steps"><Step number="1" title="Dates & objectifs" subtitle="Saison et compétitions définies" done /><div className="step-arrow"/><Step number="2" title="Phases" subtitle="Phases planifiées" done /><div className="step-arrow"/><Step number="3" title="Cycles & charge" subtitle="Ajustez les priorités et la charge par période" active /><div className="step-arrow"/><Step number="4" title="Vérification" subtitle="Vérifiez la cohérence globale" /></div>

      <section className="annual-chart-card" aria-label="Calendrier de périodisation annuel">
        <div className="annual-grid">
          <div className="grid-label month-label">Mois</div><div className="month-track">{months.map((month, index) => <div key={month} style={{ gridColumn: `${Math.round(index * 52 / 12) + 1} / ${Math.round((index + 1) * 52 / 12) + 1}` }}>{month}</div>)}</div>
          <div className="grid-label week-label">Semaine</div><div className="week-track">{seasonWeeks.map((number) => <button key={number} onClick={() => setWeek(number)} className={number === week ? "current-week" : ""} aria-label={`Semaine ${number}`} aria-pressed={number === week}>{number}</button>)}</div>
          <div className="grid-label competition-label">Compétitions</div><div className="competition-track">{seasonWeeks.map((number) => <span key={number} className={number === 20 ? "target-star" : [13,24,30,37,43,47].includes(number) ? "competition-dot" : "quiet-dot"}>{number === 20 ? "★" : "●"}</span>)}</div>
          <div className="grid-label">Périodes</div><div className="bars-track phase-track">{phases.map((phase) => <button key={phase.name + phase.start} className={`plan-bar ${phase.color}`} style={{ gridColumn: `${phase.start} / ${phase.end + 1}` }} onClick={() => setWeek(phase.start)}>{phase.name}</button>)}</div>
          {rows.map((row) => <Row key={row.label} row={row} selectedWeek={week} setWeek={setWeek} />)}
          <div className="grid-label evaluation-label">Évaluations</div><div className="evaluation-track">{[18,24,32,40,50].map((number) => <button key={number} onClick={() => setWeek(number)} style={{ gridColumn: number }} aria-label={`Évaluation semaine ${number}`}>◆</button>)}</div>
          <div className="grid-label volume-label"><b>Volume piscine</b><small>(plongeons / athlète)</small><button aria-label="À propos du volume" onClick={() => setHelp(!help)}><Info /></button></div>
          <div className="line-chart volume-chart"><Chart values={volume} color="#1478ff" fill="rgba(20,120,255,.10)" /></div>
          <div className="grid-label intensity-label"><b><Zap /> Intensité prévue</b><small>Élevée <span>Faible</span></small></div>
          <div className="line-chart effort-chart"><Chart values={effort} color="#ff8a00" fill="rgba(255,138,0,.12)" /></div>
          {help && <div className="chart-help"><button onClick={() => setHelp(false)} aria-label="Fermer">×</button><b>Comment est calculé le volume ?</b><p>Volume piscine = plongeons réalisés par athlète. 100 % = moyenne personnelle des 4 dernières semaines comparables.</p><strong>Exemple : Moyenne 40 → planifié 44 = 110 %</strong><p>Chaque athlète peut avoir un volume individuel. En vue de groupe, il s’agit d’un aperçu global, non d’une prescription.</p></div>}
        </div>
      </section>

      <section className="plan-warning"><span className="warning-icon">!</span><div><b>1 objectif de saison sans séance associée</b><p>Ajoutez une séance pour lier cette compétition à votre plan.</p></div><Link href="/coach/planning">Associer une séance <ArrowRight /></Link></section>
      <div className="plan-legend"><b>Légende :</b><span><i className="legend-star">★</i> Compétition cible</span><span><i className="legend-dot"/> Compétition</span><span><i className="legend-phase"/> Phase d’entraînement</span><span><i className="legend-diamond">◆</i> Date d’évaluation</span></div>
    </div>

    <aside className="annual-side">
      <div className="side-week"><div><b>Semaine {week}</b><span> · {selectedMonth === "Janv." ? "12–18 janvier" : `${selectedMonth}, saison 2026–27`}</span></div><button aria-label="Semaine précédente" onClick={() => setWeek(Math.max(1, week - 1))}><ChevronLeft /></button><button aria-label="Semaine suivante" onClick={() => setWeek(Math.min(52, week + 1))}><ChevronRight /></button></div>
      <div className="side-content"><div className="phase-label"><i/> Phase active</div><div className="phase-pill">{activePhase.name}</div>
        <h3><Target /> Focus du microcycle</h3><div className="focus-box">Stabiliser les listes de 3 m</div>
        <section className="decision-card"><h3><ClipboardList /> Prochaine décision <Info /></h3><b>Valider la charge du microcycle</b><p>3 séances planifiées · volume prévu +10 % vs moyenne de l’athlète</p><Link href="/coach/sessions"><Pencil /> Ajuster les séances <ArrowRight /></Link></section>
        <section className="phase-card"><h3><FileText /> Propre de la phase <Pencil /></h3><SideDetail title="Objectif" text="Stabiliser les listes de 3 m"/><SideDetail title="En séance" text="Qualité d’exécution, séries ciblées, récupération suffisante"/><SideDetail title="Réussite" text="Progression observée sans dégrader la technique"/><Link href="/coach/planning">▤ &nbsp; Voir le détail du mésocycle <ChevronRight /></Link></section>
        <h3 className="priorities-title"><Activity /> Priorités</h3><div className="priority-chips"><span>Puissance</span><span>Contrôle</span></div>
        <h3 className="linked-title"><CalendarDays /> Séances liées</h3><p className="linked-caption">3 prévues · 2 réalisées <ChevronRight /></p>
        <h3 className="linked-title"><Activity /> Évaluation</h3><div className="evaluation-card"><b>Évaluation suggérée <Info /></b><div><span>◆</span><p><b>Saut vertical</b><br/>Pourquoi : priorité Puissance des jambes<br/>Compare le résultat à la dernière mesure</p><ChevronRight /></div><Link href="/coach/milestones">☷ &nbsp; Choisir un autre test <ChevronRight /></Link><small>ⓘ &nbsp; Suggestion à confirmer par le coach</small></div>
        <Link className="side-primary" href="/coach/planning">Ouvrir la semaine <ArrowRight /></Link><Link className="side-secondary" href="/coach/athletes"><Users /> Voir les athlètes</Link>
      </div>
    </aside>
  </div>;
}

function Step({ number, title, subtitle, done = false, active = false }: { number: string; title: string; subtitle: string; done?: boolean; active?: boolean }) {
  return <div className={`annual-step ${active ? "active" : ""}`}><span className={`step-number ${done ? "done" : ""}`}>{done ? <Check /> : number}</span><div><b>{number}. {title}</b><small>{subtitle}</small></div></div>;
}

function Row({ row, selectedWeek, setWeek }: { row: typeof rows[number]; selectedWeek: number; setWeek: (week: number) => void }) {
  return <><div className="grid-label row-label">{row.label}</div>{row.micro ? <div className="bars-track micro-track">{Array.from({ length: 52 }, (_, i) => <button key={i} className={`micro-bar micro-${Math.floor(i / 4) % 4}`} onClick={() => setWeek(i + 1)} aria-label={`Microcycle semaine ${i + 1}`} />)}<span className="week-indicator" style={{ gridColumn: selectedWeek }} /></div> : <div className="bars-track">{row.bars?.map(([start, end, label, color]) => <button key={`${label}-${start}`} className={`plan-bar ${color}`} style={{ gridColumn: `${start} / ${Number(end) + 1}` }} onClick={() => setWeek(Number(start))}>{label}</button>)}</div>}</>;
}

function Chart({ values, color, fill }: { values: number[]; color: string; fill: string }) {
  const path = useMemo(() => values.map((v, i) => `${(i / (values.length - 1)) * 100},${100 - v}`).join(" "), [values]);
  return <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Tendance hebdomadaire" role="img"><polygon points={`0,100 ${path} 100,100`} fill={fill}/><polyline points={path} fill="none" stroke={color} strokeWidth="1.4" vectorEffect="non-scaling-stroke"/>{values.map((v, i) => <circle key={i} cx={(i / (values.length - 1)) * 100} cy={100 - v} r=".7" fill={color} vectorEffect="non-scaling-stroke"/>)}</svg>;
}

function SideDetail({ title, text }: { title: string; text: string }) { return <div className="side-detail"><b>{title}</b><span>{text}</span><ChevronRight /></div>; }
