import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import { z } from "zod";
import { PGlite } from "@electric-sql/pglite";

test("free coach repetitions support new dives without sessions, preserve logs, and allow correction/deletion", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "Athlete" (id text PRIMARY KEY,"clubId" text);
      CREATE TABLE "PoolSection" (id text,height text,label text);
      CREATE TABLE "PoolDive" (id text,"poolSectionId" text,"diveCode" text,"diveName" text);
      CREATE TABLE "AthleteDiveLog" (id text,"athleteId" text,"sessionId" text,"poolDiveId" text,"actualDiveCode" text,"actualDiveName" text,"familyOverride" text,"repetitionsCompleted" int,timestamp timestamp);
      CREATE TABLE "CompetitionSimulation" (id text,"sessionId" text);
      CREATE TABLE "CompetitionSimulationRepetition" ("simulationId" text,"athleteId" text,"diveCode" text,"diveName" text,height text,"completedAt" timestamp);
      INSERT INTO "Athlete" VALUES ('athlete','club'),('other','elsewhere'),('new-athlete','club');
      INSERT INTO "PoolSection" VALUES ('one','ONE_METER',NULL),('three','THREE_METER',NULL);
      INSERT INTO "PoolDive" VALUES ('dive','one','101C','Avant'),('higher','three','201B','Arrière');
      INSERT INTO "AthleteDiveLog" VALUES
        ('old','athlete','session','dive','201B','Arrière',NULL,3,'2026-01-01'),
        ('latest','athlete','session','dive','201B','Arrière',NULL,7,'2026-01-02'),
        ('height','athlete','session','higher',NULL,NULL,NULL,5,'2026-01-03'),
        ('peer','other','session','dive','201B','Arrière',NULL,99,'2026-01-04');
      INSERT INTO "CompetitionSimulation" VALUES ('sim','session');
      INSERT INTO "CompetitionSimulationRepetition" VALUES ('sim','athlete','301C','Renversé','ONE_METER','2026-01-05');`);
    const previousView = readFileSync("db/migrations/0031_competition_simulation_repetitions.sql", "utf8");
    await db.exec("CREATE OR REPLACE VIEW" + previousView.split("CREATE OR REPLACE VIEW")[1]);
    const before = (await db.query(`SELECT * FROM "AthleteDiveRepetition" ORDER BY "athleteId",timestamp`)).rows;
    await db.exec(readFileSync("db/migrations/0032_manual_dive_repetitions.sql", "utf8"));
    assert.deepEqual((await db.query(`SELECT * FROM "AthleteDiveRepetition" ORDER BY "athleteId",timestamp`)).rows, before);
    const logsBefore = (await db.query(`SELECT * FROM "AthleteDiveLog" ORDER BY id`)).rows;
    const invalidations: string[] = [];
    let authenticated = true;
    const dependencies: Record<string, unknown> = {
      crypto: { randomUUID }, zod: { z }, "next/cache": { revalidatePath: (path: string) => invalidations.push(path) },
      "next/navigation": {}, "@/lib/current-user": { requireCoach: async () => {
        if (!authenticated) throw new Error("unauthorized");
        return { clubId: "club" };
      } },
      "@/lib/monitoring": {}, "@/lib/password": {}, "@/lib/timezone": {},
      "@/lib/db": {
        query: (sql: string, args: unknown[]) => db.query(sql, args),
        withTransaction: (fn: (tx: unknown) => Promise<unknown>) => db.transaction(fn)
      }
    };
    const exports: Partial<typeof import("@/app/coach/athletes/actions")> = {};
    runInNewContext(ts.transpileModule(readFileSync("src/app/coach/athletes/actions.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText, { exports, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; } });
    const form = (changes: Record<string, string> = {}) => {
      const value = new FormData();
      Object.entries({ athleteId: "athlete", diveCode: "201B", diveName: "Arrière", height: "ONE_METER", heightLabel: "", family: "Arriere", repetitions: "5", originalName: "Arrière", originalFamily: "Arriere", ...changes })
        .forEach(([key, entry]) => value.set(key, entry));
      return value;
    };
    const add = (changes: Record<string, string> = {}) => exports.addAthleteDiveRepetitions!(form(changes));
    const total = async (athleteId = "athlete") => (await db.query<{ volume: number }>(`SELECT COALESCE(SUM("repetitionsCompleted"),0)::int AS volume FROM "AthleteDiveRepetition" WHERE "athleteId"=$1`, [athleteId])).rows[0].volume;
    assert.equal((await add()).success, true);
    assert.equal((await add({ repetitions: "2" })).success, true);
    assert.equal((await add({ diveCode: "401C", diveName: "Retourné", family: "Retourne", height: "PLATFORM", heightLabel: "5m", repetitions: "8" })).success, true);
    assert.equal((await add({ diveCode: "301C", diveName: "Renversé", family: "Renverse", heightLabel: "ONE_METER", repetitions: "3" })).success, true, "simulation-only dives also accept free repetitions");
    assert.equal((await add({ athleteId: "new-athlete", repetitions: "4" })).success, true);
    assert.equal(await total(), 34);
    assert.equal(await total("new-athlete"), 4);
    assert.deepEqual((await db.query(`SELECT * FROM "AthleteDiveLog" ORDER BY id`)).rows, logsBefore, "adding never rewrites a session");
    assert.equal((await db.query(`SELECT * FROM "AthleteDiveRepetition" WHERE "sessionId" IS NULL`)).rows.length, 5);
    assert.ok(invalidations.includes("/coach/athletes/athlete"));
    invalidations.length = 0;
    for (const repetitions of ["", "0", "-1", "1.5", "100001", "abc"]) assert.ok((await add({ repetitions })).error);
    const invalidPayloads: Record<string, string>[] = [{ athleteId: "other" }, { athleteId: "missing" }, { diveCode: "" }, { diveName: " " }, { family: "other" }, { height: "other" }, { height: "CUSTOM", heightLabel: " " }];
    for (const changes of invalidPayloads) {
      assert.ok((await add(changes)).error);
    }
    assert.equal(invalidations.length, 0);
    assert.equal(await total(), 34);
    authenticated = false;
    await assert.rejects(add(), /unauthorized/);
    authenticated = true;
    await assert.rejects(exports.updateAthleteDiveFamily!(form({ athleteId: "other" })), /introuvable/);
    await assert.rejects(exports.removeAthleteDiveFromVolume!(form({ athleteId: "other" })), /introuvable/);
    assert.equal((await add({ diveCode: "401C", diveName: "Autre nom", family: "Avant", height: "PLATFORM", heightLabel: "5m", repetitions: "2" })).success, true);
    await exports.updateAthleteDiveFamily!(form({ diveCode: "401C", height: "PLATFORM", heightLabel: "5m", diveName: "Nom corrigé", family: "Vrille", repetitions: "12", originalName: "Retourné", originalFamily: "Retourne" }));
    const corrected = (await db.query<{ diveName: string; familyOverride: string; repetitionsCompleted: number }>(`SELECT "diveName","familyOverride","repetitionsCompleted" FROM "AthleteManualDiveRepetition" WHERE "diveCode"='401C'`)).rows;
    assert.deepEqual(corrected.sort((a, b) => String(a.diveName).localeCompare(String(b.diveName))), [
      { diveName: "Autre nom", familyOverride: "Avant", repetitionsCompleted: 2 },
      { diveName: "Nom corrigé", familyOverride: "Vrille", repetitionsCompleted: 12 }
    ]);
    await exports.updateAthleteDiveFamily!(form({ repetitions: "0" }));
    await exports.updateAthleteDiveFamily!(form({ repetitions: "20" }));
    assert.equal((await db.query<{ volume: number }>(`SELECT SUM("repetitionsCompleted")::int AS volume FROM "AthleteDiveRepetition" WHERE "athleteId"='athlete' AND "diveCode"='201B' AND height='ONE_METER'`)).rows[0].volume, 20, "mixed manual/session totals, including zero, are saved exactly");
    await exports.updateAthleteDiveFamily!(form({ diveCode: "301C", diveName: "Renversé", family: "Renverse", heightLabel: "ONE_METER", repetitions: "6", originalName: "Renversé", originalFamily: "Renverse" }));
    assert.equal((await db.query<{ volume: number }>(`SELECT SUM("repetitionsCompleted")::int AS volume FROM "AthleteDiveRepetition" WHERE "diveCode"='301C'`)).rows[0].volume, 6, "simulation volume is not counted twice");
    await assert.rejects(exports.updateAthleteDiveFamily!(form({ diveCode: "301C", heightLabel: "ONE_METER", repetitions: "0", originalName: "Renversé", originalFamily: "Renverse" })), /simulation/);
    await exports.removeAthleteDiveFromVolume!(form({ diveCode: "401C", height: "PLATFORM", heightLabel: "5m", originalName: "Nom corrigé", originalFamily: "Vrille" }));
    assert.deepEqual((await db.query(`SELECT "diveName","repetitionsCompleted" FROM "AthleteDiveRepetition" WHERE "diveCode"='401C'`)).rows, [{ diveName: "Autre nom", repetitionsCompleted: 2 }], "deletion preserves other names/families at the same height");
    await db.exec(`DELETE FROM "Athlete" WHERE id='new-athlete'`);
    assert.equal(await total("new-athlete"), 0, "manual entries follow athlete deletion");
  } finally { await db.close(); }
});
