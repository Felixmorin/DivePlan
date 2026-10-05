import { Award, Medal, Trophy } from "lucide-react";
import { CoachShell } from "@/components/coach/coach-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MilestonePreviewButton } from "@/components/coach/milestone-preview-button";
import { requireCoach } from "@/lib/current-user";
import { query } from "@/lib/db";
import { MILESTONES } from "@/lib/milestones";
import { getClubMilestones } from "@/lib/milestone-data";
import { saveMilestoneText } from "./actions";

export const dynamic = "force-dynamic";

type AwardRow = { key: string; athleteId: string; firstName: string; lastName: string; groupName: string | null; awardedAt: Date };

export default async function CoachMilestonesPage() {
  const { clubId } = await requireCoach();
  const isDemo = clubId === "dev-club";
  const [result, milestones] = await Promise.all([
    isDemo ? Promise.resolve(null) : query<AwardRow>(
      `SELECT m.key, a.id AS "athleteId", u."firstName", u."lastName", g.name AS "groupName", m."awardedAt"
     FROM "AthleteMilestone" m JOIN "Athlete" a ON a.id = m."athleteId"
     JOIN "User" u ON u.id = a."userId" LEFT JOIN "TrainingGroup" g ON g.id = a."groupId"
       WHERE a."clubId" = $1 ORDER BY m."awardedAt" DESC, u."lastName", u."firstName"`, [clubId]
    ),
    getClubMilestones(clubId)
  ]);
  const awards = result?.rows ?? [];

  return <CoachShell active="Milestones">
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-black uppercase tracking-[.18em] text-[var(--color-brand-strong)]">Progression des athlètes</p>
      <h1 className="mt-1 text-3xl font-black">Milestones</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-ink-muted)]">Suis les réussites du club. Les répétitions comptabilisées sont celles réellement complétées et enregistrées par les athlètes.</p></div>
      <MilestonePreviewButton milestone={milestones.find((milestone) => milestone.key === MILESTONES.repetitions500.key)!} />
    </header>
    <div className="grid gap-4 xl:grid-cols-3">
      {milestones.map((milestone) => {
        const holders = awards.filter((award) => award.key === milestone.key);
        return <Card key={milestone.key} className="overflow-hidden border-[var(--color-border)]">
          <CardHeader className="pb-3">
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--color-brand)]/12 text-[var(--color-brand-strong)]">
              {milestone.key === MILESTONES.first500.key ? <Trophy className="h-5 w-5" /> : <Medal className="h-5 w-5" />}
            </div>
            <CardTitle>{milestone.title}</CardTitle>
            <CardDescription>{milestone.description}</CardDescription>
          </CardHeader>
          <CardContent>
            {isDemo ? <p className="mb-4 text-xs text-[var(--color-ink-muted)]">Modifiable avec un compte club.</p> : <form action={saveMilestoneText} className="mb-5 space-y-3 rounded-xl border border-[var(--color-border)] p-3">
              <input type="hidden" name="key" value={milestone.key} />
              <label className="block text-xs font-bold">Titre<input name="title" required maxLength={100} defaultValue={milestone.title} className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-ink)]" /></label>
              <label className="block text-xs font-bold">Description<textarea name="description" required maxLength={500} defaultValue={milestone.description} rows={3} className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-ink)]" /></label>
              <button type="submit" className="rounded-lg bg-[var(--color-brand)] px-3 py-2 text-sm font-bold text-white">Enregistrer le texte</button>
            </form>}
            <div className="mb-3 flex items-center gap-2 text-sm font-black text-[var(--color-ink)]"><Award className="h-4 w-4 text-amber-500" />{isDemo ? "1 réussite (exemple)" : `${holders.length} réussite${holders.length === 1 ? "" : "s"}`}</div>
            {holders.length ? <ul className="space-y-2">
              {holders.map((holder) => <li key={`${holder.athleteId}-${holder.key}`} className="flex items-center justify-between gap-3 rounded-xl bg-[var(--color-coach-bg)] px-3 py-2.5">
                <span className="min-w-0"><span className="block truncate text-sm font-bold">{holder.firstName} {holder.lastName}</span><span className="block truncate text-xs text-[var(--color-ink-muted)]">{holder.groupName ?? "Sans groupe"}</span></span>
                <time className="shrink-0 text-xs font-semibold text-[var(--color-ink-muted)]">{new Intl.DateTimeFormat("fr-CA", { dateStyle: "medium", timeZone: "America/Toronto" }).format(holder.awardedAt)}</time>
              </li>)}
            </ul> : isDemo ? <div className="rounded-xl bg-[var(--color-coach-bg)] px-3 py-3 text-sm font-semibold text-[var(--color-ink-muted)]">Maya Tremblay · Groupe Espoir</div> : <p className="rounded-xl bg-[var(--color-coach-bg)] px-3 py-3 text-sm font-semibold text-[var(--color-ink-muted)]">Aucun athlète ne l’a encore obtenu.</p>}
            {milestone.key === MILESTONES.first500.key && <p className="mt-3 text-xs leading-5 text-[var(--color-ink-muted)]">Premier athlète du club à atteindre 500 répétitions et à terminer sa séance.</p>}
          </CardContent>
        </Card>;
      })}
    </div>
  </CoachShell>;
}
