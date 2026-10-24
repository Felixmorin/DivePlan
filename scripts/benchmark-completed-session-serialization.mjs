// Compare the legacy full CoachSession shape with the completed-page prop shape.
// Run with: node scripts/benchmark-completed-session-serialization.mjs
import { Buffer } from "node:buffer";

const athletes = Array.from({ length: 24 }, (_, index) => ({
  id: `athlete-${index + 1}`,
  user: {
    id: `user-${index + 1}`,
    firstName: `Athlète${index + 1}`,
    lastName: `Nom${index + 1}`,
    email: `athlete${index + 1}@example.test`,
    avatar: null
  }
}));
const blocks = Array.from({ length: 6 }, (_, blockIndex) => {
  const id = `block-${blockIndex + 1}`;
  const type = blockIndex % 2 === 0 ? "POOL" : "DRYLAND";
  const assignments = athletes.map((athlete) => ({ id: `assignment-${id}-${athlete.id}`, sessionBlockId: id, athleteId: athlete.id, athlete }));
  const drylandExercises = Array.from({ length: type === "DRYLAND" ? 8 : 0 }, (_, exerciseIndex) => ({
    blockId: id, exerciseId: `exercise-${exerciseIndex + 1}`, sets: 3, reps: 10, duration: 30,
    notes: "Garder une technique stable, contrôler le retour et adapter la charge si nécessaire.", order: exerciseIndex,
    exercise: { id: `exercise-${exerciseIndex + 1}`, name: `Exercice ${exerciseIndex + 1}`, category: "FORCE", description: "Description détaillée de l’exercice et de ses variantes techniques.", equipment: "Tapis, élastiques", defaultSets: 3, defaultReps: 10, defaultDuration: 30, roundTrip: false, tags: ["force", "coordination", "préparation"] }
  }));
  const sections = Array.from({ length: type === "POOL" ? 2 : 0 }, (_, sectionIndex) => ({
    id: `section-${id}-${sectionIndex}`, poolTrainingId: id, height: sectionIndex ? "THREE_METER" : "ONE_METER",
    label: sectionIndex ? "3 m" : "1 m", order: sectionIndex,
    dives: Array.from({ length: 12 }, (_, diveIndex) => ({
      id: `dive-${id}-${sectionIndex}-${diveIndex}`, poolSectionId: `section-${id}-${sectionIndex}`,
      diveCode: `10${diveIndex + 1}`, diveName: `Plongeon ${diveIndex + 1}`, position: "Tuck", repetitions: 4,
      notes: "Entrée verticale, conserver la ligne du corps et terminer le mouvement avec contrôle.", postSessionModified: false, order: diveIndex
    }))
  }));
  return {
    id, sessionId: "session-1", type, title: `${type === "POOL" ? "Piscine" : "Dryland"} ${blockIndex + 1}`,
    description: "Bloc de travail ciblé avec consignes détaillées pour le groupe.", duration: 25, position: blockIndex,
    estimatedVolume: 480, competitionEvaluation: false, assignments, drylandExercises,
    poolTraining: type === "POOL" ? { blockId: id, sections } : null
  };
});
const legacySession = {
  id: "session-1", date: new Date("2026-10-20T18:00:00.000Z"), title: "Séance de groupe", duration: 90,
  notes: "Bilan du groupe et points à reprendre.", weekId: "week-1", coachId: "coach-1", status: "COMPLETED",
  planningEventId: "event-1", competitionEvaluationAtStart: false,
  week: { id: "week-1", clubId: "club-1", groupId: "group-1", startDate: new Date("2026-10-19T00:00:00.000Z"), title: "Semaine 43", status: "PUBLISHED", group: { id: "group-1", name: "Groupe compétition", clubId: "club-1", coachId: "coach-1" } },
  blocks,
  completions: athletes.map((athlete) => ({ athleteId: athlete.id, sessionId: "session-1", status: "COMPLETED", startedAt: new Date("2026-10-20T18:00:00.000Z"), completedAt: new Date("2026-10-20T19:30:00.000Z"), rating: "GOOD", note: "Séance bien réalisée, garder le même rythme." , athlete })),
  absences: [{ athleteId: athletes.at(-1).id }],
  diveLogs: Array.from({ length: 24 * 18 }, (_, index) => {
    const athlete = athletes[index % athletes.length];
    const dive = blocks[Math.floor(index / 24) % blocks.length].poolTraining?.sections[0]?.dives[index % 12];
    return { id: `log-${index}`, athleteId: athlete.id, sessionId: "session-1", poolDiveId: dive?.id ?? "dive-1", familyOverride: null, actualDiveCode: null, repetitionsCompleted: index % 5, goldenRepetitions: index % 3, rating: "GOOD", note: "Bonne exécution.", timestamp: new Date("2026-10-20T18:45:00.000Z"), athlete, poolDive: { id: dive?.id ?? "dive-1", diveCode: dive?.diveCode ?? "101", diveName: dive?.diveName ?? "Plongeon" } };
  }),
  exerciseLogs: athletes.flatMap((athlete) => Array.from({ length: 8 }, (_, index) => ({
    id: `exercise-log-${athlete.id}-${index}`, athleteId: athlete.id, sessionId: "session-1", exerciseId: `exercise-${index + 1}`,
    completed: index % 4 !== 0, rating: "GOOD", note: "Conserver le contrôle.", athlete, exercise: { name: `Exercice ${index + 1}` }
  })))
};
const completedPageProps = {
  id: legacySession.id,
  date: legacySession.date,
  notes: legacySession.notes,
  week: { group: { name: legacySession.week.group.name } },
  blocks: legacySession.blocks.map((block) => ({
    id: block.id, position: block.position, title: block.title, type: block.type,
    assignments: block.assignments.map(({ id, sessionBlockId, athleteId, athlete }) => ({
      id, sessionBlockId, athleteId, athlete: { id: athlete.id, user: { firstName: athlete.user.firstName, lastName: athlete.user.lastName } }
    })),
    drylandExercises: block.drylandExercises.map((item) => ({ exerciseId: item.exerciseId, sets: item.sets, reps: item.reps, exercise: { name: item.exercise.name } })),
    poolTraining: block.poolTraining && { sections: block.poolTraining.sections.map((section) => ({
      id: section.id, label: section.label, height: section.height,
      dives: section.dives.map(({ id, diveCode, repetitions }) => ({ id, diveCode, repetitions }))
    })) }
  })),
  completions: legacySession.completions.map(({ athleteId, status, note }) => ({ athleteId, status, note })),
  absences: legacySession.absences.map(({ athleteId }) => ({ athleteId })),
  diveLogs: legacySession.diveLogs.map(({ athleteId, poolDiveId, repetitionsCompleted }) => ({ athleteId, poolDiveId, repetitionsCompleted })),
  exerciseLogs: legacySession.exerciseLogs.map(({ athleteId, exerciseId, completed }) => ({ athleteId, exerciseId, completed }))
};
const legacyBytes = Buffer.byteLength(JSON.stringify(legacySession));
const optimizedBytes = Buffer.byteLength(JSON.stringify(completedPageProps));
console.log(JSON.stringify({ scenario: "24 athlètes, 6 blocs (3 piscine et 3 dryland), 72 plongeons planifiés, 24 exercices distincts, 432 logs plongeon, 192 logs exercice", legacyBytes, optimizedBytes, savedBytes: legacyBytes - optimizedBytes, reductionPercent: Number(((1 - optimizedBytes / legacyBytes) * 100).toFixed(1)) }, null, 2));
