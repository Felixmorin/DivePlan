import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock3, History } from "lucide-react";
import { AthleteShell } from "@/components/athlete/athlete-shell";
import { StatusPill } from "@/components/training/status-pill";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getAthleteRecentCompletions, getCurrentAthlete } from "@/lib/athlete-session";

export const dynamic = "force-dynamic";

export default async function AthleteWeekPage() {
  const athlete = await getCurrentAthlete();
  if (!athlete) {
    redirect("/login");
  }

  const completions = await getAthleteRecentCompletions(athlete.id);

  return (
    <AthleteShell>
      <div className="mb-5">
        <p className="text-sm font-black uppercase text-[var(--color-brand)]">Historique</p>
        <h1 className="mt-2 text-3xl font-black">Tes séances</h1>
      </div>
      <div className="space-y-3">
        {completions.map((completion) => (
          <Link key={completion.sessionId} href={`/athlete/session/${completion.sessionId}`} className="block rounded-[var(--radius-panel)] border border-white/10 bg-[var(--color-athlete-panel)] p-4 transition duration-[var(--duration-fast)] hover:border-[var(--color-brand)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-xl font-black">{completion.title}</h2>
                <p className="mt-1 text-sm leading-6 text-white/62">{completion.focus}</p>
              </div>
              <StatusPill status={completion.status} />
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs font-bold text-white/45">
              <Clock3 className="h-4 w-4" />
              {completion.duration} min - {completion.completedAt ? new Date(completion.completedAt).toLocaleDateString("fr-CA", { day: "2-digit", month: "short" }) : "En cours"}
            </div>
          </Link>
        ))}
        {completions.length === 0 && (
          <EmptyState
            className="border-white/10 bg-white/6"
            title="Aucune séance enregistrée"
            description="Commence ta prochaine séance pour créer ton historique."
            action={<Button asChild variant="action"><Link href="/athlete"><History className="h-4 w-4" /> Aujourd&apos;hui</Link></Button>}
          />
        )}
      </div>
    </AthleteShell>
  );
}
