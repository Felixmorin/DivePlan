"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarDays, MoreHorizontal, Plus, RotateCcw, Search } from "lucide-react";
import { formatMontrealDate } from "@/lib/timezone";

export type AthleteHistorySession = {
  id: string;
  title: string;
  date: Date;
  type: string;
  duration: number;
  status: string;
  volume: number;
  coachNote: string | null;
  rating: string | null;
};

const statusLabels: Record<string, string> = {
  COMPLETED: "Terminée",
  IN_PROGRESS: "En cours",
  NOT_STARTED: "À faire",
  SKIPPED: "Sautée"
};

export function CoachAthleteSessionHistory({ sessions, attendance, totalVolume, demo }: {
  sessions: AthleteHistorySession[];
  attendance: { absent: number; total: number; rate: number };
  totalVolume: number;
  demo: boolean;
}) {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [month, setMonth] = useState("all");
  const types = useMemo(() => [...new Set(sessions.map((session) => session.type).filter(Boolean))].sort(), [sessions]);
  const months = useMemo(() => [...new Set(sessions.map((session) => {
    const date = new Date(session.date);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }))].sort((a, b) => b.localeCompare(a)), [sessions]);
  const filtered = sessions.filter((session) => {
    const date = new Date(session.date);
    const sessionMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const matchesSearch = `${session.title} ${session.type} ${session.coachNote ?? ""}`.toLocaleLowerCase("fr").includes(search.toLocaleLowerCase("fr"));
    return matchesSearch && (type === "all" || session.type === type) && (status === "all" || session.status === status) && (month === "all" || sessionMonth === month);
  });
  const now = new Date();
  const seasonStartYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  const seasonStart = new Date(seasonStartYear, 8, 1);
  const durationMinutes = sessions.filter((session) => {
    const date = new Date(session.date);
    return session.status === "COMPLETED" && date >= seasonStart && date <= now;
  }).reduce((sum, session) => sum + session.duration, 0);
  const durationLabel = `${Math.floor(durationMinutes / 60)} h ${String(durationMinutes % 60).padStart(2, "0")}`;

  function resetFilters() {
    setSearch("");
    setType("all");
    setStatus("all");
    setMonth("all");
  }

  return <div className="athlete-history-page" id="all-sessions">
    <div className="athlete-history-stats">
      <section><span className="athlete-icon-box"><CalendarDays className="h-4 w-4"/></span><div><small>Séances complétées</small><b>{attendance.total - attendance.absent} <i>/ {attendance.total}</i></b><em>{attendance.total ? `${Math.max(0, 100 - attendance.rate)}% cette saison` : "cette saison"}</em></div><strong>{attendance.total ? `${Math.max(0, 100 - attendance.rate)}%` : "—"}</strong></section>
      <section><span className="athlete-icon-box"><span className="athlete-history-bars">▮</span></span><div><small>Volume d’entraînement</small><b>{totalVolume}</b><em>répétitions cumulées</em></div></section>
      <section><span className="athlete-icon-box"><CalendarDays className="h-4 w-4"/></span><div><small>Temps d’entraînement</small><b>{durationLabel}</b><em>cette saison</em></div></section>
    </div>

    <section className="athlete-history-panel">
      <div className="athlete-history-toolbar">
        <label className="athlete-history-search"><Search className="h-4 w-4"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher une séance…" aria-label="Rechercher une séance"/></label>
        <div className="athlete-history-filters">
          <select aria-label="Filtrer par type" value={type} onChange={(event) => setType(event.target.value)}><option value="all">Tous les types</option>{types.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <select aria-label="Filtrer par statut" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Tous les statuts</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <select aria-label="Filtrer par mois" value={month} onChange={(event) => setMonth(event.target.value)}><option value="all">Tous les mois</option>{months.map((value) => <option key={value} value={value}>{new Intl.DateTimeFormat("fr-CA", { month: "long", year: "numeric" }).format(new Date(`${value}-15T12:00:00`))}</option>)}</select>
          <button type="button" onClick={resetFilters}><RotateCcw className="h-3.5 w-3.5"/> Réinitialiser</button>
        </div>
      </div>

      <header className="athlete-history-heading"><h2>Historique des séances <span>(plus récentes en premier)</span></h2><Link href="/coach/sessions/new"><Plus className="h-4 w-4"/> Ajouter une séance</Link></header>
      <div className="athlete-history-table-wrap"><table className="athlete-history-table"><thead><tr><th>Date</th><th>Statut</th><th>Volume</th><th>Notes entraîneur</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
        {filtered.map((session) => <tr key={session.id}>
          <td>{formatMontrealDate(new Date(session.date), { day: "numeric", month: "short", year: "numeric" })}</td>
          <td><span className={`athlete-history-status status-${session.status.toLowerCase()}`}>{statusLabels[session.status] ?? session.status}</span></td>
          <td>{session.volume || "—"}</td>
          <td>{session.coachNote || "—"}</td>
          <td><Link className="athlete-history-open" href={demo ? "/coach/sessions/demo" : `/coach/sessions/${session.id}`} aria-label={`Ouvrir ${session.title}`}><MoreHorizontal className="h-4 w-4"/></Link></td>
        </tr>)}
        {filtered.length === 0 && <tr><td colSpan={5} className="athlete-history-no-results">Aucune séance ne correspond à ces filtres.</td></tr>}
      </tbody></table></div>
    </section>
  </div>;
}
