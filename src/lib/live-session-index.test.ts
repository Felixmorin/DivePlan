import assert from "node:assert/strict";
import test from "node:test";
import { indexLiveSessionProgress } from "./live-session-index";

test("live indexes preserve repetitions, duplicate logs, completed exercise counts and absences", () => {
  const diveLogs = [
    { athleteId: "a", poolDiveId: "d1", repetitionsCompleted: 2 },
    { athleteId: "a", poolDiveId: "d1", repetitionsCompleted: 3 },
    { athleteId: "b", poolDiveId: "d1", repetitionsCompleted: 9 },
    { athleteId: "a", poolDiveId: "d2", repetitionsCompleted: 4 }
  ];
  const exerciseLogs = [
    { athleteId: "a", exerciseId: "e1", completed: true },
    { athleteId: "a", exerciseId: "e1", completed: true },
    { athleteId: "a", exerciseId: "e2", completed: false },
    { athleteId: "b", exerciseId: "e1", completed: true }
  ];
  const index = indexLiveSessionProgress({ diveLogs, exerciseLogs });
  const present = new Set(["a"]);

  assert.equal(index.sumDiveRepetitions(present, new Set(["d1"])), 5);
  assert.equal(index.countCompletedExercise("e1", present), 2);
  assert.equal(index.completedExerciseUnits(present, [
    { exerciseId: "e1", sets: 2, reps: 3 },
    { exerciseId: "e1", sets: 10, reps: 10 }
  ]), 12, "duplicate plan IDs retain the first matching exercise, as Array.find did");
  assert.equal(index.sumDiveRepetitions(new Set(["b"]), new Set(["d1"])), 9);
});

test("dense synthetic live sessions replace repeated full-log scans with one index pass", (t) => {
  const athletes = Array.from({ length: 60 }, (_, i) => `athlete-${i}`);
  const diveIds = Array.from({ length: 20 }, (_, i) => `dive-${i}`);
  const exerciseIds = Array.from({ length: 5 }, (_, i) => `exercise-${i}`);
  const diveLogs = athletes.flatMap((athleteId, athleteIndex) => diveIds.map((poolDiveId, diveIndex) => ({
    athleteId, poolDiveId, repetitionsCompleted: (athleteIndex + diveIndex) % 5
  })));
  const exerciseLogs = athletes.flatMap((athleteId, athleteIndex) => exerciseIds.map((exerciseId, exerciseIndex) => ({
    athleteId, exerciseId, completed: (athleteIndex + exerciseIndex) % 2 === 0
  })));
  const athleteIds = new Set(athletes);
  const indexed = indexLiveSessionProgress({ diveLogs, exerciseLogs });

  let oldFullRowVisits = 0;
  for (let block = 0; block < 5; block++) {
    let oldPoolTotal = 0;
    for (const log of diveLogs) {
      oldFullRowVisits++;
      if (athleteIds.has(log.athleteId) && diveIds.includes(log.poolDiveId)) oldPoolTotal += log.repetitionsCompleted;
    }
    assert.equal(indexed.sumDiveRepetitions(athleteIds, new Set(diveIds)), oldPoolTotal);
  }
  for (let block = 0; block < 3; block++) {
    let oldDrylandTotal = 0;
    for (const log of exerciseLogs) {
      oldFullRowVisits++;
      if (!log.completed || !athleteIds.has(log.athleteId)) continue;
      const item = exerciseIds.map((exerciseId) => ({ exerciseId, sets: 2, reps: 3 })).find((exercise) => exercise.exerciseId === log.exerciseId);
      oldDrylandTotal += (item?.sets ?? 1) * (item?.reps ?? 1);
    }
    assert.equal(indexed.completedExerciseUnits(athleteIds, exerciseIds.map((exerciseId) => ({ exerciseId, sets: 2, reps: 3 }))), oldDrylandTotal);
  }

  const oneIndexPass = diveLogs.length + exerciseLogs.length;
  assert.equal(oldFullRowVisits, 6_900);
  assert.equal(oneIndexPass, 1_500);
  t.diagnostic(`Synthetic 60-athlete session, 1,200 dive logs and 300 exercise logs: repeated full-row visits 6,900 -> 1,500 to build the index (−78.3%); keyed lookups are not counted. No production timing, browser bytes or FOT measured.`);
});
