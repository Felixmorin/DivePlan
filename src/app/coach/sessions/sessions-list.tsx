"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChartNoAxesColumnIncreasing, Clock3, MoreVertical, Search, Users } from "lucide-react";
import { deleteTrainingSession, markTrainingSessionNotDone } from "@/app/coach/sessions/actions";

export type SessionListItem = {
  id: string; title: string; groupName: string; status: "DRAFT" | "READY" | "IN_PROGRESS" | "COMPLETED" | "NOT_DONE" | "CANCELLED";
  date: Date | string; duration: number; volume: number; athleteCount: number;
};

type Tab = "upcoming" | "completed" | "drafts";

export function SessionsList({ sessions }: { sessions: SessionListItem[] }) {
  const [tab, setTab] = useState<Tab>("upcoming");
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("all");
  const [period, setPeriod] = useState("all");
  const [expanded, setExpanded] = useState(false);
  const now = new Date();
  const groups = [...new Set(sessions.map((session) => session.groupName))].sort();
  const counts = {
    upcoming: sessions.filter((s) => s.status === "READY" || s.status === "IN_PROGRESS").length,
    completed: sessions.filter((s) => s.status === "COMPLETED" || s.status === "NOT_DONE" || s.status === "CANCELLED").length,
    drafts: sessions.filter((s) => s.status === "DRAFT").length,
  };
  const filtered = useMemo(() => sessions.filter((s) => {
    const date = new Date(s.date);
    const matchesSearch = `${s.title} ${s.groupName}`.toLocaleLowerCase("fr").includes(search.toLocaleLowerCase("fr"));
    const matchesPeriod = period === "all" || (period === "month" ? date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear() : date >= new Date(now.getTime() - Number(period) * 86400000));
    return matchesSearch && (group === "all" || s.groupName === group) && matchesPeriod;
  }), [sessions, search, group, period]);
  const upcoming = filtered.filter((s) => s.status === "READY" || s.status === "IN_PROGRESS").sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const completed = filtered.filter((s) => s.status === "COMPLETED" || s.status === "NOT_DONE" || s.status === "CANCELLED").sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const drafts = filtered.filter((s) => s.status === "DRAFT").sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const next = tab === "upcoming" ? upcoming[0] : undefined;
  const historySource = tab === "upcoming" || tab === "completed" ? completed : drafts;
  const history = !expanded ? historySource.slice(0, 7) : historySource;

  return <>
    <div className="mb-7 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
      <div className="flex flex-1 flex-wrap gap-1" role="tablist" aria-label="Filtrer les séances">
        {([["upcoming", `À venir (${counts.upcoming})`], ["completed", `Terminées (${counts.completed})`], ["drafts", `Brouillons (${counts.drafts})`]] as [Tab, string][]).map(([value, label]) => <button key={value} role="tab" aria-selected={tab === value} onClick={() => { setTab(value); setExpanded(false); }} className={`min-h-11 border-b-2 px-4 text-sm font-bold transition ${tab === value ? "border-cyan-500 text-sky-700" : "border-transparent text-slate-600 hover:bg-slate-50"}`}>{label}</button>)}
      </div>
      <label className="flex min-h-10 min-w-52 flex-1 items-center gap-2 rounded-lg border border-slate-200 px-3 text-slate-500"><Search className="h-4 w-4 shrink-0" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher une séance…" className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none" /></label>
      <select value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Filtrer par groupe" className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"><option value="all">Tous les groupes</option>{groups.map((g) => <option key={g}>{g}</option>)}</select>
      <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Filtrer par période" className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"><option value="all">Toutes les dates</option><option value="month">Ce mois-ci</option><option value="30">30 derniers jours</option><option value="90">90 derniers jours</option></select>
    </div>

    {next && <section className="mb-7"><h2 className="mb-3 text-xl font-extrabold">Prochaine séance</h2><SessionRow session={next} featured /></section>}
    <section><h2 className="mb-3 text-xl font-extrabold">{tab === "drafts" ? "Brouillons" : "Historique"}</h2>
      {history.length ? <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">{history.map((s, i) => <SessionRow key={s.id} session={s} showMonth={i === 0 || monthKey(history[i - 1].date) !== monthKey(s.date)} />)}
        {historySource.length > 7 && <button onClick={() => setExpanded(!expanded)} className="m-2 w-[calc(100%-1rem)] rounded-lg bg-slate-100 py-3 text-sm font-bold text-sky-800 hover:bg-slate-200">⌄　{expanded ? "Réduire l’historique" : "Afficher les séances précédentes"}</button>}
      </div> : !(tab === "upcoming" && next) && <div className="rounded-xl border border-dashed border-slate-300 bg-white/70 px-5 py-12 text-center"><p className="font-bold">{tab === "upcoming" ? "Aucun historique pour le moment" : "Aucune séance trouvée"}</p><p className="mt-1 text-sm text-slate-500">Modifiez les filtres ou créez une nouvelle séance.</p></div>}
    </section>
  </>;
}

