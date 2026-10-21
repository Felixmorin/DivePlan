"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, CalendarDays, Check, CheckCircle2, ChevronDown, Clock3, FileText, Pencil, RefreshCw, Search, Settings, Shield, UserRound, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

type EventRow = { id: string; type: string; message: string; source: string; date: string };
type Category = "Séances" | "Aperçus" | "Authentification" | "Athlètes" | "Système";
const categories: Category[] = ["Séances", "Aperçus", "Authentification", "Athlètes", "Système"];
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
  const [shown, setShown] = useState(10);
  const filtered = useMemo(() => events.filter((event) => enabled.includes(categoryFor(event.type)) && `${event.message} ${event.source} ${event.type}`.toLocaleLowerCase("fr-CA").includes(search.toLocaleLowerCase("fr-CA"))), [events, enabled, search]);
  const visible = filtered.slice(0, shown);
  const groups = groupEvents(visible);

  return <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_296px]">
    <Card className="overflow-hidden"><CardContent className="p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="flex h-10 min-w-56 flex-1 items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 text-[var(--color-ink-muted)]"><Search className="h-4 w-4 shrink-0" /><input aria-label="Rechercher un événement" placeholder="Rechercher un événement..." value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-muted)]" /></label>
        <button type="button" onClick={() => setEnabled(enabled.length === categories.length ? [] : categories)} className="flex h-10 items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 text-sm font-semibold">{enabled.length === categories.length ? "Tous les événements" : `${enabled.length} catégories`} <ChevronDown className="h-4 w-4" /></button>
        <span className="flex h-10 items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 text-sm font-semibold"><CalendarDays className="h-4 w-4" /> 24 dernières heures <ChevronDown className="h-4 w-4" /></span>
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

    <Card><CardContent className="p-4"><h2 className="mb-3 text-sm font-black">Filtrer par type d’événement</h2><div className="space-y-2">{categories.map((category) => { const checked = enabled.includes(category); const style = categoryStyle[category]; const Icon = categoryIcon(category); return <button key={category} type="button" aria-pressed={checked} onClick={() => setEnabled((current) => checked ? current.filter((item) => item !== category) : [...current, category])} className="flex w-full items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-left text-sm font-semibold hover:bg-slate-100"><span className={`flex h-5 w-5 items-center justify-center rounded border ${checked ? "border-sky-700 bg-sky-700 text-white" : "border-slate-300 bg-white"}`}>{checked && <Check className="h-3.5 w-3.5" />}</span><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${style.bg} ${style.fg}`}><Icon className="h-5 w-5" /></span>{category}</button>; })}</div></CardContent></Card>
  </div>;
}

function EventItem({ event }: { event: EventRow }) {
  const category = categoryFor(event.type); const style = categoryStyle[category]; const Icon = eventIcon(event.type);
  const date = new Date(event.date);
  const time = Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("fr-CA", { timeZone: "America/Toronto", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
  return <article className="flex items-center gap-3 border-b border-[var(--color-border)] py-3 last:border-b-0 sm:gap-4"><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${style.bg} ${style.fg}`}><Icon className="h-5 w-5" /></span><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-bold">{event.message}</h3><p className="mt-1 truncate text-xs text-[var(--color-ink-muted)]">{time && `${time}  ·  `}{event.source} <span className="px-1">·</span> {event.type}</p></div><span className={`hidden shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold sm:inline-flex ${style.bg} ${style.fg}`}>{category}</span></article>;
}

function categoryFor(type: string): Category {
  if (type === "session.previewed" || type.includes("preview")) return "Aperçus";
  if (type.startsWith("auth.")) return "Authentification";
  if (type.startsWith("session.") || type.includes("training")) return "Séances";
  if (type.startsWith("athlete.")) return "Athlètes";
  return "Système";
}
function categoryIcon(category: Category) { return category === "Séances" ? CheckCircle2 : category === "Aperçus" ? FileText : category === "Authentification" ? UserRound : category === "Athlètes" ? Users : Settings; }
function eventIcon(type: string) { if (type.includes("failed") || type.includes("security")) return Shield; if (type.includes("session") && (type.includes("complete") || type.includes("finished"))) return CheckCircle2; if (type.includes("session") && (type.includes("update") || type.includes("edit"))) return Pencil; return categoryIcon(categoryFor(type)); }
function groupEvents(events: EventRow[]): Array<[string, EventRow[]]> {
  const result = new Map<string, EventRow[]>(); const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const yesterdayDate = new Date(now); yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(yesterdayDate);
  for (const event of events) { const date = new Date(event.date); const key = Number.isNaN(date.getTime()) ? "Date inconnue" : new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(date); const label = key === today ? "Aujourd’hui" : key === yesterday ? "Hier" : key === "Date inconnue" ? key : new Intl.DateTimeFormat("fr-CA", { timeZone: "America/Toronto", day: "numeric", month: "long" }).format(date); result.set(label, [...(result.get(label) ?? []), event]); }
  return [...result.entries()];
}
