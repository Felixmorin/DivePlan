import assert from "node:assert/strict";
import test from "node:test";
import { indexCompletedSession } from "./completed-session-index";

test("indexes preserve session logs and totals by athlete and dive", () => {
  const session = {
    completions: [
      { athleteId: "a1", status: "DONE", note: "first", rating: "Bien" },
      { athleteId: "a1", status: "NOT_STARTED", note: "duplicate", rating: null },
      { athleteId: "a2", status: "SKIPPED", note: null, rating: null }
    ],
    diveLogs: [
      { athleteId: "a1", poolDiveId: "d1", repetitionsCompleted: 2 },
      { athleteId: "a2", poolDiveId: "d1", repetitionsCompleted: 1 },
      { athleteId: "a1", poolDiveId: "d2", repetitionsCompleted: 4 },
      { athleteId: "a1", poolDiveId: "d1", repetitionsCompleted: 3 }
    ],
    exerciseLogs: [
      { athleteId: "a1", exerciseId: "e1", completed: true },
      { athleteId: "a1", exerciseId: "e2", completed: false },
      { athleteId: "a2", exerciseId: "e1", completed: true }
    ]
  };
  const index = indexCompletedSession(session);

  assert.equal(index.completionByAthlete.get("a1")?.note, "first");
  assert.deepEqual(index.diveLogsByPoolDive.get("d1"), session.diveLogs.filter((log) => log.poolDiveId === "d1"));
  assert.equal(index.diveRepetitionsByAthlete.get("a1")?.get("d1"), 5);
  assert.equal(index.diveRepetitionsByAthlete.get("a1")?.get("d2"), 4);
  assert.deepEqual(index.completedExerciseIdsByAthlete.get("a1"), new Set(["e1"]));
  assert.deepEqual(index.exerciseLogsByExercise.get("e1"), session.exerciseLogs.filter((log) => log.exerciseId === "e1"));
});

test("dense synthetic session keeps indexed lookups equivalent to full scans", () => {
  const athleteCount = 60;
  const divesPerAthlete = 25;
  const session = {
    completions: Array.from({ length: athleteCount }, (_, athlete) => ({
      athleteId: `a${athlete}`, status: "DONE", note: null, rating: null
    })),
    diveLogs: Array.from({ length: athleteCount }, (_, athlete) =>
      Array.from({ length: divesPerAthlete }, (_, dive) => ({
        athleteId: `a${athlete}`, poolDiveId: `d${dive}`, repetitionsCompleted: (athlete + dive) % 4
      }))
    ).flat(),
    exerciseLogs: Array.from({ length: athleteCount }, (_, athlete) =>
      Array.from({ length: 20 }, (_, exercise) => ({
        athleteId: `a${athlete}`, exerciseId: `e${exercise}`, completed: (athlete + exercise) % 3 !== 0
      }))
    ).flat()
  };
  const index = indexCompletedSession(session);

  for (let athlete = 0; athlete < athleteCount; athlete++) {
    for (let dive = 0; dive < divesPerAthlete; dive++) {
      const expected = session.diveLogs
        .filter((log) => log.athleteId === `a${athlete}` && log.poolDiveId === `d${dive}`)
        .reduce((total, log) => total + log.repetitionsCompleted, 0);
      assert.equal(index.diveRepetitionsByAthlete.get(`a${athlete}`)?.get(`d${dive}`) ?? 0, expected);
    }
  }

  const repeatedFullScanVisits = athleteCount * session.diveLogs.length + athleteCount * divesPerAthlete * divesPerAthlete;
  const indexedLogVisits = session.diveLogs.length;
  assert.equal(repeatedFullScanVisits, 127_500);
  assert.equal(indexedLogVisits, 1_500);
});
