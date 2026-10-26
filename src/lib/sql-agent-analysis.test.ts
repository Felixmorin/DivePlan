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

test("extracts quoted SQL identifiers from typed member query calls", () => {
  const report = analyzeSqlSourceFiles([
    { path: "prisma/schema.prisma", content: "model AiAgentRun {\n id String @id\n status String\n}" },
    { path: "src/lib/example.ts", content: 'const result = await client.query<{ id: string }>(\n  `SELECT "id" FROM "AiAgentRun" WHERE "status" = $1 LIMIT 1`\n);' }
  ]);
  assert.equal(report.queryCount, 1);
  assert.equal(report.findings.some((finding) => finding.title === "Aucun appel SQL détecté"), false);
  assert.equal(report.findings.some((finding) => finding.title === "Piste d’index à vérifier · AiAgentRun.status"), true);
});

test("extracts bare and member query calls with template and ordinary strings", () => {
  const report = analyzeSqlSourceFiles([{ path: "src/lib/example.ts", content: [
    'await query(`SELECT id FROM "User" LIMIT 1`);',
    'await tx.query("DELETE FROM \\"User\\" WHERE id=$1");',
    'await client.query<Row>(`UPDATE "User" SET name=$1 WHERE id=$2`);'
  ].join("\n") }]);
  assert.equal(report.queryCount, 3);
});

test("does not label a grouped query after a completed loop as repeated", () => {
  const report = analyzeSqlSourceFiles([{ path: "src/lib/web-push.ts", content: [
    'for (const delivery of deliveries) {',
    '  outcomes.push(delivery.id);',
    '}',
    'await query(`UPDATE "PushDelivery" SET status=$1 WHERE id=ANY($2::text[])`);'
  ].join("\n") }]);
  assert.equal(report.findings.some((finding) => finding.title === "Accès SQL potentiellement répété dans une boucle"), false);
});

test("labels a query inside a loop body as potentially repeated", () => {
  const report = analyzeSqlSourceFiles([{ path: "src/lib/example.ts", content: [
    'for (const id of ids) {',
    '  await client.query(`SELECT id FROM "User" WHERE id=$1`);',
    '}'
  ].join("\n") }]);
  assert.equal(report.findings.some((finding) => finding.title === "Accès SQL potentiellement répété dans une boucle"), true);
});
