import Form from "next/form";
import Link from "@/components/ui/app-link";
import type { AthleteHistoryPage } from "@/lib/athlete-history";
import { PAGE_SIZE, pageHref } from "@/lib/pagination";
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

export function CoachAthleteSessionHistory({ sessions, attendance, totalVolume, demo, pagination, athleteId }: {
  sessions: AthleteHistorySession[];
  pagination?: AthleteHistoryPage;
  athleteId: string;
  attendance: { absent: number; total: number; rate: number };
  totalVolume: number;
  demo: boolean;
}) {
  const durationMinutes = pagination?.minutes ?? sessions.filter(s => s.status === "COMPLETED").reduce((sum,s) => sum+s.duration,0);
  const durationLabel = `${Math.floor(durationMinutes / 60)} h ${String(durationMinutes % 60).padStart(2,"0")}`;
  const filters = pagination?.filters ?? {};
  const href = (page: number) => pageHref(`/coach/athletes/${encodeURIComponent(athleteId)}`, { tab:"history", ...filters }, page);
  return <div className="athlete-history-page" id="all-sessions">
    <div className="athlete-history-stats">
      <section><span className="athlete-icon-box"><CalendarDays className="h-4 w-4"/></span><div><small>Séances complétées</small><b>{attendance.total - attendance.absent} <i>/ {attendance.total}</i></b><em>{attendance.total ? `${Math.max(0, 100 - attendance.rate)}% cette saison` : "cette saison"}</em></div><strong>{attendance.total ? `${Math.max(0, 100 - attendance.rate)}%` : "—"}</strong></section>
      <section><span className="athlete-icon-box"><span className="athlete-history-bars">▮</span></span><div><small>Volume d’entraînement</small><b>{totalVolume}</b><em>répétitions cumulées</em></div></section>
      <section><span className="athlete-icon-box"><CalendarDays className="h-4 w-4"/></span><div><small>Temps d’entraînement</small><b>{durationLabel}</b><em>cette saison</em></div></section>
    </div>

    <section className="athlete-history-panel">
      <Form className="athlete-history-toolbar" action={`/coach/athletes/${encodeURIComponent(athleteId)}`} prefetch={false} scroll={false}>
        <input type="hidden" name="tab" value="history" />
        <label className="athlete-history-search"><Search className="h-4 w-4"/><input key={filters.q} name="q" defaultValue={filters.q ?? ""} placeholder="Rechercher une séance…" aria-label="Rechercher une séance" maxLength={150}/></label>
        <div className="athlete-history-filters">
          <select key={filters.status} name="status" aria-label="Filtrer par statut" defaultValue={filters.status ?? ""}><option value="">Tous les statuts</option>{Object.entries(statusLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
          <input key={filters.month} type="month" name="month" aria-label="Filtrer par mois" defaultValue={filters.month ?? ""}/>
          <button type="submit">Appliquer</button>
          <Link href={`/coach/athletes/${encodeURIComponent(athleteId)}?tab=history`}><RotateCcw className="h-3.5 w-3.5"/> Réinitialiser</Link>
        </div>
      </Form>

      <header className="athlete-history-heading"><h2>Historique des séances <span>(plus récentes en premier)</span></h2><Link href="/coach/sessions/new"><Plus className="h-4 w-4"/> Ajouter une séance</Link></header>
      <div className="athlete-history-table-wrap"><table className="athlete-history-table"><thead><tr><th>Date</th><th>Statut</th><th>Volume</th><th>Notes entraîneur</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
        {sessions.map((session) => <tr key={session.id}>
          <td>{formatMontrealDate(new Date(session.date), { day: "numeric", month: "short", year: "numeric" })}</td>
          <td><span className={`athlete-history-status status-${session.status.toLowerCase()}`}>{statusLabels[session.status] ?? session.status}</span></td>
          <td>{session.volume || "—"}</td>
          <td>{session.coachNote || "—"}</td>
          <td><Link className="athlete-history-open" href={demo ? "/coach/sessions/demo" : `/coach/sessions/${session.id}`} aria-label={`Ouvrir ${session.title}`}><MoreHorizontal className="h-4 w-4"/></Link></td>
        </tr>)}
        {sessions.length === 0 && <tr><td colSpan={5} className="athlete-history-no-results">Aucune séance ne correspond à ces filtres.</td></tr>}
      </tbody></table></div>
      {pagination && <nav className="flex items-center justify-between gap-3 p-4 text-sm" aria-label="Pagination de l’historique">
        {pagination.page > 1 ? <Link href={href(pagination.page-1)}>Précédent</Link> : <span/>}
        <span>Page {pagination.page} / {Math.max(1,Math.ceil(pagination.total/PAGE_SIZE))} · {pagination.total} séances</span>
        {pagination.page*PAGE_SIZE < pagination.total ? <Link href={href(pagination.page+1)}>Suivant</Link> : <span/>}
      </nav>}
    </section>
  </div>;
}
