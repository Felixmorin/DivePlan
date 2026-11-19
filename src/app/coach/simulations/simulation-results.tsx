"use client";

import { ChevronRight } from "lucide-react";
import { useId, useState } from "react";
import Link from "@/components/ui/app-link";
import type { RankedCompetitionAthlete } from "@/lib/competition-results";
import { APP_LOCALE } from "@/lib/timezone";
import styles from "./simulations.module.css";

const pointsFormat = new Intl.NumberFormat(APP_LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ratingFormat = new Intl.NumberFormat(APP_LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 2 });

export function SimulationResults({ sessionId, results }: { sessionId: string; results: RankedCompetitionAthlete[] }) {
  const [selectedId, setSelectedId] = useState(results[0]?.athleteId);
  const panelId = useId();
  const index = Math.max(0, results.findIndex((athlete) => athlete.athleteId === selectedId));
  const result = results[index];

  if (!result) {
    return <p className={`${styles.panel} mt-4 text-sm text-[var(--color-ink-muted)]`}>Aucun passage enregistré pour cette simulation.</p>;
  }

  const initials = result.athleteName.trim().split(/\s+/).slice(0, 2).map((word) => Array.from(word)[0]).join("").toLocaleUpperCase(APP_LOCALE);

  return (
    <div className={styles.results}>
      <section className={styles.panel}>
        <h2 className={styles.sectionTitle}>Classement</h2>
        <ol className={styles.ranking}>
          {results.map((athlete, rank) => (
            <li key={athlete.athleteId}>
              <button
                type="button"
                className={styles.rankButton}
                aria-pressed={rank === index}
                aria-controls={panelId}
                onClick={() => setSelectedId(athlete.athleteId)}
              >
                <span className={styles.rankNumber}>{rank + 1}</span>
                <span className={styles.rankName}>{athlete.athleteName}</span>
                <span className={styles.rankPoints}>
                  {athlete.scoredPassages ? pointsFormat.format(athlete.totalPoints) : "—"}
                  {athlete.missingPassages > 0 && <small>{athlete.scoredPassages}/{athlete.passages.length} notés</small>}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      <section id={panelId} aria-labelledby={`${panelId}-name`} className={styles.panel}>
        <header className={styles.athleteHeader}>
          <span className={styles.initials} aria-hidden="true">{initials}</span>
          <div className={styles.athleteInfo}>
            <h2 id={`${panelId}-name`}>{result.athleteName}</h2>
            <p>{index === 0 ? "1er" : `${index + 1}e`} sur {results.length} · {result.passages.length} {result.passages.length === 1 ? "passage" : "passages"}</p>
          </div>
          <div className={styles.total}>
            <strong>{result.scoredPassages ? `${pointsFormat.format(result.totalPoints)} pts` : "—"}</strong>
            {result.missingPassages > 0 && <small>{result.scoredPassages}/{result.passages.length} passages notés</small>}
          </div>
        </header>

        <h3 className={styles.sectionTitle}>Plongeons</h3>
        <div key={result.athleteId} className={styles.passages}>
          <div className={`${styles.passageGrid} ${styles.columnHeaders}`} aria-hidden="true">
            <span>Passage</span><span>Plongeon</span><span>DD</span><span>Points</span>
          </div>
          {result.passages.map(({ turn, turnIndex, scores, discardedScores, points }, passageIndex) => (
            <details key={turnIndex} name={`${panelId}-passages`} className={styles.passage}>
              <summary className={`${styles.passageGrid} ${styles.passageSummary}`}>
                <span className={styles.passageIndex}>
                  <ChevronRight className={styles.passageChevron} aria-hidden="true" />
                  <span className={styles.rankNumber}><span className="sr-only">Passage </span>{passageIndex + 1}</span>
                </span>
                <span className={styles.dive}><strong>{turn.diveCode}</strong><span>{turn.diveName}</span></span>
                <span><span className="sr-only">DD </span>{turn.difficulty == null ? "—" : ratingFormat.format(turn.difficulty)}</span>
                <strong className={styles.passagePoints}><span className="sr-only">Points </span>{points == null ? "—" : pointsFormat.format(points)}</strong>
              </summary>
              <div className={styles.notes}>
                {scores.some((score) => !score.judgeCoachId) && (
                  <div className={styles.noteGroup}>
                    <strong>Notes des juges</strong>
                    {scores.filter((score) => !score.judgeCoachId).map((score, judgeIndex) => (
                      <span key={judgeIndex} className={styles.note} data-discarded={discardedScores.includes(score)}>
                        <span aria-label={`Juge ${judgeIndex + 1}`}>J{judgeIndex + 1}</span>
                        <strong>{ratingFormat.format(score.rating)}</strong>
                        {discardedScores.includes(score) && <span className="sr-only">Écartée</span>}
                      </span>
                    ))}
                  </div>
                )}
                {scores.some((score) => score.judgeCoachId) && (
                  <div className={styles.coachNotes}>
                    <strong>Note coach</strong>
                    {scores.filter((score) => score.judgeCoachId).map((score, coachIndex) => (
                      <span key={coachIndex} className={styles.coachNote} data-discarded={discardedScores.includes(score)}>
                        <strong>{ratingFormat.format(score.rating)}</strong>
                        {discardedScores.includes(score) && <span className="sr-only">Écartée</span>}
                      </span>
                    ))}
                  </div>
                )}
                {scores.length === 0 && <span>Aucune note enregistrée</span>}
              </div>
            </details>
          ))}
        </div>
        <Link className={styles.editLink} href={`/coach/simulations/${sessionId}`}>Corriger les plongeons</Link>
      </section>
    </div>
  );
}
