import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";

test("current athlete preserves profile and access while skipping unused photos and competition lists", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE "User" (id text, "firstName" text, "lastName" text, email text, username text,
        avatar text, role text, "clubId" text, "passwordHash" text, "passwordSetAt" timestamp, "createdAt" timestamp);
      CREATE TABLE "Club" (id text, name text, logo text, "createdAt" timestamp);
      CREATE TABLE "Athlete" (id text, "userId" text, "clubId" text, "groupId" text, "birthDate" timestamp, level text, active boolean);
      CREATE TABLE "TrainingGroup" (id text, name text, "clubId" text, "coachId" text);
      CREATE TABLE "Coach" (id text, "userId" text, "clubId" text, "planningDefaultView" text, "weekStartsOn" int,
        "printShowCoachNotes" boolean, "printShowAthleteNames" boolean, "printRepetitionChecks" boolean);
      CREATE TABLE "CompetitionDiveList" (id text, position int);
      CREATE TABLE "CompetitionDive" (id text, "athleteId" text, "listId" text, height text, position int, "createdAt" timestamp);
      INSERT INTO "Club" VALUES ('club-a','Synthetic A',NULL,NOW()),('club-b','Synthetic B',NULL,NOW());
      INSERT INTO "User" VALUES
        ('user-a','Alpha','Test','a@example.test',NULL,NULL,'ATHLETE','club-a','synthetic-hash',NOW(),NOW()),
        ('coach-user','Coach','Test','c@example.test',NULL,NULL,'COACH','club-a','synthetic-hash',NOW(),NOW()),
        ('user-b','Beta','Test','b@example.test',NULL,NULL,'ATHLETE','club-b','synthetic-hash',NOW(),NOW());
      INSERT INTO "Athlete" VALUES ('athlete-a','user-a','club-a','group-a','2010-01-01','Provincial',true),
        ('athlete-b','user-b','club-b',NULL,'2011-01-01','Relève',true);
      INSERT INTO "TrainingGroup" VALUES ('group-a','Synthetic','club-a','coach-a');
      INSERT INTO "Coach" VALUES ('coach-a','coach-user','club-a','week',1,true,true,false);
      INSERT INTO "CompetitionDiveList" VALUES ('primary',0),('secondary',1);
      INSERT INTO "CompetitionDive" VALUES ('dive-a','athlete-a','primary','ONE_METER',0,NOW()),
        ('other-list','athlete-a','secondary','THREE_METER',0,NOW()),('dive-b','athlete-b','primary','THREE_METER',0,NOW());
    `);
    const photo = `data:image/png;base64,${"A".repeat(512_000)}`;
    await db.query(`UPDATE "User" SET avatar=$1 WHERE id IN ('user-a','coach-user')`, [photo]);
    type Identity = { id: string; role: string; passwordSetAt: Date | null };
    let identity: Identity | null = { id: "user-a", role: "ATHLETE", passwordSetAt: new Date() };
    let bytes = 0;
    const reads: string[] = [];
    const query = async (sql: string, values: unknown[]) => {
      reads.push(sql);
      const result = await db.query(sql, values);
      bytes += Buffer.byteLength(JSON.stringify(result.rows));
      return result;
    };
    const dependencies: Record<string, unknown> = {
      "./pagination": {}, "@/lib/pool-list": {}, "@/lib/timezone": {},
      "next/navigation": { redirect: (path: string) => { throw new Error(`REDIRECT ${path}`); } },
      "@/lib/current-user": { getCurrentUser: async () => identity }, "@/lib/db": { query }
    };
    const exports: { getCurrentAthlete?: typeof import("./athlete-session").getCurrentAthlete; getCurrentAthleteIdentity?: () => Promise<{ id: string } | null> } = {};
    runInNewContext(ts.transpileModule(readFileSync("src/lib/athlete-session.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText, { exports, require: (name: string) => {
      assert.ok(name in dependencies, `Unexpected dependency ${name}`);
      return dependencies[name];
    } });
    const get = exports.getCurrentAthlete!;
    const getIdentity = exports.getCurrentAthleteIdentity!;
    const actual = await get();
    assert.ok(actual);
    assert.equal(reads.length, 3, "query count is unchanged");
    const afterBytes = bytes;
    // Replay the previous projections against exactly the same database rows.
    const legacyBase = (await db.query<{ athlete: object; user: object; club: object; group: object }>(`
      SELECT to_jsonb(a) AS athlete,to_jsonb(u) AS "user",to_jsonb(c) AS club,to_jsonb(g) AS "group"
      FROM "Athlete" a JOIN "User" u ON u.id=a."userId" JOIN "Club" c ON c.id=a."clubId"
      LEFT JOIN "TrainingGroup" g ON g.id=a."groupId" WHERE a."userId"=$1`, ["user-a"])).rows;
    const legacyCoach = (await db.query<{ coach: object; user: object }>(`
      SELECT to_jsonb(co) AS coach,to_jsonb(cu) AS "user" FROM "Coach" co JOIN "User" cu ON cu.id=co."userId" WHERE co.id=$1`, ["coach-a"])).rows;
    const dives = (await db.query(reads[2], ["athlete-a"])).rows;
    const beforeBytes = [legacyBase, legacyCoach, dives].reduce((sum, rows) => sum + Buffer.byteLength(JSON.stringify(rows)), 0);
    const expected = { ...legacyBase[0].athlete,
      user: { ...legacyBase[0].user, avatar: null }, club: legacyBase[0].club,
      group: { ...legacyBase[0].group, coach: { ...legacyCoach[0].coach, user: { ...legacyCoach[0].user, avatar: null } } }, competitionDives: dives };
    assert.deepEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)));
    assert.equal(actual.competitionDives.length, 1, "only this athlete's primary list is returned");
    assert.ok(!JSON.stringify(actual).includes(photo));
    assert.ok(beforeBytes - afterBytes >= 1_024_000);
    t.diagnostic(`Synthetic SQL row JSON: ${beforeBytes} -> ${afterBytes} bytes; three reads before and after`);

    // Compare both modes against the same list, including realistic additional
    // primary entries. The default remains full for profile consumers.
    await db.exec(`INSERT INTO "CompetitionDive"
      SELECT 'extra-' || n, 'athlete-a', 'primary', 'THREE_METER', n, NOW()
      FROM generate_series(1, 11) AS n`);
    bytes = 0;
    reads.length = 0;
    const full = await get();
    assert.ok(full);
    const fullBytes = bytes;
    assert.equal(full.competitionDives.length, 12);
    assert.equal(reads.length, 3);
    bytes = 0;
    reads.length = 0;
    const light = await get({ includeCompetitionDives: false });
    assert.ok(light);
    const lightBytes = bytes;
    const { competitionDives: omitted, ...profileOnly } = full;
    assert.equal(omitted.length, 12);
    assert.deepEqual(JSON.parse(JSON.stringify(light)), JSON.parse(JSON.stringify(profileOnly)));
    assert.equal("competitionDives" in light, false, "an omitted list cannot masquerade as an empty list");
    assert.equal(reads.length, 2);
    assert.ok(reads.every((sql) => !sql.includes('"CompetitionDive"')));
    assert.ok(fullBytes > lightBytes);
    t.diagnostic(`Synthetic 12-dive context SQL row JSON: ${fullBytes} -> ${lightBytes} bytes; 3 -> 2 reads per call (auth excluded)`);

    bytes = 0;
    reads.length = 0;
    assert.deepEqual(JSON.parse(JSON.stringify(await getIdentity())), { id: full.id });
    const identityBytes = bytes;
    assert.equal(reads.length, 1);
    assert.ok(reads.every((sql) => !/TrainingGroup|Coach|CompetitionDive/.test(sql)));
    t.diagnostic(`Synthetic save context SQL row JSON: ${lightBytes} -> ${identityBytes} bytes; 2 -> 1 reads (getCurrentUser/auth excluded)`);

    await t.test("progress endpoint saves the same payload using only athlete identity", async () => {
      await db.exec(`
        CREATE TABLE "TrainingSession" (id text, date timestamp, status text);
        CREATE TABLE "AthleteSessionCompletion" ("sessionId" text, "athleteId" text, status text);
        INSERT INTO "TrainingSession" VALUES ('session-a', NOW(), 'IN_PROGRESS');
        INSERT INTO "AthleteSessionCompletion" VALUES ('session-a', 'athlete-a', 'IN_PROGRESS');
      `);
      const saved: unknown[][] = [];
      const blocks = [{ id: "block-a" }];
      // Assignment/persistence boundaries are stubbed; profile and route SQL run
      // in PGlite. Existing progress tests exercise the persistence itself.
      const routeDependencies: Record<string, unknown> = {
        "next/server": { NextResponse: { json: (value: unknown, init?: ResponseInit) => Response.json(value, init) } },
        "@/lib/athlete-session": { getCurrentAthleteIdentity: getIdentity },
        "@/lib/athlete-progress": {
          getAssignedSessionBlocks: async (sessionId: string, athleteId: string) =>
            sessionId === "session-a" && athleteId === "athlete-a" ? blocks : [],
          persistAthleteProgress: async (...args: unknown[]) => { saved.push(args); }
        },
        "@/lib/db": { query },
        "@/lib/session-availability": { isSessionStartAvailable: () => true, SESSION_NOT_STARTED_MESSAGE: "not started" }
      };
      const route: { POST?: (request: Request) => Promise<Response> } = {};
      runInNewContext(ts.transpileModule(readFileSync("src/app/api/athlete/session-progress/route.ts", "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
      }).outputText, { exports: route, require: (name: string) => {
        assert.ok(name in routeDependencies, `Unexpected route dependency ${name}`);
        return routeDependencies[name];
      } });
      const payload = { sessionId: "session-a", exercises: [{ exerciseId: "exercise-a", completed: true }],
        dives: [{ poolDiveId: "dive-a", repetitionsCompleted: 5, goldenRepetitions: 1 }],
        sessionFeedback: { rating: "5", note: "Synthetic" } };
      const request = () => new Request("https://example.test/api/athlete/session-progress", {
        method: "POST", body: JSON.stringify(payload)
      });
      reads.length = 0;
      const response = await route.POST!(request());
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true });
      assert.deepEqual(JSON.parse(JSON.stringify(saved)), [[payload, "athlete-a", blocks]]);
      assert.ok(reads.every((sql) => !/TrainingGroup|Coach|CompetitionDive/.test(sql)));
      assert.equal(reads.length, 2, "identity and session status only; assignment/persistence stubbed");
      assert.equal((await route.POST!(new Request("https://example.test/api/athlete/session-progress", {
        method: "POST", body: "invalid-json"
      }))).status, 400);
      await db.exec(`UPDATE "TrainingSession" SET status='DRAFT'`);
      assert.equal((await route.POST!(request())).status, 409);
      await db.exec(`UPDATE "TrainingSession" SET status='IN_PROGRESS';
        INSERT INTO "User" SELECT 'user-c', "firstName", "lastName", email, username, avatar, role,
          "clubId", "passwordHash", "passwordSetAt", "createdAt" FROM "User" WHERE id='user-a';
        INSERT INTO "Athlete" SELECT 'athlete-c', 'user-c', "clubId", "groupId", "birthDate", level, active
          FROM "Athlete" WHERE id='athlete-a'`);
      identity = { id: "user-c", role: "ATHLETE", passwordSetAt: new Date() };
      assert.equal((await route.POST!(request())).status, 403, "another athlete in the same club is refused");
      identity = { id: "user-b", role: "ATHLETE", passwordSetAt: new Date() };
      assert.equal((await route.POST!(request())).status, 403);
      identity = null;
      assert.equal((await route.POST!(request())).status, 401);
      assert.equal(saved.length, 1, "other identities cannot persist this session");
      identity = { id: "user-a", role: "ATHLETE", passwordSetAt: new Date() };
    });

    for (const avatar of [null, "storage:synthetic", "https://example.test/photo.png"]) {
      await db.query(`UPDATE "User" SET avatar=$1`, [avatar]);
      const profile = await get();
      assert.equal(profile?.user.avatar, null);
      assert.equal(profile?.group?.coach.user.avatar, null);
    }
    identity = { id: "user-b", role: "ATHLETE", passwordSetAt: new Date() };
    reads.length = 0;
    const other = await get();
    assert.equal(other?.id, "athlete-b");
    assert.equal(other?.clubId, "club-b");
    assert.equal(other?.group, null);
    assert.equal(other?.competitionDives[0].id, "dive-b");
    assert.equal(reads.length, 2, "no coach lookup without a group");
    assert.equal((await getIdentity())?.id, "athlete-b");
    reads.length = 0;
    const otherLight = await get({ includeCompetitionDives: false });
    assert.equal(otherLight?.id, "athlete-b");
    assert.equal(otherLight?.clubId, "club-b");
    assert.equal(otherLight?.group, null);
    assert.equal(reads.length, 1);
    assert.ok(!JSON.stringify(otherLight).includes("athlete-a"));
    await db.exec(`UPDATE "Athlete" SET "clubId"='missing-club' WHERE id='athlete-b'`);
    assert.equal(await getIdentity(), null, "missing club is refused as in the full loader");
    assert.equal(await get(), null);
    await db.exec(`UPDATE "Athlete" SET "clubId"='club-b' WHERE id='athlete-b'`);
    identity = { ...identity, id: "missing" };
    assert.equal(await get(), null);
    assert.equal(await get({ includeCompetitionDives: false }), null);
    assert.equal(await getIdentity(), null);
    for (const invalid of [null, { id: "user-a", role: "COACH", passwordSetAt: new Date() }]) {
      identity = invalid;
      reads.length = 0;
      assert.equal(await get(), null);
      assert.equal(await get({ includeCompetitionDives: false }), null);
      assert.equal(await getIdentity(), null);
      assert.equal(reads.length, 0, "unauthenticated/wrong role cannot read profiles");
    }
    identity = { id: "user-a", role: "ATHLETE", passwordSetAt: null };
    await assert.rejects(getIdentity, /REDIRECT \/change-password/);
    await assert.rejects(get, /REDIRECT \/change-password/);
    await assert.rejects(() => get({ includeCompetitionDives: false }), /REDIRECT \/change-password/);
    assert.equal(reads.length, 0, "password setup guard runs before SQL");
    await t.test("identity uses the real current-user guards on each request", async () => {
      await db.exec(`ALTER TABLE "User" ADD COLUMN "accessEnabled" boolean DEFAULT true`);
      let sessionUser: { id?: string; email?: string } | null = { id: "user-a" };
      const users: { getCurrentUser?: typeof import("./current-user").getCurrentUser } = {};
      const authDependencies: Record<string, unknown> = {
        react: { cache: (fn: unknown) => fn },
        "next/navigation": dependencies["next/navigation"],
        "next/headers": { headers: async () => new Headers() },
        "@/auth": { auth: async () => sessionUser ? { user: sessionUser } : null },
        "@/lib/db": { query, setDatabaseEgressRoute() {}, setDatabaseEgressClub() {},
          withDatabaseEgressComponent: (_name: string, fn: () => unknown) => fn() }
      };
      runInNewContext(ts.transpileModule(readFileSync("src/lib/current-user.ts", "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
      }).outputText, { exports: users, process: { env: { NODE_ENV: "production" } }, require: (name: string) => {
        assert.ok(name in authDependencies, `Unexpected auth dependency ${name}`);
        return authDependencies[name];
      } });
      (dependencies["@/lib/current-user"] as { getCurrentUser: unknown }).getCurrentUser = users.getCurrentUser;
      for (const [session, expected] of [
        [{ id: "user-a" }, "athlete-a"], [{ id: "user-b" }, "athlete-b"],
        [{ email: "A@EXAMPLE.TEST" }, "athlete-a"], [{ id: "coach-user" }, null],
        [{ id: "missing", email: "a@example.test" }, null], [null, null]
      ] as const) {
        sessionUser = session;
        assert.equal((await getIdentity())?.id ?? null, expected);
      }
      sessionUser = { id: "user-a" };
      await db.exec(`UPDATE "User" SET "accessEnabled"=false WHERE id='user-a'`);
      assert.equal(await getIdentity(), null);
      await db.exec(`UPDATE "User" SET "accessEnabled"=true, "passwordSetAt"=NULL WHERE id='user-a'`);
      await assert.rejects(getIdentity, /REDIRECT \/change-password/);
      await db.exec(`UPDATE "User" SET "passwordSetAt"=NOW() WHERE id='user-a'`);
      assert.equal((await getIdentity())?.id, "athlete-a", "no shared authorization cache");
    });
  } finally { await db.close(); }
});
