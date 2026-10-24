import assert from "node:assert/strict";
import test from "node:test";
import { analyzeSqlSourceFiles } from "@/lib/sql-agent-analysis";

test("flags broad and unpaginated SQL while preserving the source location", () => {
  const report = analyzeSqlSourceFiles([{ path: "src/lib/example.ts", content: 'await query(`SELECT * FROM "TrainingSession"`);' }]);
  assert.equal(report.queryCount, 1);
  assert.ok(report.findings.some((finding) => finding.title === "SELECT * dans une requête" && finding.location === "src/lib/example.ts:1"));
  assert.ok(report.findings.some((finding) => finding.title === "Lecture sans pagination visible"));
});

test("does not flag the unnest projection used to expand parameter arrays", () => {
  const report = analyzeSqlSourceFiles([{ path: "src/lib/bulk.ts", content: 'await query(`SELECT * FROM unnest($1::text[])`);' }]);
  assert.equal(report.queryCount, 1);
  assert.equal(report.findings.some((finding) => finding.title === "SELECT * dans une requête"), false);
});

test("does not present missing index evidence as a confirmed measurement", () => {
  const report = analyzeSqlSourceFiles([{ path: "src/lib/example.ts", content: 'await query(`SELECT id FROM "User" LIMIT 10`);' }]);
  const indexFinding = report.findings.find((finding) => finding.title === "Valider les index avec les plans de requête");
  assert.equal(indexFinding?.kind, "hypothesis");
  assert.match(indexFinding?.limits ?? "", /Aucun index manquant/);
});

test("reports duplicated SQL as a code finding rather than an observed repeat", () => {
  const sql = 'await query(`SELECT id FROM "User" WHERE id = $1`);';
  const report = analyzeSqlSourceFiles([
    { path: "src/lib/first.ts", content: sql },
    { path: "src/lib/second.ts", content: sql }
  ]);
  const duplicate = report.findings.find((finding) => finding.title === "Instruction SQL dupliquée dans le code");
  assert.equal(duplicate?.kind, "code");
  assert.match(duplicate?.limits ?? "", /ne prouve pas/);
});

test("marks an unindexed filter as a hypothesis when the Prisma schema has no matching index", () => {
  const report = analyzeSqlSourceFiles([
    { path: "prisma/schema.prisma", content: "model TrainingSession {\n id String @id\n title String\n @@index([id])\n}" },
    { path: "src/lib/example.ts", content: 'await query(`SELECT id FROM "TrainingSession" WHERE title = $1 LIMIT 1`);' }
  ]);
  const candidate = report.findings.find((finding) => finding.title === "Piste d’index à vérifier · TrainingSession.title");
  assert.equal(candidate?.kind, "hypothesis");
  assert.match(candidate?.limits ?? "", /La base peut avoir un index créé hors Prisma/);
});
