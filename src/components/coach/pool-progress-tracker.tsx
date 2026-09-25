"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, Circle, Waves } from "lucide-react";
import { countPoolContexts } from "@/lib/pool-list";

type Athlete = { id: string; firstName: string; lastName: string };
type Dive = { id: string; diveCode: string; repetitions: number };

export function PoolProgressRefresh({ enabled }: { enabled: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => router.refresh(), 10000);
    return () => window.clearInterval(timer);
  }, [enabled, router]);

  return null;
}

export function PoolProgressTracker({
  athletes,
  dives,
  logs,
  sectionLabel,
  showLegend = true
}: {
  athletes: Athlete[];
  dives: Dive[];
  logs: Array<{ athleteId: string; poolDiveId: string; repetitionsCompleted: number; goldenRepetitions?: number }>;
  sectionLabel: string;
  showLegend?: boolean;
}) {
  const multiplier = Math.max(1, countPoolContexts(sectionLabel));

  return (
    <div className="mt-4 space-y-3">
      {showLegend && <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-bold text-[var(--color-ink-muted)]">
        <span className="font-black uppercase tracking-wide text-[var(--color-ink)]">Progression par athlete</span>
        <Legend color="bg-[var(--color-success)]" label="Termine" />
        <Legend color="bg-[var(--color-brand-strong)]" label="En cours" />
        <Legend color="bg-[var(--color-border)]" label="A venir" />
        <Legend color="bg-amber-400" label="Golden rep" />
      </div>}
      <details>
      <summary className="cursor-pointer text-xs font-bold text-[var(--color-ink-muted)]">Progression par athlète ({athletes.length})</summary>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {athletes.map((athlete) => {
          const athleteLogs = new Map(logs.filter((log) => log.athleteId === athlete.id).map((log) => [log.poolDiveId, log.repetitionsCompleted]));
          const loggedDiveIds = new Set(logs.filter((log) => log.athleteId === athlete.id).map((log) => log.poolDiveId));
          const skippedDiveIds = new Set(dives.filter((dive) => loggedDiveIds.has(dive.id) && (athleteLogs.get(dive.id) ?? 0) === 0).map((dive) => dive.id));
          const nextIndex = dives.findIndex((dive) => (athleteLogs.get(dive.id) ?? 0) < dive.repetitions * multiplier);
          const complete = nextIndex === -1;
          const progress = dives.reduce((sum, dive) => sum + Math.min(athleteLogs.get(dive.id) ?? 0, dive.repetitions * multiplier), 0);
          const partial = !complete && (progress > 0 || skippedDiveIds.size > 0);
          const planned = dives.reduce((sum, dive) => sum + dive.repetitions * multiplier, 0);

          return (
            <section key={athlete.id} className="rounded-2xl border border-[var(--color-border)] bg-white p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-black">{athlete.firstName} {athlete.lastName}</span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-black ${complete ? "bg-[var(--color-success-soft)] text-[var(--color-success)]" : partial ? "bg-[var(--block-pool-bg)] text-[var(--color-brand-strong)]" : "bg-[var(--color-surface-raised)] text-[var(--color-ink-muted)]"}`}>
                  {complete ? <Check className="h-3.5 w-3.5" /> : partial ? <Waves className="h-3.5 w-3.5" /> : <Circle className="h-3 w-3" />}
                  {complete ? "Termine" : partial ? "Partiel" : "A venir"}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {dives.map((dive, index) => {
                  const done = (athleteLogs.get(dive.id) ?? 0) >= dive.repetitions * multiplier;
                  const current = !complete && index === nextIndex && (athleteLogs.get(dive.id) ?? 0) > 0;
                  const skipped = skippedDiveIds.has(dive.id);
                  const golden = logs.find((log) => log.athleteId === athlete.id && log.poolDiveId === dive.id)?.goldenRepetitions ?? 0;
                  const className = golden > 0
                    ? "border-amber-400 bg-amber-100 text-amber-900"
                    : done
                    ? "border-[var(--color-success)] bg-[var(--color-success-soft)] text-[var(--color-success)]"
                    : current
                      ? "border-[var(--color-brand-strong)] bg-[var(--block-pool-bg)] text-[var(--color-brand-strong)] ring-2 ring-[var(--color-brand-strong)]/20"
                      : "border-[var(--color-border)] bg-[var(--color-surface-raised)] text-[var(--color-ink-muted)]";
                  const count = athleteLogs.get(dive.id) ?? 0;
                  const expected = dive.repetitions * multiplier;

                  return <span key={dive.id} title={`${dive.diveCode}: ${count}/${expected} repetitions`} className={`inline-flex flex-col items-start rounded-lg border px-2 py-1 text-xs font-black ${className}`}>
                    <span className="inline-flex items-center gap-1">{golden > 0 ? "★" : done && <Check className="h-3 w-3" />}{dive.diveCode}</span>
                    <span className="font-semibold">{count}/{expected}{skipped ? " · Partiel" : golden > 0 ? ` · ${golden} gold` : ""}</span>
                  </span>;
                })}
              </div>
              <p className="mt-2 text-xs font-semibold text-[var(--color-ink-muted)]">{progress}/{planned} repetitions consignées</p>
            </section>
          );
        })}
      </div>
      </details>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${color}`} />{label}</span>;
}
