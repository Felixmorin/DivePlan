"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, CalendarDays, Check, CheckCircle2, ChevronDown, Clock3, FileText, Pencil, RefreshCw, Search, Settings, Shield, UserRound, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

type EventRow = { id: string; type: string; message: string; source: string; date: string; actions?: Array<{ action: string; path: string; at: string }> };
type Category = "Séances" | "Aperçus" | "Authentification" | "Athlètes" | "Système";
type Range = "24h" | "7d" | "30d" | "all";
const categories: Category[] = ["Séances", "Aperçus", "Authentification", "Athlètes", "Système"];
const ranges: Array<{ id: Range; label: string }> = [{ id: "24h", label: "24 dernières heures" }, { id: "7d", label: "7 derniers jours" }, { id: "30d", label: "30 derniers jours" }, { id: "all", label: "Toute la période" }];
const categoryStyle: Record<Category, { bg: string; fg: string }> = {
  "Séances": { bg: "bg-emerald-100", fg: "text-emerald-700" },
  "Aperçus": { bg: "bg-amber-100", fg: "text-amber-800" },
  "Authentification": { bg: "bg-sky-100", fg: "text-sky-700" },
  "Athlètes": { bg: "bg-violet-100", fg: "text-violet-700" },
  "Système": { bg: "bg-slate-200", fg: "text-slate-700" }
};

