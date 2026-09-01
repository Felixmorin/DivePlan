import Link from "next/link";
import type { BlockType, CompletionStatus, SessionStatus } from "@prisma/client";
import { CalendarPlus, Clock3, Edit, Printer, Users, Waves } from "lucide-react";
import { CoachShell } from "@/components/coach/coach-shell";
import { BlockTypeBadge } from "@/components/training/block-type-badge";
import { StatusPill } from "@/components/training/status-pill";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { demoSession, weekSessions } from "@/lib/data";
import { requireCoach } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PlanningSession = {
  id: string;
  title: string;
  focus: string;
  date: Date;
  duration: number;
  status: SessionStatus | string;
  blocks: Array<{ type: BlockType | string; estimatedVolume: number; assignments: Array<{ athleteId: string }> }>;
  completions: Array<{ status: CompletionStatus | string }>;
};

export default async function PlanningPage() {
  const { clubId } = await requireCoach();
  if (clubId === "dev-club") {
    return <DemoPlanningPage />;
  }

  const today = new Date();
  const weekStart = startOfWeek(today);
  const weekEnd = addDays(weekStart, 7);
  const rawSessions = await prisma.trainingSession.findMany({
    where: { week: { clubId }, date: { gte: weekStart, lt: weekEnd } },
    orderBy: { date: "asc" },
    include: {
      blocks: { orderBy: { position: "asc" }, include: { assignments: true } },
      completions: true
    }
  });
  const sessions: PlanningSession[] = rawSessions.map((session) => ({
    id: session.id,
    title: session.title,
    focus: session.focus,
    date: session.date,
    duration: session.duration,
    status: session.status,
    blocks: session.blocks,
    completions: session.completions
  }));

  return <PlanningView weekStart={weekStart} sessions={sessions} />;
}

function DemoPlanningPage() {
  const weekStart = startOfWeek(new Date());
  const sessions = weekSessions.filter((session) => session.title).map((session, index) => ({
    id: index === 1 ? "demo" : `demo-${index}`,
    title: session.title,
    focus: session.focus,
    date: addDays(weekStart, index),
    duration: session.duration,
    status: session.status === "Brouillon" ? "DRAFT" : session.status === "Complete" ? "COMPLETED" : "READY",
    blocks: demoSession.blocks.map((block) => ({ type: block.type, estimatedVolume: block.volume, assignments: block.assignedTo.map((athleteId) => ({ athleteId })) })),
    completions: []
  })) satisfies PlanningSession[];

  return <PlanningView weekStart={weekStart} sessions={sessions} demo />;
}

function PlanningView({ weekStart, sessions, demo = false }: { weekStart: Date; sessions: PlanningSession[]; demo?: boolean }) {
  const activeSessionIds = new Set(sessions.filter((session) => session.completions.some((completion) => completion.status === "IN_PROGRESS")).map((session) => session.id));
  const stats = {
    draft: sessions.filter((session) => session.status === "DRAFT").length,
    ready: sessions.filter((session) => session.status === "READY").length,
    completed: sessions.filter((session) => session.status === "COMPLETED").length,
    inProgress: activeSessionIds.size
  };

  return (
    <CoachShell active="Planning">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-black uppercase text-[var(--color-brand-strong)]">Planning hebdomadaire</p>
          <h1 className="mt-2 text-3xl font-black">Semaine du {weekStart.toLocaleDateString("fr-CA")}</h1>
          <p className="mt-1 text-[var(--color-ink-muted)]">Vue par jour, statuts de publication et volume disponible.</p>
        </div>
        <Button asChild variant="action"><Link href={demo ? "/coach/sessions/demo" : "/coach/sessions/new"}><CalendarPlus className="h-4 w-4" /> {demo ? "Voir la demo" : "Nouvelle séance"}</Link></Button>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <PlanningStat label="Brouillons" value={stats.draft} tone="draft" />
        <PlanningStat label="Publiées" value={stats.ready} tone="ready" />
        <PlanningStat label="En cours" value={stats.inProgress} tone="active" />
        <PlanningStat label="Terminées" value={stats.completed} tone="done" />
      </div>

      {sessions.length === 0 ? (
        <EmptyState title="Aucune séance cette semaine" description="Ajoute une séance pour commencer la planification hebdomadaire." action={<Button asChild variant="action"><Link href="/coach/sessions/new">Créer une séance</Link></Button>} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-7">
          {weekDays(weekStart).map((day) => (
            <DayColumn key={day.key} day={day} sessions={sessions.filter((session) => sameDay(session.date, day.date))} activeSessionIds={activeSessionIds} demo={demo} />
          ))}
        </div>
      )}
    </CoachShell>
  );
}

