import assert from "node:assert/strict";
import test from "node:test";
import { buildCompetitionTurns, eligibleSimulationJudges } from "./competition-simulation";

test("simulation orders each round and excludes the current and next diver", () => {
  const turns = buildCompetitionTurns(
    [{ id: "c", name: "Cam" }, { id: "a", name: "Alex" }, { id: "b", name: "Bea" }],
    [
      { athleteId: "a", athleteName: "Alex", diveCode: "101C", diveName: "Forward", height: "ONE_METER", position: 0 },
      { athleteId: "b", athleteName: "Bea", diveCode: "201C", diveName: "Back", height: "ONE_METER", position: 0 },
      { athleteId: "c", athleteName: "Cam", diveCode: "301C", diveName: "Reverse", height: "ONE_METER", position: 0 },
      { athleteId: "a", athleteName: "Alex", diveCode: "102C", diveName: "Forward pike", height: "ONE_METER", position: 1 }
    ]
  );
  assert.deepEqual(turns.map(({ athleteId }) => athleteId), ["a", "b", "c", "a"]);
  assert.deepEqual(eligibleSimulationJudges(turns, 0), ["c"]);
  assert.deepEqual(eligibleSimulationJudges(turns, 3), ["b", "c"]);
});
