import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";

type Access = { id: string; role: string; clubId: string | null; coach: { id: string } | null };
type FullUser = Access & { firstName: string; avatar: string | null; club: { logo: string | null } | null };
function load<T>(path: string, dependencies: Record<string, unknown>, environment = "production") {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, {
    exports, Request, Response, process: { env: { NODE_ENV: environment } },
    require(name: string) { assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name]; }
  });
  return exports as T;
}

test("light polling authorization preserves the full-profile access decisions", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE "User" (id text PRIMARY KEY, email text, "firstName" text, "lastName" text, username text,
        role text, "accessEnabled" boolean, "passwordHash" text, "passwordSetAt" timestamp, avatar text, "clubId" text, "createdAt" timestamp);
      CREATE TABLE "Club" (id text PRIMARY KEY, name text, logo text, "createdAt" timestamp);
      CREATE TABLE "Coach" (id text, "userId" text, "planningDefaultView" text, "weekStartsOn" integer,
        "printShowCoachNotes" boolean, "printShowAthleteNames" boolean, "printRepetitionChecks" boolean);
      CREATE TABLE "Athlete" (id text, "userId" text, "groupId" text, "birthDate" timestamp, level text, active boolean);
      INSERT INTO "Club" VALUES ('club-a','Synthetic A','https://example.test/logo.png',NOW()),('club-b','Synthetic B',NULL,NOW());
      INSERT INTO "User" SELECT id,id||'@example.test','Synthetic','User',id,role,true,'synthetic-hash',NOW(),'data:image/png;base64,SYNTHETIC',club,NOW()
        FROM (VALUES ('coach-a','COACH','club-a'),('coach-b','COACH','club-b'),('athlete','ATHLETE','club-a'),('admin','ADMIN','club-a'),('no-coach','COACH','club-a'),('no-club','COACH',NULL)) AS u(id,role,club);
      INSERT INTO "Coach" VALUES ('profile-a','coach-a','week',1,true,true,false),('profile-b','coach-b','month',0,false,true,true),('profile-n','no-club','week',1,true,true,false);
      INSERT INTO "Athlete" VALUES ('athlete-profile','athlete','group-a','2010-01-01','Synthetic',true);
    `);
    let session: { user?: { id?: string; email?: string } } | null = null;
    const reads: Array<{ bytes: number; rows: unknown[] }> = [];
    const dependencies: Record<string, unknown> = {
      // Each invocation represents a fresh request; never memoize across sessions.
      react: { cache: (fn: unknown) => fn },
      "next/navigation": { redirect: () => { throw new Error("Unexpected redirect"); } },
      "next/headers": { headers: async () => new Headers({ "x-diveplan-route": "/coach/sessions/:id" }) },
      "@/auth": { auth: async () => session },
      "@/lib/db": {
        query: async (sql: string, values: unknown[]) => {
          const result = await db.query(sql, values);
          reads.push({ bytes: Buffer.byteLength(JSON.stringify(result.rows)), rows: result.rows });
          return result;
        },
        setDatabaseEgressRoute() {}, setDatabaseEgressClub() {},
        withDatabaseEgressComponent: (_name: string, fn: () => unknown) => fn()
      }
    };
    const users = load<{ getCurrentUser: () => Promise<FullUser | null>; getCurrentUserAccess: () => Promise<Access | null> }>("src/lib/current-user.ts", dependencies);
    const decision = (user: Access | null) => !user ? 401 : user.role !== "COACH" || !user.coach || !user.clubId ? 403 : 200;
    await t.test("session identity, roles, club and coach membership match the existing projection", async () => {
      for (const identity of [null, {}, { id: "missing" }, { id: "missing", email: "coach-a@example.test" },
        { email: "COACH-A@EXAMPLE.TEST" }, { id: "coach-a" }, { id: "coach-b" }, { id: "athlete" },
        { id: "admin" }, { id: "no-coach" }, { id: "no-club" }, { id: "coach-a" }]) {
        session = identity === null ? null : { user: identity };
        const full = await users.getCurrentUser();
        const light = await users.getCurrentUserAccess();
        assert.equal(decision(light), decision(full), JSON.stringify(identity));
        assert.equal(light?.id, full?.id);
        assert.equal(light?.clubId, full?.clubId);
        assert.equal(light?.role, full?.role);
        assert.equal(light?.coach?.id, full?.coach?.id);
      }
      session = null;
      const before = reads.length;
      assert.equal(await users.getCurrentUserAccess(), null);
      assert.equal(reads.length, before, "no session means no database read");
    });
    await t.test("revoking access or changing a role applies on the next request", async () => {
      session = { user: { id: "coach-a" } };
      await db.exec(`UPDATE "User" SET "accessEnabled"=false WHERE id='coach-a'`);
      assert.equal(await users.getCurrentUser(), null);
      assert.equal(await users.getCurrentUserAccess(), null);
      await db.exec(`UPDATE "User" SET "accessEnabled"=true,role='ATHLETE' WHERE id='coach-a'`);
      assert.equal(decision(await users.getCurrentUserAccess()), 403);
      await db.exec(`UPDATE "User" SET role='COACH' WHERE id='coach-a'`);
      assert.equal(decision(await users.getCurrentUserAccess()), 200);
      await db.exec(`UPDATE "User" SET "clubId"='club-b' WHERE id='coach-a'`);
      assert.equal((await users.getCurrentUserAccess())?.clubId, "club-b");
      await db.exec(`UPDATE "User" SET "clubId"='club-a' WHERE id='coach-a'`);
      await db.exec(`INSERT INTO "Coach" VALUES ('temporary','no-coach','week',1,true,true,false)`);
      session = { user: { id: "no-coach" } };
      assert.equal(decision(await users.getCurrentUserAccess()), 200);
      await db.exec(`DELETE FROM "Coach" WHERE id='temporary'`);
      assert.equal(decision(await users.getCurrentUserAccess()), 403);
    });
    await t.test("the real progress route uses the authorized club and preserves status/cache behavior", async () => {
      const route = load<{ GET: (r: Request, c: { params: Promise<{ id: string }> }) => Promise<Response> }>("src/app/api/coach/sessions/[id]/progress/route.ts", {
        "@/lib/current-user": users,
        "@/lib/live-session-progress": { getLiveSessionProgressReply: async (_id: string, club: string) => club === "club-a" ? { etag: '"synthetic"', progress: null } : null }
      });
      const get = () => route.GET(new Request("https://example.test/progress", { headers: { "if-none-match": 'W/"synthetic"' } }), { params: Promise.resolve({ id: "synthetic-session" }) });
      for (const [id, status] of [["coach-a",304],["coach-b",404],["athlete",403],["no-coach",403],["no-club",403],["missing",401]] as const) {
        session = { user: { id } };
        const response = await get();
        assert.equal(response.status, status);
        assert.equal(response.headers.get("cache-control"), "private, no-store");
      }
    });
    await t.test("development demo access stays disabled in production", async () => {
      session = { user: { id: "dev-coach" } };
      assert.equal(await users.getCurrentUserAccess(), null);
      const demo = load<typeof users>("src/lib/current-user.ts", dependencies, "development");
      const before = reads.length;
      assert.equal(decision(await demo.getCurrentUserAccess()), 200);
      assert.equal((await demo.getCurrentUserAccess())?.clubId, "dev-club");
      assert.equal(reads.length, before);
    });
    await t.test("synthetic benchmark compares the same twenty authentication reads", async (t) => {
      session = { user: { id: "coach-a" } };
      for (const [label, logo] of [["URL logo", "https://example.test/logo.png"], ["hypothetical 128 KiB inline logo", `data:image/png;base64,${"A".repeat(131072)}`]]) {
        await db.query(`UPDATE "Club" SET logo=$1 WHERE id='club-a'`, [logo]);
        let before = 0; let after = 0;
        for (let i = 0; i < 20; i += 1) {
          const full = await users.getCurrentUser();
          before += reads.at(-1)!.bytes;
          assert.equal(full?.club?.logo, logo, "profile callers retain the logo");
          assert.equal(full?.avatar, null, "existing inline-avatar filtering remains");
          await users.getCurrentUserAccess();
          after += reads.at(-1)!.bytes;
          assert.doesNotMatch(JSON.stringify(reads.at(-1)!.rows), /passwordHash|clubLogo|avatar|firstName|birthDate/);
        }
        assert.ok(after < before);
        t.diagnostic(`${label}: parsed SQL rows JSON for 20 auth reads ${before} -> ${after} bytes. Synthetic; excludes protocol/TLS, HTTP/RSC/JS, query timing and billed egress.`);
      }
    });
  } finally { await db.close(); }
});
