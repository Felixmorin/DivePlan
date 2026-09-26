import { PrintButton } from "@/components/coach/print-button";
import { requireCoach } from "@/lib/current-user";
import { getCoachSession } from "@/lib/coach-session";
import { formatMontrealDate } from "@/lib/timezone";
import { countPoolContexts } from "@/lib/pool-list";

export const dynamic = "force-dynamic";

export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { coach } = await requireCoach();
  const session = await getCoachSession(id);
  const showCoachNotes = coach.printShowCoachNotes;
  const showAthleteNames = coach.printShowAthleteNames;
  const repetitionChecks = coach.printRepetitionChecks;
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
          <p className="text-sm">{formatMontrealDate(session.date)} · {session.week.group.name} · {session.duration} min</p>
          {showCoachNotes && session.notes && <p className="mt-2 text-sm">Notes du coach : {session.notes}</p>}
        </header>
        <div className="print-block mb-3 rounded border border-black p-2">
          <h2 className="font-black">DRYLAND COMMUN</h2>
          {commonDry.length > 0 ? commonDry.map((block) => (
            <div key={block.id} className="text-sm">
              {showAthleteNames && <strong>{block.assignments.map((assignment) => fullName(assignment.athlete.user)).join(" · ")}</strong>}{showAthleteNames ? " · " : ""}{block.drylandExercises.map((item) => `${item.exercise.name} ${item.sets ?? 1} x ${item.reps ?? `${item.duration ?? 30} sec`}`).join(" · ")}
              {showCoachNotes && block.description && <p className="ml-2">{block.description}</p>}
              {showCoachNotes && block.drylandExercises.some((item) => item.notes) && <p className="ml-2">{block.drylandExercises.filter((item) => item.notes).map((item) => `${item.exercise.name} : ${item.notes}`).join(" · ")}</p>}
            </div>
          )) : <p className="text-sm">Aucun bloc dryland partage.</p>}
        </div>
        <h2 className="mb-2 font-black">ENTRAINEMENTS PISCINE INDIVIDUELS</h2>
        <div className={`grid gap-2 ${activeAthletes.length > 6 ? "grid-cols-4" : "grid-cols-3"}`}>
          {activeAthletes.map((athlete) => {
            const poolBlock = session.blocks.find((block) => block.type === "POOL" && block.assignments.some((assignment) => assignment.athleteId === athlete.id));
            const sections = poolBlock?.poolTraining?.sections ?? [];
            const total = sections.reduce((sum, section) => sum + sectionTotal(section), 0);

            return (
              <div key={athlete.id} className="print-athlete-card min-h-52 border border-black p-2 text-xs">
                {showAthleteNames && <h3 className="text-base font-black">{fullName(athlete.user)}</h3>}
                <table className="mt-1 w-full border-collapse"><thead><tr className="border-b border-black text-left"><th>Hauteur</th><th>Plongeon</th><th>Reps</th>{repetitionChecks && <th>Fait</th>}</tr></thead><tbody>{sections.flatMap((section) => section.dives.map((dive) => <tr key={dive.id} className="border-b border-black/30"><td>{section.label ?? section.height}</td><td>{dive.diveCode}</td><td>{dive.repetitions}</td>{repetitionChecks && <td>{Array.from({ length: dive.repetitions }, (_, index) => <span key={index} className="mr-1 inline-block h-3 w-3 border border-black" />)}</td>}</tr>))}</tbody></table>
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
            <h1 className="mb-3 border-b-2 border-black pb-2 text-2xl font-black">FICHE INDIVIDUELLE{showAthleteNames ? ` · ${fullName(athlete.user)}` : ""}</h1>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="print-block"><h2 className="font-black">DRYLAND</h2>{blocks.filter((block) => block.type === "DRYLAND").map((block) => <div key={block.id}>{showCoachNotes && block.description && <p>{block.description}</p>}{block.drylandExercises.map((item) => <div key={item.exerciseId}><p>□ {item.exercise.name} · {item.sets ?? 1} x {item.reps ?? `${item.duration ?? 30} sec`}</p>{showCoachNotes && item.notes && <p className="ml-4">{item.notes}</p>}</div>)}</div>)}</div>
              <div className="print-block">{session.focus && <><h2 className="font-black">OBJECTIFS</h2><p>{session.focus}</p></>}{showCoachNotes && session.notes && <><h2 className="mt-3 font-black">NOTES DU COACH</h2><p>{session.notes}</p></>}<div className="mt-4 h-28 border border-black p-2">Notes à écrire</div></div>
              {poolBlock && <div className="print-block col-span-2"><h2 className="font-black">LISTE PISCINE</h2>{showCoachNotes && poolBlock.description && <p>{poolBlock.description}</p>}<table className="w-full border-collapse"><thead><tr className="border-b border-black text-left"><th>Hauteur</th><th>Plongeon</th><th>Répétitions</th>{repetitionChecks && <th>Fait</th>}</tr></thead><tbody>{poolBlock.poolTraining?.sections.flatMap((section) => section.dives.map((dive) => <tr key={dive.id} className="border-b border-black/30"><td>{section.label ?? section.height}</td><td>{dive.diveCode}</td><td>{dive.repetitions}</td>{repetitionChecks && <td>{Array.from({ length: dive.repetitions }, (_, index) => <span key={index} className="mr-1 inline-block h-3 w-3 border border-black" />)}</td>}</tr>))}</tbody><tfoot><tr className="border-t-2 border-black font-black"><td colSpan={repetitionChecks ? 3 : 2}>Total général</td><td>{poolBlock.estimatedVolume}</td></tr></tfoot></table></div>}
            </div>
          </section>
        );
      })}

      <section className="print-page mx-auto mt-4 max-w-6xl bg-white p-6 print:max-w-none">
        <h1 className="mb-3 border-b-2 border-black pb-2 text-2xl font-black">PAR ATELIER</h1>
        {session.blocks.filter((block) => ["DRYLAND", "POOL"].includes(block.type)).map((block) => (
          <div key={block.id} className="print-block mb-3 border border-black p-2">
            <h2 className="font-black">{block.title}</h2>
            {showAthleteNames && <p>{block.assignments.length > 1 ? "Partagé par " : "Assigné à "}{block.assignments.map((assignment) => fullName(assignment.athlete.user)).join(" · ")}</p>}
            {showCoachNotes && block.description && <p>{block.description}</p>}
          </div>
        ))}
      </section>
    </div>
  );
}

function sectionTotal(section: { label: string | null; dives: Array<{ repetitions: number }> }) {
  return Math.max(1, countPoolContexts(section.label ?? "")) * section.dives.reduce((sum, dive) => sum + dive.repetitions, 0);
}

function fullName(user: { firstName: string; lastName: string }) {
  return `${user.firstName} ${user.lastName}`;
}
