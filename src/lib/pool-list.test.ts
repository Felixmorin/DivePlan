import assert from "node:assert/strict";
import test from "node:test";
import { countPoolContexts, parseQuickPoolLine, poolListTotal } from "./pool-list";

test("calcule une ligne avec des repetitions distinctes", () => {
  const result = parseQuickPoolLine("3m (du bout): 100A, 100C, 100B", "2, 2, 2");
  assert.deepEqual(result.errors, []);
  assert.equal(result.total, 6);
});

test("multiplie une repetition commune par chaque hauteur et plongeon", () => {
  const result = parseQuickPoolLine("1m-3m : 101C, 101B, 103B", "3");
  assert.equal(result.heightCount, 2);
  assert.equal(result.total, 18);
});

test("accepte les contextes multiples avec annotations", () => {
  assert.equal(countPoolContexts("1m (2b)-3m"), 2);
  assert.equal(countPoolContexts("1m, 3m"), 2);
  assert.equal(parseQuickPoolLine("1m-3m : 101C, 101B, 103B", "2, 3, 1").total, 12);
});

test("signale les repetitions invalides ou non alignees", () => {
  assert.match(parseQuickPoolLine("3m: 101A, 201B", "2, x").errors.join(" "), /nombre entier/);
  assert.match(parseQuickPoolLine("3m: 101A, 201B, 301C", "2, 3").errors.join(" "), /exactement 3/);
});

test("additionne le total general", () => {
  const rows = [
    parseQuickPoolLine("3m: 100A, 100B", "2, 2", "a").row,
    parseQuickPoolLine("1m-3m: 101C, 101B", "3", "b").row
  ];
  assert.equal(poolListTotal(rows), 16);
});
