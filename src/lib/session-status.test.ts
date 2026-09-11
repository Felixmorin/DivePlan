import assert from "node:assert/strict";
import test from "node:test";
import { getSessionCompletionDeadline, shouldCompleteSession } from "@/lib/session-status";

const startsAt = new Date("2026-09-11T18:45:00.000Z");

test("adds the 30-minute grace period to the scheduled duration", () => {
  assert.equal(
    getSessionCompletionDeadline(startsAt, 120)?.toISOString(),
    "2026-09-11T21:15:00.000Z"
  );
});

test("does not complete a session before its deadline", () => {
  assert.equal(shouldCompleteSession(startsAt, 120, new Date("2026-09-11T21:14:59.999Z")), false);
});

test("completes a session at its deadline", () => {
  assert.equal(shouldCompleteSession(startsAt, 120, new Date("2026-09-11T21:15:00.000Z")), true);
});
