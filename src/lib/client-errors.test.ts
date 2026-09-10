import assert from "node:assert/strict";
import test from "node:test";
import { isExternalWebVitalsError } from "./client-errors";

test("recognizes the injected Web Vitals startTime failure", () => {
  const error = new TypeError("Cannot read properties of undefined (reading 'startTime')");
  error.stack = `TypeError: ${error.message}\n    at et.reportAllChanges (<anonymous>:2:19429)`;

  assert.equal(isExternalWebVitalsError(error), true);
});

test("does not hide an application error with the same message", () => {
  const error = new TypeError("Cannot read properties of undefined (reading 'startTime')");
  error.stack = `TypeError: ${error.message}\n    at reportSession (session-player.tsx:42:3)`;

  assert.equal(isExternalWebVitalsError(error), false);
});

test("does not hide other external errors", () => {
  const error = new TypeError("Cannot read properties of undefined (reading 'duration')");
  error.stack = `TypeError: ${error.message}\n    at et.reportAllChanges (<anonymous>:2:19429)`;

  assert.equal(isExternalWebVitalsError(error), false);
  assert.equal(isExternalWebVitalsError("not an Error"), false);
});
