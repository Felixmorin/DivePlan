import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import ts from "typescript";
import { z } from "zod";

type Status = {
  id: string; correctionStatus: string; correctionExecutionId: string | null;
  correctionRunUrl: string | null; correctionPullRequestUrl: string | null;
  latestHistory: { at: string; event: string } | null;
};

test("correction status polling matches the migrated TEXT proposal IDs", async (t) => {
  const db = new PGlite();
  try {
    await db.exec('CREATE TABLE "User" (id TEXT PRIMARY KEY)');
    for (const migration of ["0011_ai_agents.sql", "0015_ai_agent_order.sql", "0016_pr_consolidation.sql", "0018_pr_correction_agent.sql", "0019_pr_correction_runner.sql"]) {
      await db.exec(readFileSync(`db/migrations/${migration}`, "utf8"));
    }
    const first = "11111111-1111-4111-8111-111111111111";
    const second = "22222222-2222-4222-8222-222222222222";
    const third = "33333333-3333-4333-8333-333333333333";
    const missing = "44444444-4444-4444-8444-444444444444";
    const executionId = "55555555-5555-4555-8555-555555555555";
    const history = [{ at: "2026-10-25T11:00:00Z", event: "Synthetic initial event" }, { at: "2026-10-25T12:00:00Z", event: "Synthetic status update" }];
    for (const id of [first, second, third]) {
      await db.query(`INSERT INTO "AiPrProposal" (id,title,summary) VALUES ($1,'Synthetic proposal','Synthetic evidence')`, [id]);
    }
    await db.query(`UPDATE "AiPrProposal" SET status='Approuvée', "correctionStatus"='En cours', "correctionExecutionId"=$2, history=$3::jsonb WHERE id=$1`, [first, executionId, JSON.stringify(history)]);
    await db.query(`UPDATE "AiPrProposal" SET status='Approuvée', "correctionExecutionId"=$2,"correctionStatus"='PR en brouillon prête à réviser', "correctionPullRequestUrl"='https://example.test/pull/1' WHERE id=$1`, [second, executionId]);

    let authorized = true;
    let reads = 0;
    let checks = 0;
    const dependencies: Record<string, unknown> = {
      "node:crypto": crypto,
      "next/cache": {}, zod: { z },
      "@/lib/current-user": { requireAdmin: async () => {
        checks += 1;
        if (!authorized) throw new Error("ADMIN_REQUIRED");
        return { id: "synthetic-admin" };
      } },
      "@/lib/db": { query: async (sql: string, values: unknown[]) => {
        reads += 1;
        return db.query(sql, values);
      } },
      "@/lib/pr-agent-consolidation": {},
      "@/lib/pr-correction-runner": {},
      "@/lib/monitoring": {}
    };
    const exports: { getCorrectionStatuses?: (ids: unknown) => Promise<Status[]> } = {};
    runInNewContext(ts.transpileModule(readFileSync("src/app/admin/agents/consolidation/actions.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText, { exports, require(name: string) {
      assert.ok(name in dependencies, `Unexpected dependency ${name}`);
      return dependencies[name];
    } });
    const getStatuses = exports.getCorrectionStatuses!;

    await t.test("returns only requested proposals with their latest history event and runner fields", async () => {
      const rows = await getStatuses([first, second, missing, first]);
      assert.deepEqual(Array.from(rows, (row) => row.id).sort(), [first, second]);
      const row = rows.find((item) => item.id === first)!;
      assert.equal(row.correctionStatus, "En cours");
      assert.equal(row.correctionExecutionId, executionId);
      assert.equal(row.correctionRunUrl, null);
      assert.deepEqual(row.latestHistory, history[1]);
      assert.equal("history" in row, false);
      assert.equal(rows.find((item) => item.id === second)?.correctionPullRequestUrl, "https://example.test/pull/1");
      assert.equal(reads, 1, "one query for a batch of IDs");
    });
    await t.test("reflects a later status change and handles missing or empty sets", async () => {
      await db.query(`UPDATE "AiPrProposal" SET "correctionStatus"='Bloqué' WHERE id=$1`, [first]);
      assert.equal((await getStatuses([first]))[0].correctionStatus, "Bloqué");
      assert.equal((await getStatuses([missing])).length, 0);
      const before = reads;
      assert.equal((await getStatuses([])).length, 0);
      assert.equal(reads, before, "empty authorized input makes no SQL call");
      assert.equal((await getStatuses(Array(1000).fill(first))).length, 1);
    });
    await t.test("excludes unapproved proposals and proposals without an execution", async () => {
      assert.equal((await getStatuses([third])).length, 0);
      await db.query(`UPDATE "AiPrProposal" SET status='Approuvée' WHERE id=$1`, [third]);
      assert.equal((await getStatuses([third])).length, 0);
      await db.query(`UPDATE "AiPrProposal" SET status='Refusée', "correctionExecutionId"=$2 WHERE id=$1`, [third, executionId]);
      assert.equal((await getStatuses([third])).length, 0);
      await db.query(`UPDATE "AiPrProposal" SET status='Approuvée' WHERE id=$1`, [third]);
      assert.equal((await getStatuses([third])).length, 1);
    });
    await t.test("rejects invalid or oversized inputs before reading data", async () => {
      const before = reads;
      for (const ids of [["not-a-uuid"], [first, "' OR true --"], Array(1001).fill(first), first, null]) {
        await assert.rejects(getStatuses(ids), /Liste de propositions invalide/);
      }
      assert.equal(reads, before);
    });
    await t.test("requires admin authorization even for empty or invalid input", async () => {
      authorized = false;
      const before = reads;
      const authBefore = checks;
      for (const ids of [[first], [], ["invalid"]]) await assert.rejects(getStatuses(ids), /ADMIN_REQUIRED/);
      assert.equal(checks, authBefore + 3);
      assert.equal(reads, before);
    });
  } finally { await db.close(); }
});