export function MonitoringJournal({ events }: { events: EventRow[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [enabled, setEnabled] = useState<Category[]>(categories);
  const [range, setRange] = useState<Range>("24h");
  const [shown, setShown] = useState(10);
  const [now, setNow] = useState(0);
  useEffect(() => {
    const refreshClock = () => setNow(Date.now());
    const initialRefresh = window.setTimeout(refreshClock, 0);
    const interval = window.setInterval(refreshClock, 60_000);
    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(interval);
    };
  }, []);
  const filtered = useMemo(() => {
    const cutoff = range === "all" || now === 0 ? 0 : now - (range === "24h" ? 24 : range === "7d" ? 24 * 7 : 24 * 30) * 60 * 60 * 1000;
    return events.filter((event) => {
      const timestamp = new Date(event.date).getTime();
      return enabled.includes(categoryFor(event.type)) && (range === "all" || (Number.isFinite(timestamp) && timestamp >= cutoff)) && `${event.message} ${event.source} ${event.type}`.toLocaleLowerCase("fr-CA").includes(search.toLocaleLowerCase("fr-CA"));
    });
  }, [events, enabled, now, range, search]);
  const visible = filtered.slice(0, shown);
  const groups = groupEvents(visible);

  return <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_296px]">
    <Card className="overflow-hidden"><CardContent className="p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="flex h-10 min-w-56 flex-1 items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 text-[var(--color-ink-muted)]"><Search className="h-4 w-4 shrink-0" /><input aria-label="Rechercher un événement" placeholder="Rechercher un événement..." value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-muted)]" /></label>
        <details className="relative"><summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 text-sm font-semibold">{enabled.length === categories.length ? "Tous les événements" : `${enabled.length} catégories`} <ChevronDown className="h-4 w-4" /></summary><div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-[var(--color-border)] bg-white p-2 shadow-lg">{categories.map((category) => { const checked = enabled.includes(category); return <button key={category} type="button" aria-pressed={checked} onClick={() => setEnabled((current) => checked ? current.filter((item) => item !== category) : [...current, category])} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-50"><span className={`flex h-4 w-4 items-center justify-center rounded border ${checked ? "border-sky-700 bg-sky-700 text-white" : "border-slate-300"}`}>{checked && <Check className="h-3 w-3" />}</span>{category}</button>; })}<button type="button" onClick={() => setEnabled(categories)} className="mt-1 w-full border-t border-slate-100 px-2 pt-2 text-left text-xs font-bold text-sky-700">Tout sélectionner</button></div></details>
        <details className="relative"><summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 text-sm font-semibold"><CalendarDays className="h-4 w-4" /> {ranges.find((item) => item.id === range)?.label} <ChevronDown className="h-4 w-4" /></summary><div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-[var(--color-border)] bg-white p-2 shadow-lg">{ranges.map((item) => <button key={item.id} type="button" aria-pressed={range === item.id} onClick={(event) => { setRange(item.id); event.currentTarget.closest("details")?.removeAttribute("open"); setShown(10); }} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50">{item.label}{range === item.id && <Check className="h-4 w-4 text-sky-700" />}</button>)}</div></details>
        <button type="button" onClick={() => router.refresh()} aria-label="Actualiser les événements" title="Actualiser" className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--color-border)] bg-white hover:bg-slate-50"><RefreshCw className="h-4 w-4" /></button>
      </div>
      <div className="divide-y divide-[var(--color-border)]">
        {groups.length ? groups.map(([day, dayEvents]) => <section key={day}>
          <h2 className="border-b border-[var(--color-border)] py-3 text-lg font-black">{day}</h2>
          {dayEvents.map((event) => <EventItem key={event.id} event={event} />)}
        </section>) : <div className="py-16 text-center"><Activity className="mx-auto mb-3 h-7 w-7 text-slate-400" /><p className="font-bold">Aucun événement trouvé</p><p className="mt-1 text-sm text-[var(--color-ink-muted)]">Modifiez la recherche ou les filtres.</p></div>}
      </div>
      {filtered.length > shown && <button type="button" onClick={() => setShown((count) => count + 10)} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-100 text-sm font-bold hover:bg-slate-200"><Clock3 className="h-4 w-4" /> Afficher les événements précédents <ChevronDown className="h-4 w-4" /></button>}
    </CardContent></Card>

    <Card><CardContent className="p-4"><h2 className="mb-3 text-sm font-black">Filtrer par type d’événement</h2><div className="space-y-2">{categories.map((category) => { const checked = enabled.includes(category); const style = categoryStyle[category]; return <button key={category} type="button" aria-pressed={checked} onClick={() => setEnabled((current) => checked ? current.filter((item) => item !== category) : [...current, category])} className="flex w-full items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-left text-sm font-semibold hover:bg-slate-100"><span className={`flex h-5 w-5 items-center justify-center rounded border ${checked ? "border-sky-700 bg-sky-700 text-white" : "border-slate-300 bg-white"}`}>{checked && <Check className="h-3.5 w-3.5" />}</span><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${style.bg} ${style.fg}`}><CategoryIcon category={category} className="h-5 w-5" /></span>{category}</button>; })}</div></CardContent></Card>
  </div>;
}

function EventItem({ event }: { event: EventRow }) {
  const category = categoryFor(event.type); const style = categoryStyle[category];
  const date = new Date(event.date);
  const time = Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("fr-CA", { timeZone: "America/Toronto", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
  return <article className="border-b border-[var(--color-border)] py-3 last:border-b-0"><div className="flex items-center gap-3 sm:gap-4"><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${style.bg} ${style.fg}`}><EventIcon type={event.type} className="h-5 w-5" /></span><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-bold">{event.message}</h3><p className="mt-1 truncate text-xs text-[var(--color-ink-muted)]">{time && `${time}  ·  `}{event.source} <span className="px-1">·</span> {event.type}</p></div><span className={`hidden shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold sm:inline-flex ${style.bg} ${style.fg}`}>{category}</span></div>{event.type === "athlete.visit" && <details className="ml-14 mt-2"><summary className="w-fit cursor-pointer text-xs font-bold text-sky-700">Voir les actions ({event.actions?.length ?? 0})</summary><ol className="mt-2 space-y-1 border-l-2 border-sky-100 pl-3">{event.actions?.map((action, index) => <li key={`${event.id}-${index}`} className="text-xs text-[var(--color-ink-muted)]"><span className="font-semibold text-[var(--color-ink)]">{action.action}</span><span className="ml-2">{action.path}</span></li>)}{!event.actions?.length && <li className="text-xs text-[var(--color-ink-muted)]">Aucune action enregistrée.</li>}</ol></details>}</article>;
}

function categoryFor(type: string): Category {
  if (type === "athlete.visit") return "Athlètes";
  if (type === "session.previewed" || type.includes("preview")) return "Aperçus";
  if (type.startsWith("auth.")) return "Authentification";
  if (type.startsWith("session.") || type.includes("training")) return "Séances";
  if (type.startsWith("athlete.")) return "Athlètes";
  return "Système";
}
function CategoryIcon({ category, className }: { category: Category; className?: string }) {
  if (category === "Séances") return <CheckCircle2 className={className} />;
  if (category === "Aperçus") return <FileText className={className} />;
  if (category === "Authentification") return <UserRound className={className} />;
  if (category === "Athlètes") return <Users className={className} />;
  return <Settings className={className} />;
}

function EventIcon({ type, className }: { type: string; className?: string }) {
  if (type.includes("failed") || type.includes("security")) return <Shield className={className} />;
  if (type.includes("session") && (type.includes("complete") || type.includes("finished"))) return <CheckCircle2 className={className} />;
  if (type.includes("session") && (type.includes("update") || type.includes("edit"))) return <Pencil className={className} />;
  return <CategoryIcon category={categoryFor(type)} className={className} />;
}
function groupEvents(events: EventRow[]): Array<[string, EventRow[]]> {
  const result = new Map<string, EventRow[]>(); const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const yesterdayDate = new Date(now); yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(yesterdayDate);
  for (const event of events) { const date = new Date(event.date); const key = Number.isNaN(date.getTime()) ? "Date inconnue" : new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(date); const label = key === today ? "Aujourd’hui" : key === yesterday ? "Hier" : key === "Date inconnue" ? key : new Intl.DateTimeFormat("fr-CA", { timeZone: "America/Toronto", day: "numeric", month: "long" }).format(date); result.set(label, [...(result.get(label) ?? []), event]); }
  return [...result.entries()];
}
