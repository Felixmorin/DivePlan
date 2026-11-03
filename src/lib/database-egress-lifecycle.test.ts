import assert from "node:assert/strict";
import { AsyncLocalStorage, AsyncResource } from "node:async_hooks";
import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";

test("hourly SQL aggregates flush through the response lifecycle instead of abandoned timers", async (t) => {
  const db = new PGlite();
  const requestContext = new AsyncLocalStorage<string>();
  const resources = Array.from({length:10}, () => new AsyncResource("synthetic-request"));
  try {
    await db.exec(`CREATE TABLE "DatabaseEgressTelemetryHour" ("clubId" text,hour timestamptz,route text,component text,requests int,
      "resultBytes" bigint,"durationMs" double precision,"maxDurationMs" double precision,"slowQueries" int,"updatedAt" timestamptz,
      PRIMARY KEY("clubId",hour,route,component));
      CREATE TABLE "SyntheticWork" (id text PRIMARY KEY,value text);
      INSERT INTO "SyntheticWork" VALUES ('a','synthetic-a'),('b','synthetic-b');`);
    const callbacks: Array<{request:string;run:()=>Promise<void>}> = [];
    const timers = new Map<number,()=>unknown>();
    let timerId = 0; let unavailable = false; let failWrites = false; let releaseCount = 0; let warnings = 0;
    let telemetryWrites = 0;
    let pauseWrites: Promise<void> | null = null;
    const poolQuery = async (sql: string, args: unknown[] = []) => {
      if (sql.includes('INSERT INTO "DatabaseEgressTelemetryHour"')) {
        telemetryWrites++; if (failWrites) throw new Error("Synthetic metrics failure");
        if (pauseWrites) await pauseWrites;
      }
      const result = await db.query(sql,args);
      return { ...result, rowCount: result.affectedRows ?? result.rows.length, command: sql.trim().split(/\s/)[0].toUpperCase() };
    };
    class Pool {
      query = poolQuery;
      async connect() { return { query: poolQuery, release: () => { releaseCount++; } }; }
    }
    const dependencies: Record<string, unknown> = {
      "server-only": {}, "pg": { Pool }, "node:async_hooks": { AsyncLocalStorage }, "node:perf_hooks": { performance },
      "node:fs": { readFileSync }, "node:path": path,
      "@/lib/server-request-metrics": { getSqlRequestSpan: async () => null },
      "next/server": { after: (run:()=>Promise<void>) => {
        if (unavailable) throw new Error("No request lifecycle");
        const request = requestContext.getStore(); assert.ok(request);
        callbacks.push({request,run:AsyncResource.bind(run)});
      } }
    };
    const exports: Partial<typeof import("./db")> = {};
    runInNewContext(ts.transpileModule(readFileSync("src/lib/db.ts","utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText, {
      exports, Buffer, URL, Date, performance,
      process: { env: { DATABASE_URL: "postgres://synthetic@localhost/synthetic", NODE_ENV: "production" }, cwd: () => process.cwd() },
      console: { error: () => { warnings++; } },
      setTimeout: (fn:()=>unknown) => { const id=++timerId; timers.set(id,fn); return id; }, clearTimeout: (id:number) => timers.delete(id),
      require: (name: string) => { assert.ok(name in dependencies,name); return dependencies[name]; }
    });
    const metrics = exports as typeof import("./db");
    const request = <T>(index:number, id:string, work:()=>Promise<T>) => resources[index].runInAsyncScope(() => requestContext.run(id,work));
    const rows = async () => (await db.query<{clubId:string;route:string;component:string;requests:number;resultBytes:number}>(
      `SELECT "clubId",route,component,requests,"resultBytes"::int AS "resultBytes" FROM "DatabaseEgressTelemetryHour" ORDER BY "clubId",route,component`)).rows;
    const finish = async (id:string) => {
      while (callbacks.some(item=>item.request===id)) {
        const index = callbacks.findIndex(item=>item.request===id);
        await callbacks.splice(index,1)[0].run();
      }
    };
    await t.test("short responses persist every sample without running timers", async () => {
      let expectedBytes = 0;
      await request(0,"short",async () => {
        metrics.setDatabaseEgressRoute("/coach");
        for (let i=0;i<3;i++) {
          const result = await metrics.query(`SELECT value FROM "SyntheticWork" WHERE id=$1`,["a"]);
          expectedBytes += Buffer.byteLength(JSON.stringify(result.rows));
        }
        // Identity attribution may arrive after authentication's first SQL read.
        metrics.setDatabaseEgressClub("club-a");
      });
      assert.equal((await rows()).length,0,"collection does not block the business response");
      await finish("short"); // Simulate a runtime where post-response timers never run.
      assert.equal((await rows())[0]?.requests,3);
      assert.equal((await rows())[0]?.resultBytes,expectedBytes);
      assert.equal(telemetryWrites,1,"one coalesced write per route/component");
      assert.equal(timers.size,0,"no orphan timer in a request with after support");
      await finish("short"); assert.equal(telemetryWrites,1,"no duplicate flush");
      t.diagnostic("Synthetic short response: 3 successful SQL samples retained after lifecycle completion; no timer execution. Not a production loss-rate measurement.");
    });
    await t.test("concurrent requests keep clubs, routes and components isolated", async () => {
      await Promise.all([request(1,"one",async () => {
        metrics.setDatabaseEgressClub("club-one");
        await metrics.withDatabaseEgressComponent("authentication",()=>metrics.query(`SELECT value FROM "SyntheticWork" WHERE id='a'`),"/athlete");
        await metrics.withDatabaseEgressComponent("initial_session_load",()=>metrics.query(`SELECT value FROM "SyntheticWork" WHERE id='b'`));
      }),request(2,"two",async () => {
        metrics.setDatabaseEgressClub("club-two"); metrics.setDatabaseEgressRoute("/coach/groups");
        await metrics.query(`SELECT value FROM "SyntheticWork" WHERE id='b'`);
      })]);
      assert.equal(callbacks.filter(item=>item.request==="one").length,1);
      await Promise.all([finish("one"),finish("two")]);
      const result = await rows();
      assert.deepEqual(result.filter(row=>row.clubId==="club-one").map(({route,component,requests})=>({route,component,requests})),[
        {route:"/athlete",component:"authentication",requests:1},{route:"/athlete",component:"initial_session_load",requests:1}
      ]);
      assert.equal(result.filter(row=>row.clubId==="club-two")[0].route,"/coach/groups");
      assert.equal(result.filter(row=>row.clubId==="club-two")[0].requests,1);
    });
    await t.test("transactions exclude boundaries and metrics failures do not break saved work", async () => {
      await request(3,"transaction",async () => {
        metrics.setDatabaseEgressClub("club-tx"); metrics.setDatabaseEgressRoute("/athlete/session/:id");
        await metrics.withTransaction(async tx => { await tx.query(`UPDATE "SyntheticWork" SET value='saved' WHERE id='a'`); });
      });
      failWrites=true; await finish("transaction"); failWrites=false;
      assert.equal(warnings,1); assert.equal(releaseCount,1);
      assert.equal((await db.query<{value:string}>(`SELECT value FROM "SyntheticWork" WHERE id='a'`)).rows[0].value,"saved");
      assert.ok(!(await rows()).some(row=>row.clubId==="club-tx"),"failed telemetry is best effort, without an unsafe retry");
      await request(4,"transaction-ok",async () => {
        metrics.setDatabaseEgressClub("club-ok");
        await metrics.withTransaction(async tx => { await tx.query(`SELECT value FROM "SyntheticWork" WHERE id='a'`); });
      });
      await finish("transaction-ok");
      assert.equal((await rows()).find(row=>row.clubId==="club-ok")?.requests,1);
    });
    await t.test("CLI fallback remains debounced and is cancelled when after becomes available", async () => {
      await request(5,"fallback",async () => {
        unavailable=true; metrics.setDatabaseEgressClub("club-fallback");
        await metrics.query(`SELECT value FROM "SyntheticWork" WHERE id='a'`);
        await metrics.query(`SELECT value FROM "SyntheticWork" WHERE id='b'`);
        assert.equal(timers.size,1);
        unavailable=false;
        await metrics.query(`SELECT value FROM "SyntheticWork" WHERE id='a'`);
      });
      assert.equal(timers.size,0); await finish("fallback");
      assert.equal((await rows()).find(row=>row.clubId==="club-fallback")?.requests,3);
      await request(6,"cli",async () => {
        unavailable=true; metrics.setDatabaseEgressClub("club-cli");
        await metrics.query(`SELECT value FROM "SyntheticWork" WHERE id='b'`);
      });
      for (const callback of [...timers.values()]) await callback(); timers.clear(); unavailable=false;
      assert.equal((await rows()).find(row=>row.clubId==="club-cli")?.requests,1);
    });
    await t.test("the lifecycle awaits metric writes and retains samples arriving during a flush", async () => {
      let lateQuery: (()=>Promise<unknown>) | undefined;
      await request(8,"awaited",async () => {
        metrics.setDatabaseEgressClub("club-awaited");
        await metrics.query(`SELECT value FROM "SyntheticWork" WHERE id='a'`);
        lateQuery=AsyncResource.bind(()=>metrics.query(`SELECT value FROM "SyntheticWork" WHERE id='b'`));
      });
      let release!: ()=>void;
      pauseWrites=new Promise<void>(resolve=>{release=resolve;});
      let settled=false;
      const finishing=finish("awaited").then(()=>{settled=true;});
      try {
        await Promise.resolve();
        assert.equal(settled,false,"waitUntil callback must await the INSERT promise");
        await lateQuery!();
        assert.equal(callbacks.filter(item=>item.request==="awaited").length,1,"late sample schedules a second owned batch");
      } finally { release(); await finishing; pauseWrites=null; }
      assert.equal((await rows()).find(row=>row.clubId==="club-awaited")?.requests,2);
    });
    await t.test("a rolled-back mutation preserves its original error and business value", async () => {
      await request(9,"rollback",async () => {
        metrics.setDatabaseEgressClub("club-rollback");
        await assert.rejects(metrics.withTransaction(async tx => {
          await tx.query(`UPDATE "SyntheticWork" SET value='must-rollback' WHERE id='a'`);
          throw new Error("Synthetic business failure");
        }),/Synthetic business failure/);
      });
      await finish("rollback");
      assert.equal((await db.query<{value:string}>(`SELECT value FROM "SyntheticWork" WHERE id='a'`)).rows[0].value,"saved");
      assert.equal((await rows()).find(row=>row.clubId==="club-rollback")?.requests,1,"successful SQL remains observable even when its transaction rolls back");
    });
    await t.test("unattributed requests do not write a club aggregate", async () => {
      const before=telemetryWrites;
      await request(7,"anonymous",async () => { await metrics.query(`SELECT value FROM "SyntheticWork" WHERE id='a'`); });
      await finish("anonymous"); assert.equal(telemetryWrites,before);
    });
  } finally { resources.forEach(resource=>resource.emitDestroy()); await db.close(); }
});
