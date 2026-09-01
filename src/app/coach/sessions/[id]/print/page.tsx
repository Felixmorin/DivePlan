import { PrintButton } from "@/components/coach/print-button";
import { getCoachSession } from "@/lib/coach-session";

export const dynamic = "force-dynamic";

export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCoachSession(id);
  const athletes = Array.from(
    new Map(
      session.blocks
        .flatMap((block) => block.assignments.map((assignment) => assignment.athlete))
        .map((athlete) => [athlete.id, athlete])
    ).values()
  );
  const activeAthletes = athletes.filter((athlete) =>
    session.blocks.some((block) => block.type === "POOL" && block.assignments.some((assignment) => assignment.athleteId === athlete.id))
  );
  const commonDry = session.blocks.filter((block) => block.type === "DRYLAND" && block.assignments.length > 1);

  return (
    <div className="min-h-screen bg-[var(--color-coach-bg)] p-4 text-[var(--color-ink)] print:p-0">
      <div className="no-print mx-auto mb-4 flex max-w-6xl items-center justify-between rounded-[var(--radius-ui)] border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-card)]">
        <div><h1 className="text-xl font-black">Apercu avant impression</h1><p className="text-sm text-[var(--color-ink-muted)]">Feuille de bassin, fiche individuelle et regroupement par atelier.</p></div>
        <PrintButton />
      </div>

      <div className="mx-auto max-w-6xl overflow-x-auto pb-4 print:overflow-visible print:pb-0">
      <section className="print-page min-w-[960px] bg-white p-6 print:min-w-0">
        <header className="mb-3 border-b-2 border-black pb-2">
          <h1 className="text-2xl font-black">FEUILLE DE BASSIN · {session.title.toUpperCase()}</h1>
          <p className="text-sm">{session.date.toLocaleDateString("fr-CA")} · {session.week.group.name} · {session.duration} min</p>
        </header>
        <div className="print-block mb-3 rounded border border-black p-2">
          <h2 className="font-black">DRYLAND COMMUN</h2>
          {commonDry.length > 0 ? commonDry.map((block) => (
            <div key={block.id} className="text-sm">
              <strong>{block.assignments.map((assignment) => assignment.athlete.user.firstName).join(" · ")}</strong> · {block.drylandExercises.map((item) => `${item.exercise.name} ${item.sets ?? 1} x ${item.reps ?? `${item.duration ?? 30} sec`}`).join(" · ")}
            </div>
          )) : <p className="text-sm">Aucun bloc dryland partage.</p>}
        </div>
        <h2 className="mb-2 font-black">ENTRAINEMENTS PISCINE INDIVIDUELS</h2>
        <div className={`grid gap-2 ${activeAthletes.length > 6 ? "grid-cols-4" : "grid-cols-3"}`}>
          {activeAthletes.map((athlete) => {
            const poolBlock = session.blocks.find((block) => block.type === "POOL" && block.assignments.some((assignment) => assignment.athleteId === athlete.id));
            const sections = poolBlock?.poolTraining?.sections ?? [];
            const total = sections.flatMap((section) => section.dives).reduce((sum, dive) => sum + dive.repetitions, 0);

            return (
              <div key={athlete.id} className="print-athlete-card min-h-52 border border-black p-2 text-xs">
                <h3 className="text-base font-black">{athlete.user.firstName}</h3>
                {sections.map((section) => (
                  <div key={section.id} className="print-keep">
                    <div className="mt-1 font-black">{section.label ?? section.height}</div>
                    {section.dives.map((dive) => <div key={dive.id} className="flex justify-between"><span>□ {dive.diveCode}</span><span>x {dive.repetitions}</span></div>)}
                  </div>
                ))}
                <div className="mt-2 border-t border-black pt-1 font-black">Total {total}</div>
                <div className="mt-2 h-10 border border-dashed border-black p-1">Notes</div>
              </div>
            );
          })}
        </div>
      </section>
      </div>

      {activeAthletes.map((athlete) => {
        const blocks = session.blocks.filter((block) => block.assignments.some((assignment) => assignment.athleteId === athlete.id));
        const poolBlock = blocks.find((block) => block.type === "POOL");

        return (
          <section key={athlete.id} className="print-page mx-auto mt-4 max-w-6xl bg-white p-6 print:max-w-none">
            <h1 className="mb-3 border-b-2 border-black pb-2 text-2xl font-black">FICHE INDIVIDUELLE · {athlete.user.firstName} {athlete.user.lastName}</h1>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="print-block"><h2 className="font-black">DRYLAND</h2>{blocks.filter((block) => block.type === "DRYLAND").flatMap((block) => block.drylandExercises).map((item) => <p key={item.exerciseId}>□ {item.exercise.name} · {item.sets ?? 1} x {item.reps ?? `${item.duration ?? 30} sec`}</p>)}</div>
              <div className="print-block"><h2 className="font-black">OBJECTIFS</h2><p>{session.focus}</p><div className="mt-4 h-28 border border-black p-2">Notes</div></div>
              {poolBlock?.poolTraining?.sections.map((section) => <div key={section.id} className="print-block"><h2 className="font-black">{section.label ?? section.height}</h2>{section.dives.map((dive) => <p key={dive.id}>□ {dive.diveCode} x {dive.repetitions}</p>)}</div>)}
            </div>
          </section>
        );
      })}

      <section className="print-page mx-auto mt-4 max-w-6xl bg-white p-6 print:max-w-none">
        <h1 className="mb-3 border-b-2 border-black pb-2 text-2xl font-black">PAR ATELIER</h1>
        {session.blocks.filter((block) => ["DRYLAND", "POOL"].includes(block.type)).map((block) => (
          <div key={block.id} className="print-block mb-3 border border-black p-2">
            <h2 className="font-black">{block.title}</h2>
            <p>{block.assignments.length > 1 ? "Partage par " : "Assigne a "}{block.assignments.map((assignment) => assignment.athlete.user.firstName).join(" · ")}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
