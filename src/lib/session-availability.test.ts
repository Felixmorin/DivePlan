import assert from "node:assert/strict";
import test from "node:test";
import { isSessionStartAvailable } from "@/lib/session-availability";

test("a session is unavailable before its scheduled start", () => {
  assert.equal(isSessionStartAvailable("2026-09-10T20:00:00.000Z", new Date("2026-09-10T19:59:59.999Z")), false);
});

test("a session becomes available exactly at its scheduled start", () => {
  assert.equal(isSessionStartAvailable("2026-09-10T20:00:00.000Z", new Date("2026-09-10T20:00:00.000Z")), true);
});

test("a session remains available after its scheduled start", () => {
  assert.equal(isSessionStartAvailable(new Date("2026-09-10T20:00:00.000Z"), new Date("2026-09-10T20:30:00.000Z")), true);
});
