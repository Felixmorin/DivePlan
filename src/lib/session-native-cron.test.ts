import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("native lifecycle preserves grace, absences, history and atomicity; API roles cannot invoke it", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
      CREATE TYPE "CompletionStatus" AS ENUM ('COMPLETED','SKIPPED','IN_PROGRESS');
      CREATE TABLE "TrainingSession" (id text PRIMARY KEY,status text,date timestamp,duration int);
      CREATE TABLE "SessionBlock" (id text PRIMARY KEY,"sessionId" text);
      CREATE TABLE "SessionBlockAssignment" ("sessionBlockId" text,"athleteId" text);
      CREATE TABLE "AthleteSessionAbsence" ("sessionId" text,"athleteId" text);
      CREATE TABLE "AthleteSessionCompletion" ("athleteId" text,"sessionId" text,"startedAt" timestamp,"completedAt" timestamp,status "CompletionStatus",PRIMARY KEY("athleteId","sessionId"));
      INSERT INTO "TrainingSession" VALUES
        ('expired','READY','2026-10-27 10:00',60),
        ('grace','READY','2026-10-27 11:00',60),
        ('future','READY','2026-10-27 13:00',60),
        ('old','COMPLETED','2026-01-01',60),
        ('draft','DRAFT','2026-01-01',60);
      INSERT INTO "SessionBlock" VALUES ('be','expired'),('be2','expired'),('bo','old');
      INSERT INTO "SessionBlockAssignment" VALUES ('be','present'),('be2','present'),('be','absent'),('bo','historic');
      INSERT INTO "AthleteSessionAbsence" VALUES ('expired','absent');
      INSERT INTO "AthleteSessionCompletion" VALUES ('historic','old','2026-01-01','2026-01-01 02:00','COMPLETED');
    `);
    const migration = readFileSync("db/migrations/0029_session_lifecycle_function.sql", "utf8");
    await db.exec(migration);
    await db.exec(migration); // Safe function/permission recreation during setup.
    const tick = async (now: string) => (await db.query<{started_count:number;completed_count:number}>(`SELECT * FROM public.diveplan_sync_session_lifecycle($1::timestamp)`, [now])).rows[0];
    assert.deepEqual(await tick("2026-10-27 12:00"), {started_count:1,completed_count:1});
    assert.deepEqual(await tick("2026-10-27 12:01"), {started_count:0,completed_count:0});
    const states = (await db.query<{id:string;status:string}>(`SELECT id,status FROM "TrainingSession"`)).rows;
    assert.equal(states.find(s=>s.id==="grace")?.status,"IN_PROGRESS");
    assert.equal(states.find(s=>s.id==="future")?.status,"READY");
    assert.equal(states.find(s=>s.id==="draft")?.status,"DRAFT");
    const completions = (await db.query<{athleteId:string;status:string;completedAt:string}>(`SELECT "athleteId",status,"completedAt"::text FROM "AthleteSessionCompletion"`)).rows;
    assert.equal(completions.length,3,"duplicate block assignments create one completion");
    assert.equal(completions.find(c=>c.athleteId==="present")?.status,"COMPLETED");
    assert.equal(completions.find(c=>c.athleteId==="absent")?.status,"SKIPPED");
    assert.equal(completions.find(c=>c.athleteId==="historic")?.completedAt,"2026-01-01 02:00:00");
    assert.equal((await tick("2026-10-27 12:30")).completed_count,1,"closes exactly after duration plus thirty minutes");
    for (const role of ["anon","authenticated","service_role"]) {
      const permissions = await db.query<{allowed:boolean}>(`SELECT has_function_privilege($1,'public.diveplan_sync_session_lifecycle(timestamp without time zone)','EXECUTE') AS allowed`,[role]);
      assert.equal(permissions.rows[0].allowed,false,role);
    }
    await db.exec(`
      CREATE FUNCTION reject_test_completion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."athleteId"='explode' THEN RAISE EXCEPTION 'fixture insert failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_test_completion BEFORE INSERT ON "AthleteSessionCompletion" FOR EACH ROW EXECUTE FUNCTION reject_test_completion();
      INSERT INTO "TrainingSession" VALUES ('failure','READY','2026-01-01',60);
      INSERT INTO "SessionBlock" VALUES ('bf','failure'); INSERT INTO "SessionBlockAssignment" VALUES ('bf','explode');
    `);
    await assert.rejects(tick("2026-10-27 12:31"),/fixture insert failure/);
    assert.equal((await db.query<{status:string}>(`SELECT status FROM "TrainingSession" WHERE id='failure'`)).rows[0].status,"READY","completion failure rolls back the status transition");
    await db.exec(`DELETE FROM "TrainingSession" WHERE id='failure';
      SET TIME ZONE 'Pacific/Honolulu';
      INSERT INTO "TrainingSession" VALUES ('utc','READY',(now() AT TIME ZONE 'UTC')-INTERVAL '1 minute',60);`);
    await db.query(`SELECT * FROM public.diveplan_sync_session_lifecycle()`);
    assert.equal((await db.query<{status:string}>(`SELECT status FROM "TrainingSession" WHERE id='utc'`)).rows[0].status,"IN_PROGRESS","default clock is UTC even when the connection timezone differs");
  } finally { await db.close(); }
});

test("Hobby schedules stay daily; native setup updates its named jobs and scopes log retention", async () => {
  const vercel = JSON.parse(readFileSync("vercel.json","utf8"));
  for (const job of vercel.crons) {
    const fields = job.schedule.split(" ");
    assert.match(fields[0],/^\d+$/); assert.match(fields[1],/^\d+$/);
  }
  const db = new PGlite();
  try {
    // PGlite has no pg_cron worker. Exercise the setup SQL against its documented
    // named-job upsert interface; actual worker activation is verified in Supabase.
    await db.exec(`CREATE SCHEMA cron;
      CREATE TABLE cron.job (jobid serial PRIMARY KEY,jobname text UNIQUE,schedule text,command text,active boolean DEFAULT true);
      CREATE TABLE cron.job_run_details (jobid int,end_time timestamptz);
      CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$
        INSERT INTO cron.job(jobname,schedule,command) VALUES ($1,$2,$3)
        ON CONFLICT (jobname) DO UPDATE SET schedule=EXCLUDED.schedule,command=EXCLUDED.command,active=true RETURNING jobid::bigint;
      $$;`);
    const script = readFileSync("db/operations/enable-session-cron.sql","utf8").replace('CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;','');
    await db.exec(script); await db.exec(script);
    const jobs=(await db.query<{jobid:number;jobname:string;schedule:string;command:string}>(`SELECT * FROM cron.job ORDER BY jobname`)).rows;
    assert.equal(jobs.length,2);
    const lifecycle=jobs.find(j=>j.jobname==="diveplan-session-lifecycle")!;
    assert.equal(lifecycle.schedule,"* * * * *");assert.ok(!/http|net\./i.test(lifecycle.command));
    const cleanup=jobs.find(j=>j.jobname.endsWith("history-cleanup"))!;
    await db.exec(`INSERT INTO cron.job VALUES (999,'unrelated','0 0 * * *','SELECT 1',true);
      INSERT INTO cron.job_run_details VALUES (${lifecycle.jobid},now()-INTERVAL '8 days'),(${lifecycle.jobid},now()),(999,now()-INTERVAL '8 days');`);
    await db.exec(cleanup.command);
    assert.equal((await db.query(`SELECT * FROM cron.job_run_details`)).rows.length,2,"only our expired log is pruned");
  } finally { await db.close(); }
});
