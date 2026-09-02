import Link from "next/link";
import { AlertTriangle, Copy, Clock3, Eye, FileText, Printer, Save, Send, Users, Waves } from "lucide-react";
import { duplicateTrainingSession, updateTrainingSession } from "@/app/coach/sessions/actions";
import { AthleteAvatarGroup } from "@/components/coach/athlete-avatar-group";
import { CoachShell } from "@/components/coach/coach-shell";
import { BlockTypeBadge } from "@/components/training/block-type-badge";
import { StatusPill } from "@/components/training/status-pill";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getCoachSession } from "@/lib/coach-session";
import { requireCoach } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { toMontrealDateTimeInputValue } from "@/lib/timezone";

export const dynamic = "force-dynamic";

export default async function EditSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, { clubId }] = await Promise.all([params, requireCoach()]);
  const [session, athletes] = await Promise.all([
    getCoachSession(id),
    prisma.athlete.findMany({
      where: { clubId, active: true },
      orderBy: { user: { firstName: "asc" } },
      include: { user: true }
    })
  ]);
  const uniqueAthletes = athletes.map((athlete) => ({
    id: athlete.id,
    firstName: athlete.user.firstName,
    lastName: athlete.user.lastName,
    avatar: athlete.user.avatar
  }));
  const assignedIds = Array.from(new Set(session.blocks.flatMap((block) => block.assignments.map((assignment) => assignment.athleteId))));
  const unassignedBlocks = session.blocks.filter((block) => block.assignments.length === 0).length;
  const totalVolume = session.blocks.reduce((sum, block) => sum + block.estimatedVolume, 0);
  const hasStarted =
    session.completions.some((completion) => completion.startedAt || completion.status !== "NOT_STARTED") ||
    session.diveLogs.length > 0 ||
    session.exerciseLogs.length > 0;

  if (hasStarted) {
    return (
      <CoachShell active="Seances">
        <div className="mx-auto max-w-3xl">
          <Card>
            <CardHeader>
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-action)]/12 text-[var(--color-action)]">
                  <AlertTriangle className="h-5 w-5" />
                </span>
                <div>
                  <CardTitle>Modification bloquee</CardTitle>
                  <p className="mt-2 text-sm leading-6 text-[var(--color-ink-muted)]">
                    Cette seance a deja ete commencee par au moins un athlete. Pour conserver un comparatif fiable entre le prevu et le realise, la planification ne peut plus etre modifiee.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button asChild variant="outline"><Link href={`/coach/sessions/${session.id}`}><Eye className="h-4 w-4" /> Voir la seance</Link></Button>
              <form action={duplicateTrainingSession}>
                <input type="hidden" name="sessionId" value={session.id} />
                <Button type="submit" variant="action"><Copy className="h-4 w-4" /> Dupliquer pour modifier</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </CoachShell>
    );
  }

  return (
    <CoachShell active="Seances">
      <form action={updateTrainingSession} className="space-y-6">
        <input type="hidden" name="sessionId" value={session.id} />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase text-[var(--color-brand-strong)]">Builder</p>
            <h1 className="mt-2 text-3xl font-black">Modifier la seance</h1>
            <p className="mt-1 text-[var(--color-ink-muted)]">Details, contenu, volume et assignations par bloc.</p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline"><Link href={`/coach/sessions/${session.id}`}>Annuler</Link></Button>
            <Button type="submit" variant="action"><Save className="h-4 w-4" /> Enregistrer</Button>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            <Card>
              <CardHeader><CardTitle>Details</CardTitle></CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <Field label="Nom"><Input name="title" defaultValue={session.title} required /></Field>
                <Field label="Date et heure"><Input name="date" type="datetime-local" defaultValue={toMontrealDateTimeInputValue(session.date)} required /></Field>
                <Field label="Duree"><Input name="duration" type="number" defaultValue={session.duration} required /></Field>
                <Field label="Statut">
                  <select name="status" defaultValue={session.status} className="h-11 rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm font-semibold focus:outline-none focus:shadow-[var(--focus-ring)]">
                    <option value="DRAFT">Brouillon</option>
                    <option value="READY">Publiee</option>
                    <option value="COMPLETED">Terminee</option>
                  </select>
                </Field>
                <Field label="Focus" className="md:col-span-2"><Input name="focus" defaultValue={session.focus} required /></Field>
                <Field label="Notes coach" className="md:col-span-2"><Textarea name="notes" defaultValue={session.notes ?? ""} /></Field>
              </CardContent>
            </Card>

            {session.blocks.map((block, index) => {
              const assigned = new Set(block.assignments.map((assignment) => assignment.athleteId));
              const blockAssignedIds = block.assignments.map((assignment) => assignment.athleteId);

              return (
                <Card key={block.id} className="overflow-hidden">
                  <div className={`h-2 ${block.type === "DRYLAND" ? "bg-[var(--block-dryland-fg)]" : block.type === "POOL" ? "bg-[var(--block-pool-fg)]" : block.type === "COOLDOWN" ? "bg-[var(--block-cooldown-fg)]" : "bg-[var(--block-warmup-fg)]"}`} />
                  <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <BlockTypeBadge type={block.type} />
                        <CardTitle className="mt-3">{index + 1}. {block.title}</CardTitle>
                        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">{block.duration} min - {block.estimatedVolume} volume estime - {blockAssignedIds.length} athlete{blockAssignedIds.length > 1 ? "s" : ""}</p>
                      </div>
                      <AthleteAvatarGroup ids={blockAssignedIds} athletes={uniqueAthletes} limit={6} />
                    </div>
                    {blockAssignedIds.length === 0 && <div className="mt-3 flex items-start gap-2 rounded-2xl border border-[var(--color-action)]/30 bg-[var(--color-action)]/10 p-3 text-sm font-semibold text-[var(--color-action-strong)]"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Ce bloc n&apos;est assigne a personne.</div>}
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="grid gap-3 md:grid-cols-3">
                      <Input name={`blockTitle:${block.id}`} defaultValue={block.title} />
                      <Input name={`blockDuration:${block.id}`} type="number" defaultValue={block.duration} />
                      <Input name={`blockVolume:${block.id}`} type="number" defaultValue={block.estimatedVolume} />
                    </div>
                    <div>
                      <div className="mb-2 text-sm font-black text-[var(--color-ink-muted)]">Assignations du bloc</div>
                      <div className="grid gap-2 md:grid-cols-3">
                        {athletes.map((athlete) => (
                          <label key={athlete.id} className="flex min-h-12 items-center gap-2 rounded-2xl border border-[var(--color-border)] bg-white p-2 text-sm font-semibold has-[:checked]:border-[var(--color-brand)] has-[:checked]:bg-[var(--block-pool-bg)]">
                            <input type="checkbox" name={`assign:${block.id}`} value={athlete.id} defaultChecked={assigned.has(athlete.id)} />
                            {athlete.user.firstName} {athlete.user.lastName}
                          </label>
                        ))}
                      </div>
                    </div>
                    {block.drylandExercises.length > 0 && (
                      <div className="space-y-3">
                        <div className="text-sm font-black text-[var(--color-ink-muted)]">Exercices dryland</div>
                        {block.drylandExercises.map((item) => (
                          <div key={item.exerciseId} className="grid gap-3 rounded-2xl bg-[var(--color-surface-raised)] p-3 md:grid-cols-[1fr_90px_90px_110px_1fr]">
                            <div className="font-bold">{item.exercise.name}</div>
                            <Input name={`exerciseSets:${block.id}:${item.exerciseId}`} type="number" defaultValue={item.sets ?? ""} placeholder="Sets" />
                            <Input name={`exerciseReps:${block.id}:${item.exerciseId}`} type="number" defaultValue={item.reps ?? ""} placeholder="Reps" />
                            <Input name={`exerciseDuration:${block.id}:${item.exerciseId}`} type="number" defaultValue={item.duration ?? ""} placeholder="Sec" />
                            <Input name={`exerciseNotes:${block.id}:${item.exerciseId}`} defaultValue={item.notes ?? ""} placeholder="Notes" />
                          </div>
                        ))}
                      </div>
                    )}
                    {block.poolTraining?.sections.map((section) => (
                      <div key={section.id} className="space-y-3">
                        <Input name={`sectionLabel:${section.id}`} defaultValue={section.label ?? ""} />
                        {section.dives.map((dive) => (
                          <div key={dive.id} className="grid gap-3 rounded-2xl bg-[var(--color-surface-raised)] p-3 md:grid-cols-[110px_1fr_90px_1fr]">
                            <Input name={`diveCode:${dive.id}`} defaultValue={dive.diveCode} />
                            <Input name={`diveName:${dive.id}`} defaultValue={dive.diveName} />
                            <Input name={`diveReps:${dive.id}`} type="number" defaultValue={dive.repetitions} />
                            <Input name={`diveNotes:${dive.id}`} defaultValue={dive.notes ?? ""} placeholder="Notes" />
                          </div>
                        ))}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <aside className="hidden xl:block">
            <Card className="sticky top-6">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div><CardTitle>Resume</CardTitle><p className="mt-1 text-sm text-[var(--color-ink-muted)]">{session.title}</p></div>
                  <StatusPill status={session.status} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <SummaryMetric icon={Clock3} label="Duree totale" value={`${session.duration} min`} />
                <SummaryMetric icon={FileText} label="Blocs" value={session.blocks.length} />
                <SummaryMetric icon={Users} label="Athletes concernes" value={assignedIds.length} />
                <SummaryMetric icon={AlertTriangle} label="Sans assignation" value={unassignedBlocks} />
                <SummaryMetric icon={Waves} label="Volume estime" value={totalVolume} />
                <div className="rounded-2xl bg-[var(--color-surface-raised)] p-3 text-xs font-semibold text-[var(--color-ink-muted)]">Sauvegarde: changements non enregistres jusqu&apos;au bouton Enregistrer.</div>
                <div className="grid gap-2 pt-1">
                  <Button asChild variant="outline"><Link href={`/coach/sessions/${session.id}`}><Eye className="h-4 w-4" /> Apercu</Link></Button>
                  <Button asChild variant="outline"><Link href={`/coach/sessions/${session.id}/print`}><Printer className="h-4 w-4" /> Imprimer</Link></Button>
                  <Button type="submit" variant="action"><Send className="h-4 w-4" /> Enregistrer</Button>
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-border)] bg-white/95 p-3 shadow-[0_-16px_34px_rgba(7,20,35,0.12)] backdrop-blur xl:hidden">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
            <Button asChild variant="outline"><Link href={`/coach/sessions/${session.id}`}>Apercu</Link></Button>
            <Button type="submit" variant="action"><Save className="h-4 w-4" /> Enregistrer</Button>
          </div>
        </div>
      </form>
    </CoachShell>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={`grid gap-2 text-sm font-black text-[var(--color-ink-muted)] ${className ?? ""}`}><span>{label}</span>{children}</label>;
}

function SummaryMetric({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: string | number }) {
  return <div className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--color-surface-raised)] p-3"><div className="flex items-center gap-2 text-sm font-bold text-[var(--color-ink-muted)]"><Icon className="h-4 w-4 text-[var(--color-brand-strong)]" /> {label}</div><div className="font-black">{value}</div></div>;
}
