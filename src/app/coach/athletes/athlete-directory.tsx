"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { AthleteActionsMenu } from "@/app/coach/athletes/athlete-actions-menu";
import type { AthleteRow } from "@/app/coach/athletes/page";
import { StatusPill } from "@/components/training/status-pill";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatMontrealDate } from "@/lib/timezone";

export function AthleteDirectory({ rows, groups, demo = false }: { rows: AthleteRow[]; groups: Array<{ id: string; name: string }>; demo?: boolean }) {
  const [search, setSearch] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [selectedLevel, setSelectedLevel] = useState("");
  const groupNames = useMemo(() => [...new Set(rows.map((row) => row.groupName))].sort((a, b) => a.localeCompare(b, "fr")), [rows]);
  const levels = useMemo(() => [...new Set(rows.map((row) => row.level))].sort((a, b) => a.localeCompare(b, "fr")), [rows]);
  const normalizedSearch = search.trim().toLocaleLowerCase("fr-CA");
  const visibleRows = rows.filter((row) => {
    const matchesSearch = !normalizedSearch || `${row.firstName} ${row.lastName} ${row.level} ${row.groupName}`.toLocaleLowerCase("fr-CA").includes(normalizedSearch);
    return matchesSearch && (!selectedGroup || row.groupName === selectedGroup) && (!selectedLevel || row.level === selectedLevel);
  });

  if (rows.length === 0) {
    return <EmptyState title="Aucun athlète dans ce club" description="Crée un compte athlète pour démarrer la planification." />;
  }

  return (
    <Card className="athlete-list-card overflow-hidden">
      <CardHeader className="athlete-list-heading border-b border-[var(--color-border)] bg-white">
        <div className="athlete-list-controls w-full">
          <label className="athlete-search"><span className="sr-only">Rechercher un athlète</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un athlète…" /></label>
          <select aria-label="Filtrer par groupe" value={selectedGroup} onChange={(event) => setSelectedGroup(event.target.value)}>
            <option value="">Tous les groupes</option>
            {groupNames.map((group) => <option key={group} value={group}>{group}</option>)}
          </select>
          <select aria-label="Filtrer par niveau" value={selectedLevel} onChange={(event) => setSelectedLevel(event.target.value)}>
            <option value="">Tous les niveaux</option>
            {levels.map((level) => <option key={level} value={level}>{level}</option>)}
          </select>
          <span className="self-center text-xs font-semibold text-[var(--color-ink-muted)]">{visibleRows.length} / {rows.length} athlètes</span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="hidden grid-cols-[minmax(15rem,1.3fr)_minmax(7rem,.7fr)_minmax(13rem,1fr)_minmax(11rem,1fr)_6rem_9rem_7rem] border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] px-5 py-3 text-xs font-black uppercase text-[var(--color-ink-muted)] lg:grid">
          <span>Athlète</span><span>Groupe</span><span>Prochaine séance</span><span>Activité</span><span className="text-right">Volume</span><span className="text-right">Moy. / séance</span><span className="text-right">Actions</span>
        </div>
        {visibleRows.length > 0 ? <div className="divide-y divide-[var(--color-border)]">
          {visibleRows.map((row) => (
            <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 p-4 transition duration-[var(--duration-fast)] hover:bg-[var(--color-surface-raised)] lg:grid-cols-[minmax(15rem,1.3fr)_minmax(7rem,.7fr)_minmax(13rem,1fr)_minmax(11rem,1fr)_6rem_9rem_7rem] lg:px-5">
              <div className="min-w-0"><Identity row={row} /></div>
              <div className="lg:hidden"><Badge variant={row.active ? "success" : "outline"}>{row.active ? "Actif" : "Inactif"}</Badge></div>
              <div className="col-span-2 lg:col-span-1"><Badge variant="outline">{row.groupName}</Badge></div>
              <div className="col-span-2 lg:col-span-1"><NextSession nextSession={row.nextSession} demo={demo} /></div>
              <div className="col-span-2 lg:col-span-1"><ActivitySummary row={row} /></div>
              <div className="athlete-volume"><span className="mr-2 text-xs font-bold text-[var(--color-ink-muted)] lg:hidden">Volume</span><strong>{row.volume}</strong><i style={{ "--volume": `${Math.max(10, Math.min(100, row.volume / Math.max(...visibleRows.map((item) => item.volume), 1) * 100))}%` } as CSSProperties} /></div>
              <div className="text-lg font-black lg:text-right"><span className="mr-2 text-xs font-bold text-[var(--color-ink-muted)] lg:hidden">Moyenne</span>{row.averageVolume === null ? "—" : row.averageVolume.toFixed(1)}</div>
              <div className="col-span-2 lg:col-span-1 lg:text-right"><AthleteActionsMenu athlete={row} groups={groups} demo={demo} /></div>
            </div>
          ))}
        </div> : <p className="p-6 text-sm font-semibold text-[var(--color-ink-muted)]">Aucun athlète ne correspond à ces filtres.</p>}
      </CardContent>
    </Card>
  );
}

function Identity({ row }: { row: AthleteRow }) {
  return <div className="flex min-w-0 items-center gap-3"><Avatar className="h-11 w-11 border border-[var(--color-border)]"><AvatarImage src={row.avatar ?? undefined} /><AvatarFallback>{row.firstName[0]}{row.lastName[0]}</AvatarFallback></Avatar><div className="min-w-0"><Link href={`/coach/athletes/${row.id}`} className="block truncate font-black text-[var(--color-ink)] hover:text-[var(--color-brand-strong)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">{row.firstName} {row.lastName}</Link><div className="truncate text-xs font-bold text-[var(--color-ink-muted)]">{row.level}</div></div></div>;
}

function NextSession({ nextSession, demo }: { nextSession?: AthleteRow["nextSession"]; demo?: boolean }) {
  if (!nextSession) return <span className="text-sm font-semibold text-[var(--color-ink-soft)]">Aucune séance publiée</span>;
  return <div className="space-y-1"><Link href={demo ? "/coach/sessions/demo" : `/coach/sessions/${nextSession.id}`} className="font-black text-[var(--color-ink)] hover:text-[var(--color-brand-strong)]">{nextSession.title}</Link><div className="flex items-center gap-2 text-xs font-bold text-[var(--color-ink-muted)]">{formatMontrealDate(nextSession.date, { weekday: "short", day: "2-digit", month: "short" })}<StatusPill status={nextSession.status} className="min-h-6 px-2" /></div></div>;
}

function ActivitySummary({ row }: { row: AthleteRow }) {
  return <div className="space-y-1"><div className="font-black text-[var(--color-ink)]">{row.completedSessions} séances complétées</div><div className="text-xs font-bold text-[var(--color-ink-muted)]">{row.lastActivity ?? "Aucun historique disponible"}</div></div>;
}