function DayColumn({ day, sessions, activeSessionIds, demo }: { day: { key: number; label: string; date: Date }; sessions: PlanningSession[]; activeSessionIds: Set<string>; demo: boolean }) {
  return (
    <Card className="min-h-0 lg:min-h-96">
      <CardContent className="p-4">
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-[var(--color-border)] pb-3">
          <div>
            <div className="text-lg font-black lg:text-base">{day.label}</div>
            <div className="text-xs font-bold text-[var(--color-ink-soft)]">{day.date.toLocaleDateString("fr-CA", { day: "2-digit", month: "short" })}</div>
          </div>
          <span className="rounded-full bg-[var(--color-surface-raised)] px-2.5 py-1 text-xs font-black text-[var(--color-ink-muted)]">{sessions.length || "Repos"}</span>
        </div>

        <div className="space-y-3">
          {sessions.map((session) => <PlanningSessionCard key={session.id} session={session} active={activeSessionIds.has(session.id)} demo={demo} />)}
          {sessions.length === 0 && (
            <div className="rounded-2xl border border-dashed border-[var(--color-border-strong)] p-4">
              <div className="text-sm font-black text-[var(--color-ink-muted)]">Jour libre</div>
              <Link href="/coach/sessions/new" className="mt-2 inline-flex min-h-11 items-center text-sm font-black text-[var(--color-brand-strong)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">Préparer une séance</Link>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PlanningSessionCard({ session, active, demo }: { session: PlanningSession; active: boolean; demo: boolean }) {
  const status = active ? "IN_PROGRESS" : session.status;
  const href = demo ? "/coach/sessions/demo" : `/coach/sessions/${session.id}`;
  const editHref = demo ? "/coach/sessions/demo/edit" : `/coach/sessions/${session.id}/edit`;
  const printHref = demo ? "/coach/sessions/demo/print" : `/coach/sessions/${session.id}/print`;
  const athleteCount = uniqueAssignedIds(session.blocks).length;
  const volume = session.blocks.reduce((sum, block) => sum + block.estimatedVolume, 0);

  return (
    <article className={`rounded-2xl border p-3 transition duration-[var(--duration-fast)] hover:-translate-y-0.5 ${statusTone(status)}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusPill status={String(status)} />
        <span className="text-xs font-bold text-[var(--color-ink-soft)]">{session.date.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      <Link href={href} className="mt-3 block font-black leading-tight hover:text-[var(--color-brand-strong)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">{session.title}</Link>
      <p className="mt-1 text-sm leading-5 text-[var(--color-ink-muted)]">{session.focus}</p>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs font-bold text-[var(--color-ink-muted)]">
        <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> {session.duration}</span>
        <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {athleteCount}</span>
        <span className="inline-flex items-center gap-1"><Waves className="h-3.5 w-3.5" /> {volume}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">{uniqueBlockTypes(session.blocks).map((type) => <BlockTypeBadge key={String(type)} type={String(type)} className="px-2" />)}</div>
      <div className="mt-4 flex gap-2">
        <Button asChild size="sm" variant="outline"><Link href={editHref}><Edit className="h-4 w-4" /> Modifier</Link></Button>
        <Button asChild size="icon" variant="outline" className="h-9 min-h-9 w-9" aria-label="Imprimer"><Link href={printHref}><Printer className="h-4 w-4" /></Link></Button>
      </div>
    </article>
  );
}

function PlanningStat({ label, value, tone }: { label: string; value: number; tone: "draft" | "ready" | "active" | "done" }) {
  const tones = {
    draft: "bg-[var(--block-dryland-bg)] text-[var(--block-dryland-fg)]",
    ready: "bg-[var(--block-pool-bg)] text-[var(--block-pool-fg)]",
    active: "bg-[var(--color-action)] text-white",
    done: "bg-[var(--color-success-soft)] text-[var(--color-success)]"
  };

  return <div className={`rounded-2xl p-4 ${tones[tone]}`}><div className="text-xs font-black uppercase opacity-75">{label}</div><div className="mt-2 text-3xl font-black">{value}</div></div>;
}

function statusTone(status: SessionStatus | string) {
  if (status === "DRAFT") return "border-[var(--block-dryland-fg)]/20 bg-[var(--block-dryland-bg)]/45";
  if (status === "IN_PROGRESS") return "border-[var(--color-action)] bg-white";
  if (status === "COMPLETED") return "border-[var(--color-success)]/25 bg-[var(--color-success-soft)]/55";
  return "border-[var(--block-pool-fg)]/20 bg-[var(--block-pool-bg)]/45";
}

function uniqueAssignedIds(blocks: PlanningSession["blocks"]) {
  return Array.from(new Set(blocks.flatMap((block) => block.assignments.map((assignment) => assignment.athleteId))));
}

function uniqueBlockTypes(blocks: PlanningSession["blocks"]) {
  return Array.from(new Set(blocks.map((block) => block.type)));
}

function startOfWeek(date: Date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - day + 1);
  return copy;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function sameDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

function weekDays(weekStart: Date) {
  return ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"].map((label, index) => ({ key: index + 1, label, date: addDays(weekStart, index) }));
}
