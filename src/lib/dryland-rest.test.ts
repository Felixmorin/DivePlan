import assert from "node:assert/strict";
import test from "node:test";
import { readDrylandRest, writeDrylandRest } from "./dryland-rest";

test("rest controls preserve coaching notes and round-trip through saved text", () => {
  assert.equal(readDrylandRest(null), 0);
  const notes = writeDrylandRest("Garder le dos droit.", 45);
  assert.equal(readDrylandRest(notes), 45);
  assert.equal(writeDrylandRest(notes, 0), "Garder le dos droit.\nRepos : 0 s");
  assert.equal(writeDrylandRest("Repos : 30 s.\nRespirer.", 60), "Repos : 60 s\nRespirer.");
  assert.equal(readDrylandRest("Consigne : Repos : 30 s"), 0);
});
