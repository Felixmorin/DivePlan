import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";

test("athlete monitoring executes the real PostgreSQL upsert without losing actions or ownership", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'COACH', 'ATHLETE');
      CREATE TABLE "User" (id text PRIMARY KEY);
      CREATE TABLE "Club" (id text PRIMARY KEY);
      CREATE TABLE "TrainingGroup" (id text PRIMARY KEY);
      INSERT INTO "User" VALUES ('a'), ('b'), ('c');
      INSERT INTO "Club" VALUES ('club-a'), ('club-b');`);
    await db.exec(readFileSync("prisma/migrations/20260826200000_auth_invites_monitoring/migration.sql", "utf8"));
    let identity = { user: { id: "a" }, clubId: "club-a" };
    let denied = false;
    let queries = 0;
    const exports: { POST?: (request: Request) => Promise<Response> } = {};
    const code = ts.transpileModule(readFileSync("src/app/api/athlete/monitoring/route.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText;
    const dependencies: Record<string, unknown> = {
      "next/server": { NextResponse: Response },
      "@/lib/current-user": { requireAthlete: async () => {
        if (denied) throw new Error("athlete access denied");
        return identity;
      } },
      "@/lib/db": { query: (sql: string, args: unknown[]) => { queries++; return db.query(sql, args); } }
    };
    runInNewContext(code, { exports, require: (name: string) => {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    } });
    const post = (body: unknown) => exports.POST!(new Request("https://app.test/api/athlete/monitoring", {
      method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" }
    }));
    const visitId = randomUUID();
    const event = async (id = visitId) => (await db.query<{
      userId: string; clubId: string; type: string; metadata: { actions: { action: string; path: string; at: string }[] }
    }>(`SELECT "userId", "clubId", type, metadata FROM "AppEvent" WHERE id = $1`, [id])).rows[0];

    await t.test("first action and concurrent appends retain text, timestamps and one visit row", async () => {
      assert.equal((await post({ visitId, action: "  Ouverture de l’application  ", path: "/athlete" })).status, 200);
      const actions = ["Clic : Séance", "Clic : Plongeons", "Navigation"];
      const replies = await Promise.all(actions.map(action => post({ visitId, action, path: "/athlete/sessions/synthetic" })));
      assert.ok(replies.every(reply => reply.status === 200));
      const row = await event();
      assert.equal(row.userId, "a"); assert.equal(row.clubId, "club-a"); assert.equal(row.type, "athlete.visit");
      assert.equal(row.metadata.actions[0].action, "Ouverture de l’application");
      assert.deepEqual(row.metadata.actions.slice(1).map(item => item.action).sort(), actions.sort());
      assert.ok(row.metadata.actions.every(item => Number.isFinite(Date.parse(item.at))));
      assert.equal(row.metadata.actions[1].path, "/athlete/sessions/synthetic");
      assert.equal((await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM "AppEvent"`)).rows[0].count, 1);
      assert.equal(queries, 4, "one SQL upsert per action, no additional reads");
    });
    await t.test("another user in the same club or another club cannot append to a visit", async () => {
      const before = await event();
      for (const [id, clubId] of [["b", "club-a"], ["c", "club-b"]]) {
        identity = { user: { id }, clubId };
        assert.equal((await post({ visitId, action: "Other action", path: "/athlete" })).status, 200);
        assert.deepEqual(await event(), before);
      }
      identity = { user: { id: "a" }, clubId: "club-a" };
    });
    await t.test("null metadata is initialized but another event type is preserved", async () => {
      const emptyId = randomUUID(); const otherId = randomUUID();
      await db.query(`INSERT INTO "AppEvent" (id, type, message, "userId", "clubId") VALUES ($1, 'athlete.visit', 'synthetic', 'a', 'club-a'), ($2, 'other', 'synthetic', 'a', 'club-a')`, [emptyId, otherId]);
      for (const id of [emptyId, otherId]) assert.equal((await post({ visitId: id, action: "Action", path: "/outside" })).status, 200);
      assert.equal((await event(emptyId)).metadata.actions[0].path, "/athlete");
      assert.equal((await event(otherId)).metadata, null);
    });
    await t.test("invalid input and denied athlete access never reach SQL", async () => {
      const before = queries;
      for (const body of [null, {}, { visitId: "invalid", action: "Action", path: "/athlete" }, { visitId, action: " ", path: "/athlete" }]) {
        assert.equal((await post(body)).status, 400);
      }
      denied = true;
      await assert.rejects(post({ visitId, action: "Action", path: "/athlete" }), /athlete access denied/);
      assert.equal(queries, before);
    });
  } finally {
    await db.close();
  }
});