function monthKey(value: Date | string) { const d = new Date(value); return `${d.getFullYear()}-${d.getMonth()}`; }

function SessionRow({ session: s, featured = false, showMonth = false }: { session: SessionListItem; featured?: boolean; showMonth?: boolean }) {
  const date = new Date(s.date);
  const completed = s.status === "COMPLETED";
  const draft = s.status === "DRAFT";
  const label = completed ? "Terminée" : draft ? "Brouillon" : s.status === "NOT_DONE" ? "Non faite" : s.status === "CANCELLED" ? "Annulée" : s.status === "IN_PROGRESS" ? "En cours" : "Publiée";
  const fmtDate = new Intl.DateTimeFormat("fr-CA", { timeZone: "America/Toronto", weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(date);
  return <>
    {showMonth && <div className="border-b border-slate-200 bg-slate-100/80 px-4 py-2 text-sm font-extrabold capitalize text-slate-700">{new Intl.DateTimeFormat("fr-CA", { month: "long", year: "numeric", timeZone: "America/Toronto" }).format(date)}</div>}
    <article className={`flex flex-col gap-3 border-b border-slate-100 px-4 py-3 last:border-0 md:flex-row md:items-center md:gap-4 ${featured ? "rounded-xl border border-sky-200 bg-sky-50/40 px-5 py-4" : ""}`}>
      <span className={`inline-flex w-fit shrink-0 items-center gap-2 rounded-full px-3 py-2 text-xs font-bold ${completed ? "bg-emerald-100 text-emerald-800" : draft ? "bg-amber-100 text-amber-800" : "bg-violet-100 text-violet-800"}`}><span className="h-2 w-2 rounded-full bg-current" />{label}</span>
      <div className="min-w-0 flex-1"><h3 className="truncate font-extrabold">{s.title}</h3><p className="text-sm text-slate-500">{s.groupName}</p></div>
      <div className="grid flex-1 grid-cols-2 gap-y-2 text-xs text-slate-600 sm:grid-cols-4 md:max-w-[620px]">
        <span className="flex items-center gap-2 border-slate-200 sm:border-l sm:pl-3"><CalendarDays className="h-4 w-4 shrink-0" /><span className="capitalize">{fmtDate}</span></span>
        <span className="flex items-center gap-2 border-slate-200 sm:border-l sm:pl-3"><Clock3 className="h-4 w-4 shrink-0" />{s.duration} min</span>
        <span className="flex items-center gap-2 border-slate-200 sm:border-l sm:pl-3"><ChartNoAxesColumnIncreasing className="h-4 w-4 shrink-0" />{s.volume} plongeons</span>
        <span className="flex items-center gap-2 border-slate-200 sm:border-l sm:pl-3"><Users className="h-4 w-4 shrink-0" />{s.athleteCount} athlète{s.athleteCount > 1 ? "s" : ""}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2"><Link href={s.id.startsWith("demo-") ? "/coach/sessions/demo" : `/coach/sessions/${s.id}`} className={`inline-flex min-h-10 items-center justify-center rounded-lg px-5 text-sm font-bold ${featured ? "bg-cyan-500 text-white hover:bg-cyan-600" : "border border-slate-200 bg-white text-sky-900 hover:bg-slate-50"}`}>Ouvrir</Link>
        {!s.id.startsWith("demo-") && <details className="relative"><summary aria-label="Actions de la séance" className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"><MoreVertical className="h-4 w-4" /></summary><div className="absolute right-0 top-11 z-10 w-48 rounded-lg border border-slate-200 bg-white p-2 shadow-lg"><form action={markTrainingSessionNotDone}><input type="hidden" name="sessionId" value={s.id} /><button className="w-full rounded px-3 py-2 text-left text-sm hover:bg-slate-50">Marquer non faite</button></form><form action={deleteTrainingSession}><input type="hidden" name="sessionId" value={s.id} /><button className="w-full rounded px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50">Supprimer</button></form></div></details>}
      </div>
    </article>
  </>;
}
